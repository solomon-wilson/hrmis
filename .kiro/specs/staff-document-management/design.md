# Design Document

## Overview

The Staff Document Management system extends the existing Employee Management System to provide comprehensive document storage, organization, and retrieval capabilities. The system will integrate with the current employee profiles to store scanned documents including passport photos, appointment letters, academic certificates, and other employment-related documents. It will also manage annual leave planning and provide flexible storage for additional documents.

The design leverages Supabase's file storage capabilities for secure document handling while maintaining the existing PostgreSQL database structure for metadata and relationships.

## Architecture

### System Integration

The document management system integrates with the existing HRMIS architecture:

- **Database Layer**: Extends the current PostgreSQL schema with new document-related tables
- **Storage Layer**: Utilizes Supabase Storage for secure file storage with encryption
- **API Layer**: Extends existing Express.js controllers and services
- **Security Layer**: Leverages existing RLS policies and authentication mechanisms
- **Frontend Integration**: Provides REST endpoints for document upload, retrieval, and management

### Technology Stack

- **Backend**: Node.js with TypeScript, Express.js
- **Database**: PostgreSQL (Supabase) with new document tables
- **File Storage**: Supabase Storage with bucket organization
- **Authentication**: Existing Supabase Auth integration
- **File Processing**: Sharp for image optimization, PDF-lib for PDF handling
- **Validation**: Joi for input validation, custom file type validation

## Components and Interfaces

### Database Schema Extensions

```sql
-- Document categories enum
CREATE TYPE document_category AS ENUM (
  'PASSPORT_PHOTO',
  'APPOINTMENT_LETTER', 
  'CONFIRMATION_LETTER',
  'ACADEMIC_CERTIFICATE',
  'APPLICATION_LETTER',
  'MEDICAL_REPORT',
  'POLICE_CLEARANCE',
  'ACCEPTANCE_LETTER',
  'ADDITIONAL_DOCUMENT'
);

-- Staff documents table
CREATE TABLE staff_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category document_category NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  description TEXT,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  uploaded_by UUID NOT NULL REFERENCES employees(id),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Annual leave planning table
CREATE TABLE annual_leave_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  proposed_start_date DATE NOT NULL,
  proposed_end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  year INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'PROPOSED',
  notes TEXT,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Core Models

#### StaffDocument Model
```typescript
export interface StaffDocumentData {
  id?: string;
  employeeId: string;
  category: DocumentCategory;
  documentName: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  uploadDate?: Date;
  uploadedBy: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

export class StaffDocument {
  // Model implementation with validation
  // File type validation
  // Size limit enforcement
  // Category-specific business rules
}
```

#### AnnualLeavePlan Model
```typescript
export interface AnnualLeavePlanData {
  id?: string;
  employeeId: string;
  proposedStartDate: Date;
  proposedEndDate: Date;
  totalDays: number;
  year: number;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  notes?: string;
  approvedBy?: string;
  approvedAt?: Date;
  createdBy: string;
}
```

### Service Layer

#### DocumentService
```typescript
export class DocumentService {
  // Document upload with validation
  async uploadDocument(file: Express.Multer.File, metadata: DocumentUploadRequest): Promise<StaffDocument>
  
  // Document retrieval with permission checks
  async getDocument(documentId: string, permissionContext: PermissionContext): Promise<StaffDocument>
  
  // Document listing by employee and category
  async getEmployeeDocuments(employeeId: string, category?: DocumentCategory): Promise<StaffDocument[]>
  
  // Document deletion with audit trail
  async deleteDocument(documentId: string, permissionContext: PermissionContext): Promise<void>
  
  // Document replacement
  async replaceDocument(documentId: string, newFile: Express.Multer.File): Promise<StaffDocument>
}
```

#### FileStorageService
```typescript
export class FileStorageService {
  // Upload to Supabase Storage
  async uploadFile(file: Express.Multer.File, path: string): Promise<string>
  
  // Generate secure download URLs
  async getDownloadUrl(filePath: string, expiresIn?: number): Promise<string>
  
  // Delete files from storage
  async deleteFile(filePath: string): Promise<void>
  
  // File validation
  validateFile(file: Express.Multer.File, category: DocumentCategory): ValidationResult
}
```

### Controller Layer

#### StaffDocumentController
```typescript
export class StaffDocumentController {
  // Upload document endpoint
  async uploadDocument(req: Request, res: Response): Promise<void>
  
  // Get employee documents
  async getEmployeeDocuments(req: Request, res: Response): Promise<void>
  
  // Download document
  async downloadDocument(req: Request, res: Response): Promise<void>
  
  // Delete document
  async deleteDocument(req: Request, res: Response): Promise<void>
  
