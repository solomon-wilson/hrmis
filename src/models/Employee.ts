import { PersonalInfo } from './PersonalInfo';
import { JobInfo } from './JobInfo';
import { EmployeeStatus } from './EmployeeStatus';

export interface Employee {
  id: string; // UUID primary key
  employeeId: string; // Human-readable employee ID
  personalInfo: PersonalInfo;
  jobInfo: JobInfo;
  status: EmployeeStatus;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}