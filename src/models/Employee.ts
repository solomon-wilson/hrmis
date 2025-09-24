import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { PersonalInfo, PersonalInfoData } from './PersonalInfo';
import { JobInfo, JobInfoData } from './JobInfo';
import { EmployeeStatus, EmployeeStatusData } from './EmployeeStatus';
import {
  validateAndThrow,
  ValidationError,
  requiredStringSchema,
  uuidSchema
} from '../utils/validation';

export interface EmployeeData {
  id?: string; // UUID primary key - optional for creation
  employeeId: string; // Human-readable employee ID
  personalInfo: PersonalInfoData;
  jobInfo: JobInfoData;
  status: EmployeeStatusData;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: string;
  updatedBy: string;
}

export class Employee {
  public id: string;
  public employeeId: string;
  public personalInfo: PersonalInfo;
  public jobInfo: JobInfo;
  public status: EmployeeStatus;
  public createdAt: Date;
  public updatedAt: Date;
  public createdBy: string;
  public updatedBy: string;

  constructor(data: EmployeeData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId.trim();
    this.personalInfo = new PersonalInfo(data.personalInfo);
    this.jobInfo = new JobInfo(data.jobInfo);
    this.status = new EmployeeStatus(data.status);
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.createdBy = data.createdBy.trim();
    this.updatedBy = data.updatedBy.trim();

    // Additional business rule validations
    this.validateBusinessRules();
  }

  private validate(data: EmployeeData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      employeeId: requiredStringSchema.max(20).pattern(/^[A-Z0-9-]+$/),
      personalInfo: Joi.object().required(),
      jobInfo: Joi.object().required(),
      status: Joi.object().required(),
      createdAt: Joi.date().optional(),
      updatedAt: Joi.date().optional(),
      createdBy: uuidSchema,
      updatedBy: uuidSchema
    });

    validateAndThrow<EmployeeData>(schema, data);
  }

  private validateBusinessRules(): void {
    // Validate that employee email is unique (this would typically be done at service level)
    if (!this.personalInfo.validateEmail()) {
      throw new ValidationError('Invalid email format', []);
    }

    // Validate that start date is not in the future
    if (this.jobInfo.startDate > new Date()) {
      throw new ValidationError('Start date cannot be in the future', []);
    }

    // Validate that if employee has a manager, they can't be their own manager
    if (this.jobInfo.managerId === this.id) {
      throw new ValidationError('Employee cannot be their own manager', []);
    }

    // Validate status consistency
    if (this.status.current === 'TERMINATED' && !this.status.reason) {
      throw new ValidationError('Termination reason is required for terminated employees', []);
    }

    if (this.status.current === 'ON_LEAVE' && !this.status.reason) {
      throw new ValidationError('Leave reason is required for employees on leave', []);
    }
  }

  public update(updates: Partial<EmployeeData>, updatedBy: string): Employee {
    const updatedData: EmployeeData = {
      ...this.toJSON(),
      ...updates,
      updatedBy,
      updatedAt: new Date()
    };

    return new Employee(updatedData);
  }

  public updatePersonalInfo(updates: Partial<PersonalInfoData>, updatedBy: string): Employee {
    const updatedPersonalInfo = this.personalInfo.update(updates);
    return this.update({ personalInfo: updatedPersonalInfo.toJSON() }, updatedBy);
  }

  public updateJobInfo(updates: Partial<JobInfoData>, updatedBy: string): Employee {
    const updatedJobInfo = this.jobInfo.update(updates);
    return this.update({ jobInfo: updatedJobInfo.toJSON() }, updatedBy);
  }

  public updateStatus(newStatus: EmployeeStatusData, updatedBy: string): Employee {
    return this.update({ status: newStatus }, updatedBy);
  }

  public toJSON(): EmployeeData {
    return {
      id: this.id,
      employeeId: this.employeeId,
      personalInfo: this.personalInfo.toJSON(),
      jobInfo: this.jobInfo.toJSON(),
      status: this.status.toJSON(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy
    };
  }

  public getFullName(): string {
    return this.personalInfo.getFullName();
  }

  public isActive(): boolean {
    return this.status.current === 'ACTIVE';
  }

  public isTerminated(): boolean {
    return this.status.current === 'TERMINATED';
  }

  public isOnLeave(): boolean {
    return this.status.current === 'ON_LEAVE';
  }

  public getYearsOfService(): number {
    return this.jobInfo.getYearsOfService();
  }

  public hasManager(): boolean {
    return !!this.jobInfo.managerId;
  }

  public validateForCreation(): void {
    // Additional validation rules specific to employee creation
    if (!this.personalInfo.email) {
      throw new ValidationError('Email is required for employee creation', []);
    }

    if (!this.jobInfo.startDate) {
      throw new ValidationError('Start date is required for employee creation', []);
    }

    if (this.status.current !== 'ACTIVE' && this.status.current !== 'INACTIVE') {
      throw new ValidationError('New employees must have ACTIVE or INACTIVE status', []);
    }
  }

  public validateForUpdate(): void {
    // Validation rules specific to employee updates
    if (this.isTerminated() && this.status.current !== 'TERMINATED') {
      throw new ValidationError('Cannot change status of terminated employee', []);
    }
  }

  // Static factory methods
  public static createNew(data: Omit<EmployeeData, 'id' | 'createdAt' | 'updatedAt'>): Employee {
    const employee = new Employee({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    employee.validateForCreation();
    return employee;
  }

  public static fromJSON(data: EmployeeData): Employee {
    return new Employee(data);
  }
}