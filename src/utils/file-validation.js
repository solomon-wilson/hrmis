import path from 'path';
import { ValidationError } from './validation';
export function sanitizeFileName(fileName) {
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${sanitizedBaseName}${extension}`;
}
export function getMimeTypeExtensions(mimeType) {
    const mimeTypeMap = {
        'application/pdf': ['.pdf'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/gif': ['.gif'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    };
    return mimeTypeMap[mimeType.toLowerCase()] || [];
}
export function isMimeTypeAllowed(allowed, mimeType) {
    return allowed.map(m => m.toLowerCase()).includes(mimeType.toLowerCase());
}
export function validateFileSize(fileSizeBytes, maxBytes) {
    if (fileSizeBytes > maxBytes) {
        throw new ValidationError(`File size ${fileSizeBytes} exceeds maximum allowed size ${maxBytes}`, []);
    }
}
export function validateFileExtensionMatchesMime(fileName, mimeType) {
    const extension = path.extname(fileName).toLowerCase();
    const expectedExtensions = getMimeTypeExtensions(mimeType);
    if (!expectedExtensions.includes(extension)) {
        throw new ValidationError(`File extension ${extension} does not match MIME type ${mimeType}`, []);
    }
}
export function assertAllowedMimeType(allowed, mimeType) {
    if (!isMimeTypeAllowed(allowed, mimeType)) {
        throw new ValidationError(`File type ${mimeType} not allowed. Allowed types: ${allowed.join(', ')}`, []);
    }
}
