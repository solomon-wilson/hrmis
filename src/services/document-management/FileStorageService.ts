import { supabase } from '../../database/supabase';
import { DocumentCategory } from '../../models/document-management';
import { ValidationError } from '../../utils/validation';
import { logger } from '../../utils/logger';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface FileUploadRequest {
  file: Buffer;
  fileName: string;
  mimeType: string;
  employeeId: string;
  category: DocumentCategory;
  metadata?: Record<string, any>;
}

export interface UploadResult {
  filePath: string;
  fileName: string;
  fileSize: number;
  publicUrl?: string;
}

export interface StorageBucketConfig {
  bucketName: string;
  purpose: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
  retentionDays?: number;
  isPublic: boolean;
  configuration: Record<string, any>;
}

export class FileStorageService {
  private static readonly BUCKET_CONFIGS: Record<string, StorageBucketConfig> = {
    'employee-documents': {
      bucketName: 'employee-documents',
      purpose: 'EMPLOYEE_DOCUMENTS',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      retentionDays: 2555, // 7 years
      isPublic: false,
      configuration: { virusScan: true, encryptAtRest: true }
    },
    'passport-photos': {
      bucketName: 'passport-photos',
      purpose: 'PASSPORT_PHOTOS',
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      retentionDays: 1095, // 3 years
      isPublic: false,
      configuration: { maxWidth: 800, maxHeight: 800, quality: 85 }
    }
  };

  private static getBucketForCategory(category: DocumentCategory): string {
    switch (category) {
      case 'PASSPORT_PHOTO':
        return 'passport-photos';
      default:
        return 'employee-documents';
    }
  }

  private static generateFilePath(employeeId: string, category: DocumentCategory, fileName: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const uuid = uuidv4().split('-')[0];
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');

    return `employees/${employeeId}/${category.toLowerCase()}/${timestamp}/${sanitizedBaseName}_${uuid}${extension}`;
  }

