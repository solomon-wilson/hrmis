export type EmployeeStatusType = 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export interface EmployeeStatus {
  current: EmployeeStatusType;
  effectiveDate: Date;
  reason?: string;
  notes?: string;
}