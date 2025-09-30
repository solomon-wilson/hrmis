import { StaffDocument } from './StaffDocument';
import { ValidationError } from '../../utils/validation';
describe('StaffDocument', () => {
    const validDocumentData = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        category: 'PERSONAL_IDENTIFICATION',
        title: 'Driver\'s License',
        description: 'Copy of driver\'s license',
        fileName: 'drivers_license.pdf',
        filePath: '/documents/employee/123/drivers_license.pdf',
        fileSize: 1024 * 1024, // 1MB
        mimeType: 'application/pdf',
        status: 'PENDING',
        uploadedBy: '123e4567-e89b-12d3-a456-426614174001',
        metadata: { documentNumber: 'DL123456789' }
    };
    describe('constructor', () => {
        it('should create a valid document', () => {
            const document = new StaffDocument(validDocumentData);
            expect(document.id).toBeDefined();
            expect(document.employeeId).toBe(validDocumentData.employeeId);
            expect(document.category).toBe(validDocumentData.category);
            expect(document.title).toBe(validDocumentData.title);
            expect(document.status).toBe('PENDING');
        });
        it('should auto-generate ID if not provided', () => {
            const document = new StaffDocument(validDocumentData);
            expect(document.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });
        it('should set timestamps if not provided', () => {
            const document = new StaffDocument(validDocumentData);
            expect(document.createdAt).toBeInstanceOf(Date);
            expect(document.updatedAt).toBeInstanceOf(Date);
        });
    });
    describe('validation', () => {
        it('should reject invalid employee ID', () => {
            const invalidData = { ...validDocumentData, employeeId: 'invalid-id' };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject invalid category', () => {
            const invalidData = { ...validDocumentData, category: 'INVALID_CATEGORY' };
            expect(() => new StaffDocument(invalidData)).toThrow();
        });
        it('should reject empty title', () => {
            const invalidData = { ...validDocumentData, title: '' };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject negative file size', () => {
            const invalidData = { ...validDocumentData, fileSize: -1 };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject file size exceeding category limit', () => {
            const invalidData = {
                ...validDocumentData,
                fileSize: 20 * 1024 * 1024 // 20MB, exceeds 10MB limit
            };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject invalid MIME type for category', () => {
            const invalidData = {
                ...validDocumentData,
                category: 'PASSPORT_PHOTO',
                mimeType: 'application/pdf' // Photos should be images
            };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
    });
    describe('business rules validation', () => {
        it('should require approval fields for approved documents', () => {
            const invalidData = {
                ...validDocumentData,
                status: 'APPROVED'
            };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject approval fields for non-approved documents', () => {
            const invalidData = {
                ...validDocumentData,
                status: 'PENDING',
                approvedBy: '123e4567-e89b-12d3-a456-426614174002',
                approvedAt: new Date()
            };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
        it('should reject past expiration dates', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            const invalidData = {
                ...validDocumentData,
                expiresAt: pastDate
            };
            expect(() => new StaffDocument(invalidData)).toThrow(ValidationError);
        });
    });
    describe('approve', () => {
        it('should approve a pending document', () => {
            const document = new StaffDocument(validDocumentData);
            const approverId = '123e4567-e89b-12d3-a456-426614174002';
            const approvedDocument = document.approve(approverId);
            expect(approvedDocument.status).toBe('APPROVED');
            expect(approvedDocument.approvedBy).toBe(approverId);
            expect(approvedDocument.approvedAt).toBeInstanceOf(Date);
        });
        it('should not approve non-pending documents', () => {
            const rejectedData = { ...validDocumentData, status: 'REJECTED' };
            const document = new StaffDocument(rejectedData);
            expect(() => document.approve('123e4567-e89b-12d3-a456-426614174002'))
                .toThrow('Only pending documents can be approved');
        });
    });
    describe('reject', () => {
        it('should reject a pending document', () => {
            const document = new StaffDocument(validDocumentData);
            const rejectedDocument = document.reject();
            expect(rejectedDocument.status).toBe('REJECTED');
        });
        it('should not reject non-pending documents', () => {
            const approvedData = {
                ...validDocumentData,
                status: 'APPROVED',
                approvedBy: '123e4567-e89b-12d3-a456-426614174002',
                approvedAt: new Date()
            };
            const document = new StaffDocument(approvedData);
            expect(() => document.reject()).toThrow('Only pending documents can be rejected');
        });
    });
    describe('utility methods', () => {
        it('should detect expired documents', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            const expiredData = {
                ...validDocumentData,
                id: '123e4567-e89b-12d3-a456-426614174003', // Provide ID to simulate loaded from DB
                status: 'APPROVED',
                approvedBy: '123e4567-e89b-12d3-a456-426614174002',
                approvedAt: new Date(),
                expiresAt: pastDate
            };
            const document = new StaffDocument(expiredData);
            expect(document.isExpired()).toBe(true);
        });
        it('should detect documents expiring soon', () => {
            const soonDate = new Date();
            soonDate.setDate(soonDate.getDate() + 15); // 15 days from now
            const expiringSoonData = {
                ...validDocumentData,
                id: '123e4567-e89b-12d3-a456-426614174004', // Provide ID to simulate loaded from DB
                status: 'APPROVED',
                approvedBy: '123e4567-e89b-12d3-a456-426614174002',
                approvedAt: new Date(),
                expiresAt: soonDate
            };
            const document = new StaffDocument(expiringSoonData);
            expect(document.isExpiringSoon(30)).toBe(true);
            expect(document.isExpiringSoon(10)).toBe(false);
        });
        it('should determine if document can be modified', () => {
            const pendingDocument = new StaffDocument(validDocumentData);
            expect(pendingDocument.canBeModified()).toBe(true);
            const rejectedData = { ...validDocumentData, status: 'REJECTED' };
            const rejectedDocument = new StaffDocument(rejectedData);
            expect(rejectedDocument.canBeModified()).toBe(true);
            const approvedData = {
                ...validDocumentData,
                id: '123e4567-e89b-12d3-a456-426614174005', // Provide ID to simulate loaded from DB
                status: 'APPROVED',
                approvedBy: '123e4567-e89b-12d3-a456-426614174002',
                approvedAt: new Date()
            };
            const approvedDocument = new StaffDocument(approvedData);
            expect(approvedDocument.canBeModified()).toBe(false);
        });
        it('should get file extension', () => {
            const document = new StaffDocument(validDocumentData);
            expect(document.getFileExtension()).toBe('pdf');
        });
    });
    describe('static methods', () => {
        it('should create new document with default status', () => {
            const { status, id, createdAt, updatedAt, ...createData } = validDocumentData;
            const document = StaffDocument.createNew(createData);
            expect(document.status).toBe('PENDING');
            expect(document.id).toBeDefined();
            expect(document.createdAt).toBeInstanceOf(Date);
        });
        it('should get max file size for category', () => {
            expect(StaffDocument.getMaxFileSize('PASSPORT_PHOTO')).toBe(5 * 1024 * 1024);
            expect(StaffDocument.getMaxFileSize('PERSONAL_IDENTIFICATION')).toBe(10 * 1024 * 1024);
        });
        it('should get allowed MIME types for category', () => {
            const photoTypes = StaffDocument.getAllowedMimeTypes('PASSPORT_PHOTO');
            expect(photoTypes).toContain('image/jpeg');
            expect(photoTypes).toContain('image/png');
            expect(photoTypes).not.toContain('application/pdf');
        });
        it('should validate file type for category', () => {
            expect(StaffDocument.isValidFileType('PASSPORT_PHOTO', 'image/jpeg')).toBe(true);
            expect(StaffDocument.isValidFileType('PASSPORT_PHOTO', 'application/pdf')).toBe(false);
        });
        it('should validate file for category', () => {
            expect(() => {
                StaffDocument.validateFileForCategory('PASSPORT_PHOTO', 'photo.jpg', 1024, 'image/jpeg');
            }).not.toThrow();
            expect(() => {
                StaffDocument.validateFileForCategory('PASSPORT_PHOTO', 'doc.pdf', 1024, 'application/pdf');
            }).toThrow(ValidationError);
            expect(() => {
                StaffDocument.validateFileForCategory('PASSPORT_PHOTO', 'large.jpg', 10 * 1024 * 1024, 'image/jpeg');
            }).toThrow(ValidationError);
        });
    });
    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const document = new StaffDocument(validDocumentData);
            const json = document.toJSON();
            expect(json.id).toBe(document.id);
            expect(json.employeeId).toBe(document.employeeId);
            expect(json.category).toBe(document.category);
            expect(json.status).toBe(document.status);
        });
    });
});
