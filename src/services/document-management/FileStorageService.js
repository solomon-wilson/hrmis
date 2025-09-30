import { supabase } from '../../database/supabase';
import { ValidationError } from '../../utils/validation';
import { logger } from '../../utils/logger';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeFileName, assertAllowedMimeType, validateFileExtensionMatchesMime, validateFileSize } from '../../utils/file-validation';
import { ensureReasonableImage, resizeImage } from '../../utils/image-processing';
export class FileStorageService {
    static getBucketForCategory(category) {
        switch (category) {
            case 'PASSPORT_PHOTO':
                return 'passport-photos';
            default:
                return 'employee-documents';
        }
    }
    static generateFilePath(employeeId, category, fileName) {
        const timestamp = new Date().toISOString().split('T')[0];
        const uuid = uuidv4().split('-')[0];
        const sanitized = sanitizeFileName(fileName);
        const extension = path.extname(sanitized);
        const baseName = path.basename(sanitized, extension);
        return `employees/${employeeId}/${category.toLowerCase()}/${timestamp}/${baseName}_${uuid}${extension}`;
    }
    static validateFile(fileBuffer, fileName, mimeType, category) {
        const bucketName = this.getBucketForCategory(category);
        const config = this.BUCKET_CONFIGS[bucketName];
        if (!config) {
            throw new ValidationError(`No storage configuration found for category: ${category}`, []);
        }
        // Validate file size
        validateFileSize(fileBuffer.length, config.maxFileSize);
        // Validate MIME type
        assertAllowedMimeType(config.allowedMimeTypes, mimeType);
        // Validate file extension matches MIME type
        validateFileExtensionMatchesMime(fileName, mimeType);
        // Additional validation for specific categories
        if (category === 'PASSPORT_PHOTO') {
            this.validatePassportPhoto(fileBuffer, mimeType);
        }
    }
    static getMimeTypeExtensions(mimeType) {
        // Deprecated in favor of utils/file-validation; kept for backward compatibility
        const map = {
            'application/pdf': ['.pdf'],
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/gif': ['.gif'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
        };
        return map[mimeType.toLowerCase()] || [];
    }
    static validatePassportPhoto(fileBuffer, mimeType) {
        if (!mimeType.startsWith('image/')) {
            throw new ValidationError('Passport photos must be image files', []);
        }
        // Ensure image is valid and has reasonable dimensions
        if (fileBuffer.length < 1024) {
            throw new ValidationError('Image file appears to be too small or corrupted', []);
        }
        // Validate image metadata
        // Not awaited here to avoid blocking twice; validate in upload path
    }
    /**
     * Upload a file to Supabase storage
     */
    static async uploadFile(request) {
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
            // Optionally resize images for passport photos per config
            let fileToUpload = request.file;
            if (request.category === 'PASSPORT_PHOTO') {
                await ensureReasonableImage(request.file);
                const cfg = this.BUCKET_CONFIGS['passport-photos'].configuration;
                fileToUpload = await resizeImage(request.file, {
                    maxWidth: cfg.maxWidth || 800,
                    maxHeight: cfg.maxHeight || 800,
                    quality: cfg.quality || 85
                });
            }
            const { data, error } = await client.storage
                .from(bucketName)
                .upload(filePath, fileToUpload, {
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
                fileSize: fileToUpload.length
            };
        }
        catch (error) {
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
    static async getDownloadUrl(filePath, category) {
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
        }
        catch (error) {
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
    static async deleteFile(filePath, category) {
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
        }
        catch (error) {
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
    static async listFiles(employeeId, category, limit = 100) {
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
        }
        catch (error) {
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
    static async moveFile(currentPath, newPath, category) {
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
        }
        catch (error) {
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
    static async getStorageStats(employeeId) {
        try {
            const stats = {
                totalFiles: 0,
                totalSize: 0,
                categoryCounts: {}
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
        }
        catch (error) {
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
    static async checkStorageQuota(employeeId, additionalSize = 0) {
        try {
            const stats = await this.getStorageStats(employeeId);
            const quota = 100 * 1024 * 1024; // 100MB per employee
            const projectedUsage = stats.totalSize + additionalSize;
            return {
                withinQuota: projectedUsage <= quota,
                currentUsage: stats.totalSize,
                quota
            };
        }
        catch (error) {
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
    static getBucketConfig(category) {
        const bucketName = this.getBucketForCategory(category);
        return this.BUCKET_CONFIGS[bucketName];
    }
    /**
     * Cleanup expired files (for maintenance tasks)
     */
    static async cleanupExpiredFiles(category) {
        try {
            let deletedCount = 0;
            const bucketsToCheck = category
                ? [this.getBucketForCategory(category)]
                : Object.keys(this.BUCKET_CONFIGS);
            for (const bucketName of bucketsToCheck) {
                const config = this.BUCKET_CONFIGS[bucketName];
                if (!config.retentionDays)
                    continue;
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
                const expiredFiles = data.filter(file => new Date(file.created_at) < cutoffDate);
                for (const file of expiredFiles) {
                    try {
                        await client.storage.from(bucketName).remove([file.name]);
                        deletedCount++;
                    }
                    catch (deleteError) {
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
        }
        catch (error) {
            logger.error('Cleanup error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                category
            });
            throw error;
        }
    }
}
FileStorageService.BUCKET_CONFIGS = {
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