  // Update document metadata
  async updateDocumentMetadata(req: Request, res: Response): Promise<void>
}
```

### Storage Organization

#### Supabase Storage Buckets
```
staff-documents/
├── passport-photos/
│   └── {employee-id}/
│       └── {document-id}.{ext}
├── appointment-letters/
│   └── {employee-id}/
│       └── {document-id}.{ext}
├── confirmation-letters/
│   └── {employee-id}/
│       └── {document-id}.{ext}
├── academic-certificates/
│   └── {employee-id}/
│       └── {document-id}.{ext}
├── medical-reports/
│   └── {employee-id}/
│       └── {document-id}.{ext}
├── police-clearance/
│   └── {employee-id}/
│       └── {document-id}.{ext}
└── additional-documents/
    └── {employee-id}/
        └── {document-id}.{ext}
```

## Data Models

### Document Categories and Validation Rules

#### Passport Photos
- **File Types**: JPG, PNG
- **Max Size**: 5MB
- **Dimensions**: Minimum 300x300px
- **Limit**: 1 active photo per employee
- **Processing**: Auto-resize to standard dimensions

#### Appointment Letters
- **File Types**: PDF, JPG, PNG
- **Max Size**: 10MB
- **Limit**: Multiple allowed
- **Validation**: Date extraction from filename/metadata

#### Academic Certificates
- **File Types**: PDF, JPG, PNG
- **Max Size**: 10MB
- **Limit**: Multiple allowed
- **Metadata**: Institution, degree type, graduation date

#### Medical Reports
- **File Types**: PDF, JPG, PNG
- **Max Size**: 10MB
- **Limit**: Multiple allowed
- **Retention**: Automatic archival after 7 years

#### Additional Documents
- **File Types**: PDF, DOC, DOCX, JPG, PNG
- **Max Size**: 15MB
- **Limit**: Unlimited
- **Custom Fields**: Name, description, tags

### Annual Leave Planning

#### Leave Plan Structure
```typescript
interface AnnualLeavePlan {
  employeeId: string;
  year: number;
  proposedDates: {
    startDate: Date;
    endDate: Date;
    totalDays: number;
    type: 'VACATION' | 'PERSONAL' | 'OTHER';
  }[];
  totalProposedDays: number;
  availableDays: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}
```

## Error Handling

### File Upload Errors
- **File Too Large**: Return 413 with specific size limits
- **Invalid File Type**: Return 400 with allowed types
- **Storage Quota Exceeded**: Return 507 with quota information
- **Virus Detection**: Return 400 with security message

### Permission Errors
- **Unauthorized Access**: Return 403 with specific permission requirements
- **Document Not Found**: Return 404 with helpful message
- **Employee Not Found**: Return 404 with employee validation

### Business Logic Errors
- **Duplicate Passport Photo**: Return 409 with replacement option
- **Invalid Leave Dates**: Return 400 with date validation details
- **Insufficient Leave Balance**: Return 400 with balance information

### Error Response Format
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    correlationId: string;
  };
}
```

## Testing Strategy

### Unit Tests
- **Model Validation**: Test all business rules and constraints
- **Service Logic**: Test document operations and permission checks
- **File Processing**: Test upload, validation, and storage operations
- **Leave Planning**: Test date validation and conflict detection

### Integration Tests
- **Database Operations**: Test CRUD operations with real database
- **File Storage**: Test Supabase Storage integration
- **Authentication**: Test permission enforcement
- **API Endpoints**: Test complete request/response cycles

### End-to-End Tests
- **Document Upload Flow**: Complete upload process from frontend to storage
- **Permission Scenarios**: Test different user roles and access patterns
- **Leave Planning Workflow**: Test complete leave planning and approval process
- **Error Scenarios**: Test error handling and recovery

### Performance Tests
- **File Upload Performance**: Test large file uploads and concurrent operations
- **Database Query Performance**: Test document retrieval with large datasets
- **Storage Access Performance**: Test download URL generation and access

### Security Tests
- **File Type Validation**: Test malicious file upload attempts
- **Permission Bypass**: Test unauthorized access attempts
- **Data Leakage**: Test cross-employee data access prevention
- **SQL Injection**: Test input validation and parameterized queries

## Security Considerations

### File Security
- **Virus Scanning**: Integrate with antivirus service for uploaded files
- **File Type Validation**: Strict MIME type and extension validation
- **Content Scanning**: Scan for embedded malicious content
- **Encryption**: Encrypt files at rest in Supabase Storage

### Access Control
- **Role-Based Access**: Implement granular permissions per document category
- **Employee Self-Service**: Allow employees to view their own documents
- **Manager Access**: Allow managers to view direct reports' documents
- **HR Admin Access**: Full access to all documents with audit logging

### Data Privacy
- **PII Protection**: Encrypt sensitive document metadata
- **Audit Logging**: Log all document access and modifications
- **Data Retention**: Implement automatic archival and deletion policies
- **GDPR Compliance**: Support data export and deletion requests

### API Security
- **Rate Limiting**: Implement upload rate limits per user
- **Input Validation**: Validate all inputs and file metadata
- **CORS Configuration**: Restrict cross-origin requests appropriately
- **Authentication**: Require valid JWT tokens for all operations