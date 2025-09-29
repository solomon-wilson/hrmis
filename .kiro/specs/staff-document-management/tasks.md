# Implementation Plan

- [X] 1. Set up database schema and storage infrastructure (UPDATED FOR SUPABASE)



  - Create database migration for document-related tables
  - Set up Supabase Storage buckets with proper permissions
  - Add new enums and types to the database schema
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 8.1_

- [X] 2. Create core data models and validation
  - [X] 2.1 Implement StaffDocument model with validation
    - Create StaffDocument TypeScript class with business rules
    - Implement file type and size validation methods
    - Add category-specific validation logic
    - Write unit tests for StaffDocument model validation
    - _Requirements: 2.1, 3.1, 4.1, 6.1_

  - [X] 2.2 Implement AnnualLeavePlan model
    - Create AnnualLeavePlan TypeScript class
    - Implement date validation and conflict detection
    - Add leave balance integration logic
    - Write unit tests for AnnualLeavePlan model
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [X] 3. Implement file storage service layer
  - [X] 3.1 Create FileStorageService for Supabase integration
    - Implement file upload methods with path organization
    - Create secure download URL generation
    - Add file deletion and cleanup methods
    - Implement file validation and virus scanning hooks
    - Write unit tests for FileStorageService
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 8.1, 8.4_

  - [X] 3.2 Implement DocumentService business logic
    - Create document upload workflow with metadata handling
    - Implement document retrieval with permission checks
    - Add document listing and filtering capabilities
    - Create document replacement and deletion methods
    - Write unit tests for DocumentService operations
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3_

- [X] 4. Create database repositories
  - [X] 4.1 Implement StaffDocumentRepository
    - Create CRUD operations for staff documents
    - Implement category-based filtering and search
    - Add employee document listing with pagination
    - Create document metadata update methods
    - Write unit tests for repository operations
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.5, 6.1, 6.4_

  - [X] 4.2 Implement AnnualLeavePlanRepository
    - Create CRUD operations for leave plans
    - Implement year-based filtering and employee lookup
    - Add leave plan approval workflow methods
    - Create conflict detection queries
    - Write unit tests for leave plan repository
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [X] 5. Implement API controllers and routes
  - [X] 5.1 Create StaffDocumentController
    - Implement document upload endpoint with multipart handling
    - Create document download endpoint with permission checks
    - Add document listing endpoint with filtering
    - Implement document deletion and metadata update endpoints
    - Write unit tests for controller methods
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3_

  - [X] 5.2 Create AnnualLeavePlanController
    - Implement leave plan creation and update endpoints
    - Create leave plan retrieval and listing endpoints
    - Add leave plan approval workflow endpoints
    - Implement leave balance integration endpoints
    - Write unit tests for leave plan controller
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Extend existing Employee services
  - [ ] 6.1 Update EmployeeService for document integration
    - Add document summary methods to employee profiles
    - Implement passport photo retrieval for employee display
    - Create document requirement checking methods
    - Add employee document statistics and reporting
    - Write unit tests for employee document integration
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 7.3_

  - [ ] 6.2 Update EmployeeController for document endpoints
    - Add employee document summary endpoint
    - Implement passport photo display endpoint
    - Create document requirement status endpoint
    - Add employee self-service document viewing
    - Write unit tests for employee controller updates
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2, 7.3, 7.4_

- [ ] 7. Implement security and permission layers
  - [ ] 7.1 Create document permission middleware
    - Implement role-based document access control
    - Add employee self-service permission checks
    - Create manager access validation for direct reports
    - Implement HR admin full access permissions
    - Write unit tests for permission middleware
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 7.2 Add audit logging for document operations
    - Implement document access logging
    - Add document modification audit trails
    - Create document deletion logging
    - Implement security event logging for unauthorized access
    - Write unit tests for audit logging functionality
    - _Requirements: 8.3, 8.4, 8.5_

- [ ] 8. Create file processing and validation utilities
  - [ ] 8.1 Implement file type validation utilities
    - Create MIME type validation functions
    - Implement file extension verification
    - Add file size limit enforcement
    - Create category-specific validation rules
    - Write unit tests for file validation utilities
    - _Requirements: 2.2, 3.2, 4.2, 6.2, 8.1, 8.4_

  - [ ] 8.2 Add image processing for passport photos
    - Implement image resizing and optimization
    - Create thumbnail generation for document previews
    - Add image format conversion utilities
    - Implement image quality validation
    - Write unit tests for image processing functions
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 9. Implement API routes and middleware integration
  - [ ] 9.1 Create document management routes
    - Set up multer middleware for file uploads
    - Create RESTful routes for document operations
    - Add route parameter validation and sanitization
    - Implement rate limiting for upload endpoints
    - Write integration tests for document routes
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 8.1, 8.2_

  - [ ] 9.2 Create annual leave planning routes
    - Set up routes for leave plan CRUD operations
    - Add leave plan approval workflow routes
    - Implement leave balance integration routes
    - Create leave plan reporting and analytics routes
    - Write integration tests for leave planning routes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 10. Add comprehensive error handling
  - [ ] 10.1 Implement document-specific error handlers
    - Create file upload error handling with specific messages
    - Add storage quota and permission error responses
    - Implement document not found error handling
    - Create validation error responses with detailed feedback
    - Write unit tests for error handling scenarios
    - _Requirements: 1.2, 2.2, 3.2, 4.2, 6.2, 8.1, 8.4_

  - [ ] 10.2 Add leave planning error handling
    - Implement date validation error responses
    - Create leave balance insufficient error handling
    - Add conflict detection error messages
    - Implement approval workflow error handling
    - Write unit tests for leave planning error scenarios
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [ ] 11. Create integration tests and end-to-end testing
  - [ ] 11.1 Write document management integration tests
    - Test complete document upload and retrieval workflows
    - Verify permission enforcement across different user roles
    - Test file storage integration with Supabase
    - Validate error handling in real scenarios
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.1, 7.1, 8.1_

  - [ ] 11.2 Write leave planning integration tests
    - Test complete leave planning workflow from creation to approval
    - Verify leave balance integration and conflict detection
    - Test manager approval workflows
    - Validate date validation and business rules
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 12. Update database migrations and seed data
  - [ ] 12.1 Create production-ready database migrations
    - Write migration scripts for new tables and enums
    - Add proper indexes for performance optimization
    - Create RLS policies for document security
    - Add foreign key constraints and data integrity rules
    - Test migrations on development and staging environments
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 8.1, 8.2, 8.3_

  - [ ] 12.2 Create seed data for testing and development
    - Add sample document categories and validation rules
    - Create test employee documents for development
    - Add sample leave plans and approval workflows
    - Create test data for different permission scenarios
    - Write scripts for data cleanup and reset
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_