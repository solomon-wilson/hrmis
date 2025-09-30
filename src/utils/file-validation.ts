import path from 'path';
import { ValidationError } from './validation';

export function sanitizeFileName(fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${sanitizedBaseName}${extension}`;
}

export function getMimeTypeExtensions(mimeType: string): string[] {
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

export function isMimeTypeAllowed(allowed: string[], mimeType: string): boolean {
  return allowed.map(m => m.toLowerCase()).includes(mimeType.toLowerCase());
}

export function validateFileSize(fileSizeBytes: number, maxBytes: number): void {
  if (fileSizeBytes > maxBytes) {
    throw new ValidationError(
      `File size ${fileSizeBytes} exceeds maximum allowed size ${maxBytes}`,
      []
    );
  }
}

export function validateFileExtensionMatchesMime(fileName: string, mimeType: string): void {
  const extension = path.extname(fileName).toLowerCase();
  const expectedExtensions = getMimeTypeExtensions(mimeType);
  if (!expectedExtensions.includes(extension)) {
    throw new ValidationError(
      `File extension ${extension} does not match MIME type ${mimeType}`,
      []
    );
  }
}

export function assertAllowedMimeType(allowed: string[], mimeType: string): void {
  if (!isMimeTypeAllowed(allowed, mimeType)) {
    throw new ValidationError(
      `File type ${mimeType} not allowed. Allowed types: ${allowed.join(', ')}`,
      []
    );
  }
}


