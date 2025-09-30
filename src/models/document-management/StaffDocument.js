import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { validateAndThrow, ValidationError, requiredStringSchema, uuidSchema } from '../../utils/validation';
export class StaffDocument {
    constructor(data) {
        this.validate(data);
        const isNewDocument = !data.id;
        this.id = data.id || uuidv4();
        this.employeeId = data.employeeId;
        this.category = data.category;
        this.title = data.title.trim();
        this.description = data.description?.trim();
        this.fileName = data.fileName.trim();
        this.filePath = data.filePath.trim();
        this.fileSize = data.fileSize;
        this.mimeType = data.mimeType.toLowerCase();
        this.status = data.status;
        this.uploadedBy = data.uploadedBy;
        this.approvedBy = data.approvedBy;
        this.approvedAt = data.approvedAt;
        this.expiresAt = data.expiresAt;
        this.metadata = data.metadata || {};
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
        this.validateBusinessRules(isNewDocument);
    }
    validate(data) {
        const schema = Joi.object({
            id: uuidSchema.optional(),
            employeeId: uuidSchema,
            category: Joi.string().valid(...Object.keys(StaffDocument.MAX_FILE_SIZES)).required(),
            title: requiredStringSchema.max(255),
            description: Joi.string().max(1000).optional(),
            fileName: requiredStringSchema.max(255),
            filePath: requiredStringSchema.max(500),
            fileSize: Joi.number().integer().min(1).required(),
            mimeType: requiredStringSchema.max(100),
            status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ARCHIVED').required(),
            uploadedBy: uuidSchema,
            approvedBy: uuidSchema.optional(),
            approvedAt: Joi.date().optional(),
            expiresAt: Joi.date().optional(),
            metadata: Joi.object().optional(),
            createdAt: Joi.date().optional(),
            updatedAt: Joi.date().optional()
        });
        validateAndThrow(schema, data);
    }
    validateBusinessRules(isNewDocument = true) {
        // Validate file size for category
        const maxSize = StaffDocument.MAX_FILE_SIZES[this.category];
        if (this.fileSize > maxSize) {
            throw new ValidationError(`File size ${this.fileSize} exceeds maximum allowed size ${maxSize} for category ${this.category}`, []);
        }
        // Validate MIME type for category
        const allowedTypes = StaffDocument.ALLOWED_MIME_TYPES[this.category];
        if (!allowedTypes.includes(this.mimeType)) {
            throw new ValidationError(`MIME type ${this.mimeType} not allowed for category ${this.category}. Allowed types: ${allowedTypes.join(', ')}`, []);
        }
        // Validate approval status consistency
        if (this.status === 'APPROVED' && (!this.approvedBy || !this.approvedAt)) {
            throw new ValidationError('Approved documents must have approvedBy and approvedAt fields', []);
        }
        if (this.status !== 'APPROVED' && (this.approvedBy || this.approvedAt)) {
            throw new ValidationError('Only approved documents can have approvedBy and approvedAt fields', []);
        }
        // Validate expiration date only for new documents being created
        // (documents loaded from database might already be expired)
        if (this.expiresAt && isNewDocument && this.expiresAt <= new Date()) {
            throw new ValidationError('Expiration date must be in the future', []);
        }
        // Validate passport photo specific requirements
        if (this.category === 'PASSPORT_PHOTO') {
            if (!this.mimeType.startsWith('image/')) {
                throw new ValidationError('Passport photos must be image files', []);
            }
            // Additional passport photo validation could be added here
            // e.g., minimum/maximum dimensions, aspect ratio, etc.
        }
    }
    approve(approvedBy) {
        if (this.status !== 'PENDING') {
            throw new ValidationError('Only pending documents can be approved', []);
        }
        return new StaffDocument({
            ...this.toJSON(),
            status: 'APPROVED',
            approvedBy,
            approvedAt: new Date(),
            updatedAt: new Date()
        });
    }
    reject() {
        if (this.status !== 'PENDING') {
            throw new ValidationError('Only pending documents can be rejected', []);
        }
        return new StaffDocument({
            ...this.toJSON(),
            status: 'REJECTED',
            updatedAt: new Date()
        });
    }
    archive() {
        return new StaffDocument({
            ...this.toJSON(),
            status: 'ARCHIVED',
            updatedAt: new Date()
        });
    }
    setExpiration(expiresAt) {
        if (expiresAt <= new Date()) {
            throw new ValidationError('Expiration date must be in the future', []);
        }
        return new StaffDocument({
            ...this.toJSON(),
            expiresAt,
            updatedAt: new Date()
        });
    }
    updateMetadata(metadata) {
        return new StaffDocument({
            ...this.toJSON(),
            metadata: { ...this.metadata, ...metadata },
            updatedAt: new Date()
        });
    }
    isExpired() {
        return this.expiresAt ? this.expiresAt <= new Date() : false;
    }
    isExpiringSoon(daysThreshold = 30) {
        if (!this.expiresAt)
            return false;
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
        return this.expiresAt <= thresholdDate;
    }
    canBeModified() {
        return this.status === 'PENDING' || this.status === 'REJECTED';
    }
    requiresExpiration() {
        const categoriesRequiringExpiration = [
            'PERSONAL_IDENTIFICATION',
            'QUALIFICATION_CERTIFICATE',
            'INSURANCE_DOCUMENT'
        ];
        return categoriesRequiringExpiration.includes(this.category);
    }
    getFileExtension() {
        return this.fileName.split('.').pop()?.toLowerCase() || '';
    }
    toJSON() {
        return {
            id: this.id,
            employeeId: this.employeeId,
            category: this.category,
            title: this.title,
            description: this.description,
            fileName: this.fileName,
            filePath: this.filePath,
            fileSize: this.fileSize,
            mimeType: this.mimeType,
            status: this.status,
            uploadedBy: this.uploadedBy,
            approvedBy: this.approvedBy,
            approvedAt: this.approvedAt,
            expiresAt: this.expiresAt,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
    // Static methods
    static createNew(data) {
        return new StaffDocument({
            ...data,
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }
    static fromJSON(data) {
        return new StaffDocument(data);
    }
    static getMaxFileSize(category) {
        return StaffDocument.MAX_FILE_SIZES[category];
    }
    static getAllowedMimeTypes(category) {
        return StaffDocument.ALLOWED_MIME_TYPES[category];
    }
    static isValidFileType(category, mimeType) {
        return StaffDocument.ALLOWED_MIME_TYPES[category].includes(mimeType.toLowerCase());
    }
    static validateFileForCategory(category, _fileName, fileSize, mimeType) {
        if (fileSize > StaffDocument.getMaxFileSize(category)) {
            throw new ValidationError(`File size ${fileSize} exceeds maximum allowed size ${StaffDocument.getMaxFileSize(category)} for category ${category}`, []);
        }
        if (!StaffDocument.isValidFileType(category, mimeType)) {
            throw new ValidationError(`File type ${mimeType} not allowed for category ${category}`, []);
        }
    }
}
// File validation constraints
StaffDocument.MAX_FILE_SIZES = {
    PERSONAL_IDENTIFICATION: 10 * 1024 * 1024, // 10MB
    EMPLOYMENT_CONTRACT: 10 * 1024 * 1024,
    QUALIFICATION_CERTIFICATE: 10 * 1024 * 1024,
    TRAINING_RECORD: 10 * 1024 * 1024,
    PERFORMANCE_REVIEW: 10 * 1024 * 1024,
    PASSPORT_PHOTO: 5 * 1024 * 1024, // 5MB
    EMERGENCY_CONTACT: 5 * 1024 * 1024,
    BANK_DETAILS: 10 * 1024 * 1024,
    TAX_INFORMATION: 10 * 1024 * 1024,
    INSURANCE_DOCUMENT: 10 * 1024 * 1024,
    OTHER: 10 * 1024 * 1024
};
StaffDocument.ALLOWED_MIME_TYPES = {
    PERSONAL_IDENTIFICATION: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif'
    ],
    EMPLOYMENT_CONTRACT: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    QUALIFICATION_CERTIFICATE: [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ],
    TRAINING_RECORD: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    PERFORMANCE_REVIEW: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    PASSPORT_PHOTO: [
        'image/jpeg',
        'image/png'
    ],
    EMERGENCY_CONTACT: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    BANK_DETAILS: [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ],
    TAX_INFORMATION: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    INSURANCE_DOCUMENT: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    OTHER: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
};
