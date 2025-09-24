import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { 
  validateAndThrow, 
  ValidationError, 
  optionalStringSchema, 
  dateSchema,
  employeeStatusTypeSchema,
  uuidSchema
} from '../utils/validation';

export type EmployeeStatusType = 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export interface EmployeeStatusHistoryData {
  id?: string;
  employeeId: string;
  previousStatus?: EmployeeStatusType;
  newStatus: EmployeeStatusType;
  effectiveDate: Date;
  reason?: string;
  notes?: string;
  changedBy: string;
  changedAt?: Date;
}

export class EmployeeStatusHistory implements EmployeeStatusHistoryData {
  public id: string;
  public employeeId: string;
  public previousStatus?: EmployeeStatusType;
  public newStatus: EmployeeStatusType;
  public effectiveDate: Date;
  public reason?: string;
  public notes?: string;
  public changedBy: string;
  public changedAt: Date;

  constructor(data: EmployeeStatusHistoryData) {
    this.validate(data);
    
    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId;
    this.previousStatus = data.previousStatus;
    this.newStatus = data.newStatus;
    this.effectiveDate = data.effectiveDate;
    this.reason = data.reason ? data.reason.trim() : undefined;
    this.notes = data.notes ? data.notes.trim() : undefined;
    this.changedBy = data.changedBy;
    this.changedAt = data.changedAt || new Date();

    // Additional business rule validations
    this.validateBusinessRules();
  }

  private validate(data: EmployeeStatusHistoryData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      employeeId: uuidSchema,
      previousStatus: employeeStatusTypeSchema.optional(),
      newStatus: employeeStatusTypeSchema,
      effectiveDate: dateSchema,
      reason: optionalStringSchema.max(500),
      notes: optionalStringSchema.max(1000),
      changedBy: uuidSchema,
      changedAt: Joi.date().optional()
    });

    validateAndThrow<EmployeeStatusHistoryData>(schema, data);
  }

  private validateBusinessRules(): void {
    // Validate that terminated status requires a reason
    if (this.newStatus === 'TERMINATED' && !this.reason) {
      throw new ValidationError('Termination reason is required', []);
    }

    // Validate that on leave status requires a reason
    if (this.newStatus === 'ON_LEAVE' && !this.reason) {
      throw new ValidationError('Leave reason is required', []);
    }

    // Validate effective date is not in the future
    if (this.effectiveDate > new Date()) {
      throw new ValidationError('Effective date cannot be in the future', []);
    }

    // Validate that status is actually changing
    if (this.previousStatus && this.previousStatus === this.newStatus) {
      throw new ValidationError('New status must be different from previous status', []);
    }
  }

  public toJSON(): EmployeeStatusHistoryData {
    const result: EmployeeStatusHistoryData = {
      id: this.id,
      employeeId: this.employeeId,
      newStatus: this.newStatus,
      effectiveDate: this.effectiveDate,
      changedBy: this.changedBy,
      changedAt: this.changedAt
    };
    
    if (this.previousStatus !== undefined) {
      result.previousStatus = this.previousStatus;
    }
    
    if (this.reason !== undefined) {
      result.reason = this.reason;
    }
    
    if (this.notes !== undefined) {
      result.notes = this.notes;
    }
    
    return result;
  }

  public isStatusChange(): boolean {
    return this.previousStatus !== undefined && this.previousStatus !== this.newStatus;
  }

  public isInitialStatus(): boolean {
    return this.previousStatus === undefined;
  }

  public isTermination(): boolean {
    return this.newStatus === 'TERMINATED';
  }

  public isLeave(): boolean {
    return this.newStatus === 'ON_LEAVE';
  }

  public isActivation(): boolean {
    return this.newStatus === 'ACTIVE';
  }

  public isDeactivation(): boolean {
    return this.newStatus === 'INACTIVE';
  }

  // Static factory methods for common status changes
  public static createInitialStatus(
    employeeId: string, 
    status: EmployeeStatusType, 
    effectiveDate: Date, 
    changedBy: string,
    reason?: string,
    notes?: string
  ): EmployeeStatusHistory {
    const data: EmployeeStatusHistoryData = {
      employeeId,
      newStatus: status,
      effectiveDate,
      changedBy
    };
    
    if (reason !== undefined) {
      data.reason = reason;
    }
    
    if (notes !== undefined) {
      data.notes = notes;
    }
    
    return new EmployeeStatusHistory(data);
  }

  public static createStatusChange(
    employeeId: string,
    previousStatus: EmployeeStatusType,
    newStatus: EmployeeStatusType,
    effectiveDate: Date,
    changedBy: string,
    reason?: string,
    notes?: string
  ): EmployeeStatusHistory {
    const data: EmployeeStatusHistoryData = {
      employeeId,
      previousStatus,
      newStatus,
      effectiveDate,
      changedBy
    };
    
    if (reason !== undefined) {
      data.reason = reason;
    }
    
    if (notes !== undefined) {
      data.notes = notes;
    }
    
    return new EmployeeStatusHistory(data);
  }

  public static createTermination(
    employeeId: string,
    previousStatus: EmployeeStatusType,
    reason: string,
    effectiveDate: Date,
    changedBy: string,
    notes?: string
  ): EmployeeStatusHistory {
    return EmployeeStatusHistory.createStatusChange(
      employeeId,
      previousStatus,
      'TERMINATED',
      effectiveDate,
      changedBy,
      reason,
      notes
    );
  }

  public static createLeave(
    employeeId: string,
    previousStatus: EmployeeStatusType,
    reason: string,
    effectiveDate: Date,
    changedBy: string,
    notes?: string
  ): EmployeeStatusHistory {
    return EmployeeStatusHistory.createStatusChange(
      employeeId,
      previousStatus,
      'ON_LEAVE',
      effectiveDate,
      changedBy,
      reason,
      notes
    );
  }
}