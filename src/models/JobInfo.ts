export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

export interface JobInfo {
  jobTitle: string;
  department: string;
  managerId?: string;
  startDate: Date;
  employmentType: EmploymentType;
  salary?: number; // Encrypted, restricted access
  location: string;
}