  private static validateFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    category: DocumentCategory
  ): void {
    const bucketName = this.getBucketForCategory(category);
    const config = this.BUCKET_CONFIGS[bucketName];

    if (!config) {
      throw new ValidationError(`No storage configuration found for category: ${category}`, []);
    }

    // Validate file size
    if (fileBuffer.length > config.maxFileSize) {
      throw new ValidationError(
        `File size ${fileBuffer.length} exceeds maximum allowed size ${config.maxFileSize} for category ${category}`,
        []
      );
    }

    // Validate MIME type
    if (!config.allowedMimeTypes.includes(mimeType.toLowerCase())) {
      throw new ValidationError(
        `File type ${mimeType} not allowed for category ${category}. Allowed types: ${config.allowedMimeTypes.join(', ')}`,
        []
      );
    }

    // Validate file extension matches MIME type
    const extension = path.extname(fileName).toLowerCase();
    const expectedExtensions = this.getMimeTypeExtensions(mimeType);

    if (!expectedExtensions.includes(extension)) {
      throw new ValidationError(
        `File extension ${extension} does not match MIME type ${mimeType}`,
        []
      );
    }

    // Additional validation for specific categories
    if (category === 'PASSPORT_PHOTO') {
      this.validatePassportPhoto(fileBuffer, mimeType);
    }
  }

  private static getMimeTypeExtensions(mimeType: string): string[] {
    const mimeTypeMap: Record<string, string[]> = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    };

    return mimeTypeMap[mimeType.toLowerCase()] || [];
  }

  private static validatePassportPhoto(fileBuffer: Buffer, mimeType: string): void {
    if (!mimeType.startsWith('image/')) {
      throw new ValidationError('Passport photos must be image files', []);
    }

    // Additional image validation could be added here
    // e.g., checking dimensions, aspect ratio, etc.
    // For now, we'll just validate it's a reasonable image file size
    if (fileBuffer.length < 1024) { // Less than 1KB
      throw new ValidationError('Image file appears to be too small or corrupted', []);
    }
  }

  /**
   * Upload a file to Supabase storage
   */
  public static async uploadFile(request: FileUploadRequest): Promise<UploadResult> {
    try {
      // Validate the file
      this.validateFile(request.file, request.fileName, request.mimeType, request.category);

      // Generate file path
      const filePath = this.generateFilePath(request.employeeId, request.category, request.fileName);
      const bucketName = this.getBucketForCategory(request.category);

      logger.info('Uploading file to storage', {
        filePath,
        bucketName,
        category: request.category,
        employeeId: request.employeeId,
        fileSize: request.file.length
      });

      // Upload to Supabase Storage
      const client = supabase.getClient();
      const { data, error } = await client.storage
        .from(bucketName)
        .upload(filePath, request.file, {
          contentType: request.mimeType,
          metadata: {
            employeeId: request.employeeId,
            category: request.category,
            originalFileName: request.fileName,
            ...request.metadata
          }
        });

      if (error) {
        logger.error('File upload failed', {
          error: error.message,
          filePath,
          bucketName
        });
        throw new ValidationError(`File upload failed: ${error.message}`, []);
      }

      logger.info('File uploaded successfully', {
        filePath: data.path,
        bucketName
      });

      return {
        filePath: data.path,
        fileName: request.fileName,
        fileSize: request.file.length
      };

    } catch (error) {
      logger.error('File upload error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        category: request.category,
        employeeId: request.employeeId,
        fileName: request.fileName
      });
      throw error;
    }
  }

  /**
   * Generate a secure download URL for a file
   */
  public static async getDownloadUrl(filePath: string, category: DocumentCategory): Promise<string> {
    try {
      const bucketName = this.getBucketForCategory(category);
      const client = supabase.getClient();

      const { data, error } = await client.storage
        .from(bucketName)
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error) {
        logger.error('Failed to generate download URL', {
          error: error.message,
          filePath,
          bucketName
        });
        throw new ValidationError(`Failed to generate download URL: ${error.message}`, []);
      }

      return data.signedUrl;

    } catch (error) {
      logger.error('Download URL generation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filePath,
        category
      });
      throw error;
    }
  }

  /**
   * Delete a file from storage
   */
  public static async deleteFile(filePath: string, category: DocumentCategory): Promise<void> {
    try {
      const bucketName = this.getBucketForCategory(category);
      const client = supabase.getClient();

      const { error } = await client.storage
        .from(bucketName)
        .remove([filePath]);

      if (error) {
        logger.error('File deletion failed', {
          error: error.message,
          filePath,
          bucketName
        });
        throw new ValidationError(`File deletion failed: ${error.message}`, []);
      }

      logger.info('File deleted successfully', {
        filePath,
        bucketName
      });

    } catch (error) {
      logger.error('File deletion error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filePath,
        category
      });
      throw error;
    }
  }

  /**
   * List files in a directory
   */
  public static async listFiles(
    employeeId: string,
    category?: DocumentCategory,
    limit: number = 100
  ): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    try {
      const bucketName = category ? this.getBucketForCategory(category) : 'employee-documents';
      const prefix = category
        ? `employees/${employeeId}/${category.toLowerCase()}/`
        : `employees/${employeeId}/`;

      const client = supabase.getClient();
      const { data, error } = await client.storage
        .from(bucketName)
        .list(prefix, {
          limit,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        logger.error('File listing failed', {
          error: error.message,
          employeeId,
          category,
          bucketName
        });
        throw new ValidationError(`File listing failed: ${error.message}`, []);
      }

      return data.map(file => ({
        name: file.name,
        size: file.metadata?.size || 0,
        lastModified: new Date(file.updated_at || file.created_at)
      }));

    } catch (error) {
      logger.error('File listing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        employeeId,
        category
      });
      throw error;
    }
  }

  /**
   * Move a file to a different location (used for archiving)
   */
  public static async moveFile(
    currentPath: string,
    newPath: string,
    category: DocumentCategory
  ): Promise<void> {
    try {
      const bucketName = this.getBucketForCategory(category);
      const client = supabase.getClient();

      // Supabase doesn't have a direct move operation, so we copy and delete
      const { error: copyError } = await client.storage
        .from(bucketName)
        .copy(currentPath, newPath);

      if (copyError) {
        throw new ValidationError(`File copy failed: ${copyError.message}`, []);
      }

      // Delete the original file
      await this.deleteFile(currentPath, category);

      logger.info('File moved successfully', {
        from: currentPath,
        to: newPath,
        bucketName
      });

    } catch (error) {
      logger.error('File move error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        currentPath,
        newPath,
        category
      });
      throw error;
    }
  }

  /**
   * Get storage statistics for an employee
   */
  public static async getStorageStats(employeeId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    categoryCounts: Record<string, number>;
  }> {
    try {
      const stats = {
        totalFiles: 0,
        totalSize: 0,
        categoryCounts: {} as Record<string, number>
      };

      // Check both buckets
      for (const _bucketConfig of Object.values(this.BUCKET_CONFIGS)) {
        const files = await this.listFiles(employeeId, undefined, 1000);

        for (const file of files) {
          stats.totalFiles++;
          stats.totalSize += file.size;

          // Extract category from file path
          const pathParts = file.name.split('/');
          if (pathParts.length >= 3) {
            const category = pathParts[2].toUpperCase();
            stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;
          }
        }
      }

      return stats;

    } catch (error) {
      logger.error('Storage stats error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        employeeId
      });
      throw error;
    }
  }

  /**
   * Validate storage quota for employee
   */
  public static async checkStorageQuota(
    employeeId: string,
    additionalSize: number = 0
  ): Promise<{ withinQuota: boolean; currentUsage: number; quota: number }> {
    try {
      const stats = await this.getStorageStats(employeeId);
      const quota = 100 * 1024 * 1024; // 100MB per employee
      const projectedUsage = stats.totalSize + additionalSize;

      return {
        withinQuota: projectedUsage <= quota,
        currentUsage: stats.totalSize,
        quota
      };

    } catch (error) {
      logger.error('Storage quota check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        employeeId
      });
      throw error;
    }
  }

  /**
   * Get bucket configuration for a category
   */
  public static getBucketConfig(category: DocumentCategory): StorageBucketConfig {
    const bucketName = this.getBucketForCategory(category);
    return this.BUCKET_CONFIGS[bucketName];
  }

  /**
   * Cleanup expired files (for maintenance tasks)
   */
  public static async cleanupExpiredFiles(category?: DocumentCategory): Promise<number> {
    try {
      let deletedCount = 0;
      const bucketsToCheck = category
        ? [this.getBucketForCategory(category)]
        : Object.keys(this.BUCKET_CONFIGS);

      for (const bucketName of bucketsToCheck) {
        const config = this.BUCKET_CONFIGS[bucketName];
        if (!config.retentionDays) continue;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

        const client = supabase.getClient();
        const { data, error } = await client.storage
          .from(bucketName)
          .list('', { limit: 1000 });

        if (error) {
          logger.error('Failed to list files for cleanup', {
            bucketName,
            error: error.message
          });
          continue;
        }

        const expiredFiles = data.filter(file =>
          new Date(file.created_at) < cutoffDate
        );

        for (const file of expiredFiles) {
          try {
            await client.storage.from(bucketName).remove([file.name]);
            deletedCount++;
          } catch (deleteError) {
            logger.error('Failed to delete expired file', {
              fileName: file.name,
              bucketName,
              error: deleteError
            });
          }
        }
      }

      logger.info('Cleanup completed', { deletedCount });
      return deletedCount;

    } catch (error) {
      logger.error('Cleanup error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        category
      });
      throw error;
    }
  }
}