import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import {
  validateAndThrow,
  ValidationError,
  requiredStringSchema,
  uuidSchema
} from '../../utils/validation';

export type DocumentCategory =
  | 'PERSONAL_IDENTIFICATION'
  | 'EMPLOYMENT_CONTRACT'
  | 'QUALIFICATION_CERTIFICATE'
  | 'TRAINING_RECORD'
  | 'PERFORMANCE_REVIEW'
  | 'PASSPORT_PHOTO'
  | 'EMERGENCY_CONTACT'
  | 'BANK_DETAILS'
  | 'TAX_INFORMATION'
  | 'INSURANCE_DOCUMENT'
  | 'OTHER';

export type DocumentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'ARCHIVED';

export interface StaffDocumentData {
  id?: string;
  employeeId: string;
  category: DocumentCategory;
  title: string;
  description?: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  uploadedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

export class StaffDocument {
  public id: string;
  public employeeId: string;
  public category: DocumentCategory;
  public title: string;
  public description?: string;
  public fileName: string;
  public filePath: string;
  public fileSize: number;
  public mimeType: string;
  public status: DocumentStatus;
  public uploadedBy: string;
  public approvedBy?: string;
  public approvedAt?: Date;
  public expiresAt?: Date;
  public metadata: Record<string, any>;
  public createdAt: Date;
  public updatedAt: Date;

  // File validation constraints
  private static readonly MAX_FILE_SIZES: Record<DocumentCategory, number> = {
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

  private static readonly ALLOWED_MIME_TYPES: Record<DocumentCategory, string[]> = {
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

  constructor(data: StaffDocumentData) {
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

  private validate(data: StaffDocumentData): void {
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

    validateAndThrow<StaffDocumentData>(schema, data);
  }

  private validateBusinessRules(isNewDocument: boolean = true): void {
    // Validate file size for category
    const maxSize = StaffDocument.MAX_FILE_SIZES[this.category];
    if (this.fileSize > maxSize) {
      throw new ValidationError(
        `File size ${this.fileSize} exceeds maximum allowed size ${maxSize} for category ${this.category}`,
        []
      );
    }

    // Validate MIME type for category
    const allowedTypes = StaffDocument.ALLOWED_MIME_TYPES[this.category];
    if (!allowedTypes.includes(this.mimeType)) {
      throw new ValidationError(
        `MIME type ${this.mimeType} not allowed for category ${this.category}. Allowed types: ${allowedTypes.join(', ')}`,
        []
      );
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

  public approve(approvedBy: string): StaffDocument {
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

  public reject(): StaffDocument {
    if (this.status !== 'PENDING') {
      throw new ValidationError('Only pending documents can be rejected', []);
    }

    return new StaffDocument({
      ...this.toJSON(),
      status: 'REJECTED',
      updatedAt: new Date()
    });
  }

  public archive(): StaffDocument {
    return new StaffDocument({
      ...this.toJSON(),
      status: 'ARCHIVED',
      updatedAt: new Date()
    });
  }

  public setExpiration(expiresAt: Date): StaffDocument {
    if (expiresAt <= new Date()) {
      throw new ValidationError('Expiration date must be in the future', []);
    }

    return new StaffDocument({
      ...this.toJSON(),
      expiresAt,
      updatedAt: new Date()
    });
  }

  public updateMetadata(metadata: Record<string, any>): StaffDocument {
    return new StaffDocument({
      ...this.toJSON(),
      metadata: { ...this.metadata, ...metadata },
      updatedAt: new Date()
    });
  }

  public isExpired(): boolean {
    return this.expiresAt ? this.expiresAt <= new Date() : false;
  }

  public isExpiringSoon(daysThreshold: number = 30): boolean {
    if (!this.expiresAt) return false;

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    return this.expiresAt <= thresholdDate;
  }

  public canBeModified(): boolean {
    return this.status === 'PENDING' || this.status === 'REJECTED';
  }

  public requiresExpiration(): boolean {
    const categoriesRequiringExpiration: DocumentCategory[] = [
      'PERSONAL_IDENTIFICATION',
      'QUALIFICATION_CERTIFICATE',
      'INSURANCE_DOCUMENT'
    ];

    return categoriesRequiringExpiration.includes(this.category);
  }

  public getFileExtension(): string {
    return this.fileName.split('.').pop()?.toLowerCase() || '';
  }

  public toJSON(): StaffDocumentData {
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
  public static createNew(data: Omit<StaffDocumentData, 'id' | 'createdAt' | 'updatedAt' | 'status'>): StaffDocument {
    return new StaffDocument({
      ...data,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  public static fromJSON(data: StaffDocumentData): StaffDocument {
    return new StaffDocument(data);
  }

  public static getMaxFileSize(category: DocumentCategory): number {
    return StaffDocument.MAX_FILE_SIZES[category];
  }

  public static getAllowedMimeTypes(category: DocumentCategory): string[] {
    return StaffDocument.ALLOWED_MIME_TYPES[category];
  }

  public static isValidFileType(category: DocumentCategory, mimeType: string): boolean {
    return StaffDocument.ALLOWED_MIME_TYPES[category].includes(mimeType.toLowerCase());
  }

  public static validateFileForCategory(category: DocumentCategory, _fileName: string, fileSize: number, mimeType: string): void {
    if (fileSize > StaffDocument.getMaxFileSize(category)) {
      throw new ValidationError(
        `File size ${fileSize} exceeds maximum allowed size ${StaffDocument.getMaxFileSize(category)} for category ${category}`,
        []
      );
    }

    if (!StaffDocument.isValidFileType(category, mimeType)) {
      throw new ValidationError(
        `File type ${mimeType} not allowed for category ${category}`,
        []
      );
    }
  }
}