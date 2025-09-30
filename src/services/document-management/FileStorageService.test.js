import { FileStorageService } from './FileStorageService';
import { ValidationError } from '../../utils/validation';
// Mock Supabase
jest.mock('../../database/supabase', () => ({
    supabase: {
        getClient: jest.fn().mockReturnValue({
            storage: {
                from: jest.fn().mockReturnValue({
                    upload: jest.fn(),
                    createSignedUrl: jest.fn(),
                    remove: jest.fn(),
                    list: jest.fn(),
                    copy: jest.fn()
                })
            }
        })
    }
}));
// Mock logger
jest.mock('../../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn()
    }
}));
describe('FileStorageService', () => {
    const mockFile = Buffer.from('test file content');
    const validUploadRequest = {
        file: mockFile,
        fileName: 'test-document.pdf',
        mimeType: 'application/pdf',
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'PERSONAL_IDENTIFICATION',
        metadata: { test: 'data' }
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('uploadFile', () => {
        it('should successfully upload a valid file', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.upload.mockResolvedValueOnce({
                data: { path: 'employees/123/personal_identification/2024-01-01/test-document_abc123.pdf' },
                error: null
            });
            const result = await FileStorageService.uploadFile(validUploadRequest);
            expect(result).toEqual({
                filePath: 'employees/123/personal_identification/2024-01-01/test-document_abc123.pdf',
                fileName: 'test-document.pdf',
                fileSize: mockFile.length
            });
            expect(mockStorageClient.upload).toHaveBeenCalledWith(expect.stringMatching(/^employees\/123e4567-e89b-12d3-a456-426614174000\/personal_identification\/\d{4}-\d{2}-\d{2}\//), mockFile, {
                contentType: 'application/pdf',
                metadata: {
                    employeeId: '123e4567-e89b-12d3-a456-426614174000',
                    category: 'PERSONAL_IDENTIFICATION',
                    originalFileName: 'test-document.pdf',
                    test: 'data'
                }
            });
        });
        it('should reject files that exceed size limits', async () => {
            const largeFile = Buffer.alloc(15 * 1024 * 1024); // 15MB, exceeds 10MB limit
            const request = {
                ...validUploadRequest,
                file: largeFile
            };
            await expect(FileStorageService.uploadFile(request)).rejects.toThrow(ValidationError);
        });
        it('should reject files with invalid MIME types', async () => {
            const request = {
                ...validUploadRequest,
                mimeType: 'application/exe',
                fileName: 'malware.exe'
            };
            await expect(FileStorageService.uploadFile(request)).rejects.toThrow(ValidationError);
        });
        it('should reject files where extension does not match MIME type', async () => {
            const request = {
                ...validUploadRequest,
                mimeType: 'application/pdf',
                fileName: 'document.jpg'
            };
            await expect(FileStorageService.uploadFile(request)).rejects.toThrow(ValidationError);
        });
        it('should handle Supabase upload errors', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.upload.mockResolvedValueOnce({
                data: null,
                error: { message: 'Upload failed' }
            });
            await expect(FileStorageService.uploadFile(validUploadRequest)).rejects.toThrow(ValidationError);
        });
    });
    describe('getDownloadUrl', () => {
        it('should generate signed URL for document download', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            const expectedUrl = 'https://example.com/signed-url';
            mockStorageClient.createSignedUrl.mockResolvedValueOnce({
                data: { signedUrl: expectedUrl },
                error: null
            });
            const url = await FileStorageService.getDownloadUrl('employees/123/personal_identification/document.pdf', 'PERSONAL_IDENTIFICATION');
            expect(url).toBe(expectedUrl);
            expect(mockStorageClient.createSignedUrl).toHaveBeenCalledWith('employees/123/personal_identification/document.pdf', 3600);
        });
        it('should handle signed URL generation errors', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.createSignedUrl.mockResolvedValueOnce({
                data: null,
                error: { message: 'URL generation failed' }
            });
            await expect(FileStorageService.getDownloadUrl('employees/123/personal_identification/document.pdf', 'PERSONAL_IDENTIFICATION')).rejects.toThrow(ValidationError);
        });
    });
    describe('deleteFile', () => {
        it('should successfully delete a file', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.remove.mockResolvedValueOnce({
                data: null,
                error: null
            });
            await FileStorageService.deleteFile('employees/123/personal_identification/document.pdf', 'PERSONAL_IDENTIFICATION');
            expect(mockStorageClient.remove).toHaveBeenCalledWith([
                'employees/123/personal_identification/document.pdf'
            ]);
        });
        it('should handle deletion errors', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.remove.mockResolvedValueOnce({
                data: null,
                error: { message: 'Deletion failed' }
            });
            await expect(FileStorageService.deleteFile('employees/123/personal_identification/document.pdf', 'PERSONAL_IDENTIFICATION')).rejects.toThrow(ValidationError);
        });
    });
    describe('listFiles', () => {
        it('should list files for an employee', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            const mockFiles = [
                {
                    name: 'document1.pdf',
                    metadata: { size: 1024 },
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z'
                },
                {
                    name: 'document2.pdf',
                    metadata: { size: 2048 },
                    created_at: '2024-01-02T00:00:00Z',
                    updated_at: '2024-01-02T00:00:00Z'
                }
            ];
            mockStorageClient.list.mockResolvedValueOnce({
                data: mockFiles,
                error: null
            });
            const files = await FileStorageService.listFiles('123e4567-e89b-12d3-a456-426614174000');
            expect(files).toHaveLength(2);
            expect(files[0]).toEqual({
                name: 'document1.pdf',
                size: 1024,
                lastModified: new Date('2024-01-01T00:00:00Z')
            });
            expect(mockStorageClient.list).toHaveBeenCalledWith('employees/123e4567-e89b-12d3-a456-426614174000/', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });
        });
        it('should list files for specific category', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.list.mockResolvedValueOnce({
                data: [],
                error: null
            });
            await FileStorageService.listFiles('123e4567-e89b-12d3-a456-426614174000', 'PASSPORT_PHOTO');
            expect(mockStorageClient.list).toHaveBeenCalledWith('employees/123e4567-e89b-12d3-a456-426614174000/passport_photo/', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });
        });
    });
    describe('checkStorageQuota', () => {
        it('should return quota information', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            // Mock the list method for storage stats
            mockStorageClient.list.mockResolvedValue({
                data: [
                    { name: 'file1.pdf', metadata: { size: 1024 }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
                    { name: 'file2.pdf', metadata: { size: 2048 }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }
                ],
                error: null
            });
            const quota = await FileStorageService.checkStorageQuota('123e4567-e89b-12d3-a456-426614174000', 1000);
            expect(quota).toEqual({
                withinQuota: true,
                currentUsage: 6144, // 1024 + 2048 counted twice (once for each bucket)
                quota: 100 * 1024 * 1024 // 100MB
            });
        });
    });
    describe('getBucketConfig', () => {
        it('should return correct bucket config for passport photos', () => {
            const config = FileStorageService.getBucketConfig('PASSPORT_PHOTO');
            expect(config.bucketName).toBe('passport-photos');
            expect(config.maxFileSize).toBe(5 * 1024 * 1024);
            expect(config.allowedMimeTypes).toEqual(['image/jpeg', 'image/png']);
        });
        it('should return correct bucket config for other documents', () => {
            const config = FileStorageService.getBucketConfig('PERSONAL_IDENTIFICATION');
            expect(config.bucketName).toBe('employee-documents');
            expect(config.maxFileSize).toBe(10 * 1024 * 1024);
            expect(config.allowedMimeTypes).toContain('application/pdf');
        });
    });
    describe('passport photo validation', () => {
        it('should validate passport photos are images', async () => {
            const request = {
                ...validUploadRequest,
                category: 'PASSPORT_PHOTO',
                mimeType: 'application/pdf',
                fileName: 'photo.pdf'
            };
            await expect(FileStorageService.uploadFile(request)).rejects.toThrow(ValidationError);
        });
        it('should accept valid passport photo formats', async () => {
            const { supabase } = require('../../database/supabase');
            const mockStorageClient = supabase.getClient().storage.from();
            mockStorageClient.upload.mockResolvedValueOnce({
                data: { path: 'passport-photos/123/photo.jpg' },
                error: null
            });
            const largeEnoughFile = Buffer.alloc(2048); // 2KB file, larger than 1KB minimum
            const request = {
                ...validUploadRequest,
                file: largeEnoughFile,
                category: 'PASSPORT_PHOTO',
                mimeType: 'image/jpeg',
                fileName: 'photo.jpg'
            };
            const result = await FileStorageService.uploadFile(request);
            expect(result.filePath).toBe('passport-photos/123/photo.jpg');
        });
        it('should reject very small image files', async () => {
            const tinyFile = Buffer.from('x'); // Less than 1KB
            const request = {
                ...validUploadRequest,
                file: tinyFile,
                category: 'PASSPORT_PHOTO',
                mimeType: 'image/jpeg',
                fileName: 'tiny.jpg'
            };
            await expect(FileStorageService.uploadFile(request)).rejects.toThrow(ValidationError);
        });
    });
});
