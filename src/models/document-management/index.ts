// Document Management Models
export * from './StaffDocument';
export * from './AnnualLeavePlan';

// Re-export types for convenience
export type {
  DocumentCategory,
  DocumentStatus,
  StaffDocumentData
} from './StaffDocument';

export type {
  AnnualLeaveStatus,
  PlannedLeave,
  AnnualLeavePlanData
} from './AnnualLeavePlan';