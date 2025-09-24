import Joi from 'joi';
import { 
  validateAndThrow, 
  requiredStringSchema, 
  dateSchema, 
  employmentTypeSchema,
  uuidSchema
} from '../utils/validation';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

export interface JobInfoData {
  jobTitle: string;
  department: string;
  managerId?: string;
  startDate: Date;
  employmentType: EmploymentType;
  salary?: number; // Encrypted, restricted access
  location: string;
}

export class JobInfo implements JobInfoData {
  public jobTitle: string;
  public department: string;
  public managerId?: string;
  public startDate: Date;
  public employmentType: EmploymentType;
  public salary?: number;
  public location: string;

  constructor(data: JobInfoData) {
    this.validate(data);
    
    this.jobTitle = data.jobTitle.trim();
    this.department = data.department.trim();
    this.managerId = data.managerId;
    this.startDate = data.startDate;
    this.employmentType = data.employmentType;
    this.salary = data.salary;
    this.location = data.location.trim();
  }

  private validate(data: JobInfoData): void {
    const schema = Joi.object({
      jobTitle: requiredStringSchema.max(100),
      department: requiredStringSchema.max(50),
      managerId: uuidSchema.optional(),
      startDate: dateSchema,
      employmentType: employmentTypeSchema,
      salary: Joi.number().min(0).optional(),
      location: requiredStringSchema.max(100)
    });

    validateAndThrow<JobInfoData>(schema, data);
  }

  public update(updates: Partial<JobInfoData>): JobInfo {
    const updatedData = { ...this.toJSON(), ...updates };
    return new JobInfo(updatedData);
  }

  public toJSON(): JobInfoData {
    return {
      jobTitle: this.jobTitle,
      department: this.department,
      managerId: this.managerId,
      startDate: this.startDate,
      employmentType: this.employmentType,
      salary: this.salary,
      location: this.location
    };
  }

  public isFullTime(): boolean {
    return this.employmentType === 'FULL_TIME';
  }

  public isContractor(): boolean {
    return this.employmentType === 'CONTRACT';
  }

  public getYearsOfService(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.startDate.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    return Math.floor(diffYears);
  }
}