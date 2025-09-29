// Document Management Services
export * from './FileStorageService';
export * from './DocumentService';

// Re-export types for convenience
export type {
  FileUploadRequest,
  UploadResult,
  StorageBucketConfig
} from './FileStorageService';

export type {
  DocumentUploadRequest,
  DocumentSearchCriteria,
  DocumentListOptions
} from './DocumentService';