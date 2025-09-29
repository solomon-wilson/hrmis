// Export base repository classes and interfaces
export * from './base';
export * from './supabase-base';
export * from './types';

// Export specific repositories
export * from './employee';
export * from './supabase-employee';
export * from './audit';
export * from './user';

// Export document management repositories
export * from './StaffDocumentRepository';
export * from './AnnualLeavePlanRepository';

// Export Supabase repository instances
export { SupabaseEmployeeRepository } from './supabase-employee';
export { StaffDocumentRepository } from './StaffDocumentRepository';
export { AnnualLeavePlanRepository } from './AnnualLeavePlanRepository';