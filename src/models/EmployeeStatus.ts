import Joi from 'joi';
import { 
  validateAndThrow, 
  ValidationError, 
  optionalStringSchema, 
  dateSchema,
  employeeStatusTypeSchema
} from '../utils/validation';

export type EmployeeStatusType = 'ACTIVE' | 'INACTIVE' | 'TERMINATED' | 'ON_LEAVE';

export interface EmployeeStatusData {
  current: EmployeeStatusType;
  effectiveDate: Date;
  reason?: string;
  notes?: string;
}

export class EmployeeStatus implements EmployeeStatusData {
  public current: EmployeeStatusType;
  public effectiveDate: Date;
  public reason?: string;
  public notes?: string;

  constructor(data: EmployeeStatusData) {
    this.validate(data);
    
    this.current = data.current;
    this.effectiveDate = data.effectiveDate;
    this.reason = data.reason ? data.reason.trim() : undefined;
    this.notes = data.notes ? data.notes.trim() : undefined;

    // Additional business rule validations
    this.validateBusinessRules();
  }

  private validate(data: EmployeeStatusData): void {
    const schema = Joi.object({
      current: employeeStatusTypeSchema,
      effectiveDate: dateSchema,
      reason: optionalStringSchema.max(500),
      notes: optionalStringSchema.max(1000)
    });

    validateAndThrow<EmployeeStatusData>(schema, data);
  }

  private validateBusinessRules(): void {
    // Validate that terminated status requires a reason
    if (this.current === 'TERMINATED' && !this.reason) {
      throw new ValidationError('Termination reason is required', []);
    }

    // Validate that on leave status requires a reason
    if (this.current === 'ON_LEAVE' && !this.reason) {
      throw new ValidationError('Leave reason is required', []);
    }

    // Validate effective date is not in the future
    if (this.effectiveDate > new Date()) {
      throw new ValidationError('Effective date cannot be in the future', []);
    }
  }

  public update(updates: Partial<EmployeeStatusData>): EmployeeStatus {
    const updatedData = { ...this.toJSON(), ...updates };
    return new EmployeeStatus(updatedData);
  }

  public toJSON(): EmployeeStatusData {
    const result: EmployeeStatusData = {
      current: this.current,
      effectiveDate: this.effectiveDate
    };
    
    if (this.reason !== undefined) {
      result.reason = this.reason;
    }
    
    if (this.notes !== undefined) {
      result.notes = this.notes;
    }
    
    return result;
  }

  public isActive(): boolean {
    return this.current === 'ACTIVE';
  }

  public isTerminated(): boolean {
    return this.current === 'TERMINATED';
  }

  public isOnLeave(): boolean {
    return this.current === 'ON_LEAVE';
  }

  public isInactive(): boolean {
    return this.current === 'INACTIVE';
  }

  // Status transition validation
  public canTransitionTo(newStatus: EmployeeStatusType): boolean {
    return EmployeeStatus.isValidTransition(this.current, newStatus);
  }

  public static isValidTransition(fromStatus: EmployeeStatusType, toStatus: EmployeeStatusType): boolean {
    // Define valid status transitions
    const validTransitions: Record<EmployeeStatusType, EmployeeStatusType[]> = {
      'ACTIVE': ['INACTIVE', 'ON_LEAVE', 'TERMINATED'],
      'INACTIVE': ['ACTIVE', 'TERMINATED'],
      'ON_LEAVE': ['ACTIVE', 'INACTIVE', 'TERMINATED'],
      'TERMINATED': [] // No transitions allowed from terminated status
    };

    return validTransitions[fromStatus].includes(toStatus);
  }

  public validateTransitionTo(newStatus: EmployeeStatusType): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${this.current} to ${newStatus}`,
        []
      );
    }
  }

  // Static factory methods for common status changes
  public static createActive(effectiveDate: Date = new Date()): EmployeeStatus {
    return new EmployeeStatus({
      current: 'ACTIVE',
      effectiveDate
    });
  }

  public static createTerminated(reason: string, effectiveDate: Date = new Date(), notes?: string): EmployeeStatus {
    const data: EmployeeStatusData = {
      current: 'TERMINATED',
      effectiveDate,
      reason
    };
    
    if (notes !== undefined) {
      data.notes = notes;
    }
    
    return new EmployeeStatus(data);
  }

  public static createOnLeave(reason: string, effectiveDate: Date = new Date(), notes?: string): EmployeeStatus {
    const data: EmployeeStatusData = {
      current: 'ON_LEAVE',
      effectiveDate,
      reason
    };
    
    if (notes !== undefined) {
      data.notes = notes;
    }
    
    return new EmployeeStatus(data);
  }

  public static createInactive(reason?: string, effectiveDate: Date = new Date(), notes?: string): EmployeeStatus {
    const data: EmployeeStatusData = {
      current: 'INACTIVE',
      effectiveDate
    };
    
    if (reason !== undefined) {
      data.reason = reason;
    }
    
    if (notes !== undefined) {
      data.notes = notes;
    }
    
    return new EmployeeStatus(data);
  }
}