import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import {
  validateAndThrow,
  ValidationError,
  requiredStringSchema,
  uuidSchema
} from '../../utils/validation';

export interface LeaveTypeData {
  id?: string;
  name: string;
  code: string;
  paid: boolean;
  requiresApproval: boolean;
  maxConsecutiveDays?: number;
  advanceNoticeRequired?: number; // in days
  allowsPartialDays: boolean;
  accrualBased: boolean;
  description?: string;
  isActive: boolean;
}

export interface LeaveRequestData {
  id?: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  totalHours: number;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
  submittedAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  attachments?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class LeaveType {
  public id: string;
  public name: string;
  public code: string;
  public paid: boolean;
  public requiresApproval: boolean;
  public maxConsecutiveDays?: number;
  public advanceNoticeRequired?: number;
  public allowsPartialDays: boolean;
  public accrualBased: boolean;
  public description?: string;
  public isActive: boolean;

  constructor(data: LeaveTypeData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.name = data.name.trim();
    this.code = data.code.trim().toUpperCase();
    this.paid = data.paid;
    this.requiresApproval = data.requiresApproval;
    this.maxConsecutiveDays = data.maxConsecutiveDays;
    this.advanceNoticeRequired = data.advanceNoticeRequired;
    this.allowsPartialDays = data.allowsPartialDays;
    this.accrualBased = data.accrualBased;
    this.description = data.description?.trim();
    this.isActive = data.isActive;

    this.validateBusinessRules();
  }

  private validate(data: LeaveTypeData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      name: requiredStringSchema.max(100),
      code: requiredStringSchema.max(10).pattern(/^[A-Za-z0-9_]+$/),
      paid: Joi.boolean().required(),
      requiresApproval: Joi.boolean().required(),
      maxConsecutiveDays: Joi.number().min(1).optional(),
      advanceNoticeRequired: Joi.number().min(0).optional(),
      allowsPartialDays: Joi.boolean().required(),
      accrualBased: Joi.boolean().required(),
      description: Joi.string().max(500).optional(),
      isActive: Joi.boolean().required()
    });

    validateAndThrow<LeaveTypeData>(schema, data);
  }

  private validateBusinessRules(): void {
    if (this.maxConsecutiveDays && this.maxConsecutiveDays <= 0) {
      throw new ValidationError('Maximum consecutive days must be positive', []);
    }

    if (this.advanceNoticeRequired && this.advanceNoticeRequired < 0) {
      throw new ValidationError('Advance notice cannot be negative', []);
    }
  }

  public validateLeaveRequest(request: LeaveRequest): { isValid: boolean; violations: string[] } {
    const violations: string[] = [];

    if (this.maxConsecutiveDays && !request.validateMaxConsecutiveDays(this.maxConsecutiveDays)) {
      violations.push(`Leave request exceeds maximum consecutive days limit of ${this.maxConsecutiveDays}`);
    }

    if (this.advanceNoticeRequired && !request.validateAdvanceNotice(this.advanceNoticeRequired)) {
      violations.push(`Leave request does not meet advance notice requirement of ${this.advanceNoticeRequired} days`);
    }

    if (!this.allowsPartialDays && request.totalHours % 8 !== 0) {
      violations.push('This leave type does not allow partial day requests');
    }

    if (!this.isActive) {
      violations.push('This leave type is currently inactive');
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  public canBeUsedBy(employeeData: { accrualBalance?: number }): boolean {
    if (!this.isActive) return false;
    
    if (this.accrualBased && (!employeeData.accrualBalance || employeeData.accrualBalance <= 0)) {
      return false;
    }

    return true;
  }

  public toJSON(): LeaveTypeData {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      paid: this.paid,
      requiresApproval: this.requiresApproval,
      maxConsecutiveDays: this.maxConsecutiveDays,
      advanceNoticeRequired: this.advanceNoticeRequired,
      allowsPartialDays: this.allowsPartialDays,
      accrualBased: this.accrualBased,
      description: this.description,
      isActive: this.isActive
    };
  }
}

export class LeaveRequest {
  public id: string;
  public employeeId: string;
  public leaveTypeId: string;
  public startDate: Date;
  public endDate: Date;
  public totalDays: number;
  public totalHours: number;
  public reason?: string;
  public status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED';
  public submittedAt: Date;
  public reviewedBy?: string;
  public reviewedAt?: Date;
  public reviewNotes?: string;
  public attachments: string[];
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: LeaveRequestData) {
    this.validate(data);

    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId;
    this.leaveTypeId = data.leaveTypeId;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.totalDays = data.totalDays;
    this.totalHours = data.totalHours;
    this.reason = data.reason?.trim();
    this.status = data.status;
    this.submittedAt = data.submittedAt || new Date();
    this.reviewedBy = data.reviewedBy;
    this.reviewedAt = data.reviewedAt;
    this.reviewNotes = data.reviewNotes?.trim();
    this.attachments = data.attachments || [];
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();

    this.validateBusinessRules();
  }

  private validate(data: LeaveRequestData): void {
    const schema = Joi.object({
      id: uuidSchema.optional(),
      employeeId: uuidSchema,
      leaveTypeId: uuidSchema,
      startDate: Joi.date().required(),
      endDate: Joi.date().required(),
      totalDays: Joi.number().min(0).required(),
      totalHours: Joi.number().min(0).required(),
      reason: Joi.string().max(1000).optional(),
      status: Joi.string().valid('PENDING', 'APPROVED', 'DENIED', 'CANCELLED').required(),
      submittedAt: Joi.date().optional(),
      reviewedBy: uuidSchema.optional(),
      reviewedAt: Joi.date().optional(),
      reviewNotes: Joi.string().max(1000).optional(),
      attachments: Joi.array().items(Joi.string()).optional(),
      createdAt: Joi.date().optional(),
      updatedAt: Joi.date().optional()
    });

    validateAndThrow<LeaveRequestData>(schema, data);
  }

  private validateBusinessRules(): void {
    if (this.startDate >= this.endDate) {
      throw new ValidationError('End date must be after start date', []);
    }

    if (this.startDate < new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      throw new ValidationError('Leave request cannot be for past dates', []);
    }

    if (this.totalDays <= 0) {
      throw new ValidationError('Total days must be positive', []);
    }

    if (this.totalHours <= 0) {
      throw new ValidationError('Total hours must be positive', []);
    }

    if (this.status === 'APPROVED' || this.status === 'DENIED') {
      if (!this.reviewedBy || !this.reviewedAt) {
        throw new ValidationError('Reviewed requests must have reviewer and review date', []);
      }
    }

    if (this.status === 'DENIED' && !this.reviewNotes) {
      throw new ValidationError('Denied requests must have review notes explaining the reason', []);
    }
  }

  public validateAdvanceNotice(requiredDays: number): boolean {
    const daysDifference = Math.ceil((this.startDate.getTime() - this.submittedAt.getTime()) / (1000 * 60 * 60 * 24));
    return daysDifference >= requiredDays;
  }

  public checkDateConflict(existingRequests: LeaveRequest[]): LeaveRequest[] {
    return existingRequests.filter(request => {
      if (request.id === this.id || request.status === 'DENIED' || request.status === 'CANCELLED') {
        return false;
      }
      
      return (
        (this.startDate >= request.startDate && this.startDate <= request.endDate) ||
        (this.endDate >= request.startDate && this.endDate <= request.endDate) ||
        (this.startDate <= request.startDate && this.endDate >= request.endDate)
      );
    });
  }

  public isInBlackoutPeriod(blackoutPeriods: { startDate: Date; endDate: Date; description: string }[]): { isBlocked: boolean; conflictingPeriods: any[] } {
    const conflictingPeriods = blackoutPeriods.filter(period => {
      return (
        (this.startDate >= period.startDate && this.startDate <= period.endDate) ||
        (this.endDate >= period.startDate && this.endDate <= period.endDate) ||
        (this.startDate <= period.startDate && this.endDate >= period.endDate)
      );
    });

    return {
      isBlocked: conflictingPeriods.length > 0,
      conflictingPeriods
    };
  }

  public validateMaxConsecutiveDays(maxDays: number): boolean {
    return this.totalDays <= maxDays;
  }

  public calculateBusinessDays(): number {
    let count = 0;
    const current = new Date(this.startDate);
    
    while (current <= this.endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  }

  public isPending(): boolean {
    return this.status === 'PENDING';
  }

  public isApproved(): boolean {
    return this.status === 'APPROVED';
  }

  public isDenied(): boolean {
    return this.status === 'DENIED';
  }

  public isCancelled(): boolean {
    return this.status === 'CANCELLED';
  }

  public canBeModified(): boolean {
    return this.status === 'PENDING';
  }

  public approve(reviewedBy: string, reviewNotes?: string): LeaveRequest {
    return new LeaveRequest({
      ...this.toJSON(),
      status: 'APPROVED',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes,
      updatedAt: new Date()
    });
  }

  public deny(reviewedBy: string, reviewNotes: string): LeaveRequest {
    return new LeaveRequest({
      ...this.toJSON(),
      status: 'DENIED',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes,
      updatedAt: new Date()
    });
  }

  public cancel(): LeaveRequest {
    if (!this.canBeModified()) {
      throw new ValidationError('Cannot cancel request that is not pending', []);
    }

    return new LeaveRequest({
      ...this.toJSON(),
      status: 'CANCELLED',
      updatedAt: new Date()
    });
  }

  public toJSON(): LeaveRequestData {
    return {
      id: this.id,
      employeeId: this.employeeId,
      leaveTypeId: this.leaveTypeId,
      startDate: this.startDate,
      endDate: this.endDate,
      totalDays: this.totalDays,
      totalHours: this.totalHours,
      reason: this.reason,
      status: this.status,
      submittedAt: this.submittedAt,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt,
      reviewNotes: this.reviewNotes,
      attachments: this.attachments,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  public static createNew(
    employeeId: string,
    leaveTypeId: string,
    startDate: Date,
    endDate: Date,
    totalDays: number,
    totalHours: number,
    reason?: string
  ): LeaveRequest {
    return new LeaveRequest({
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      totalHours,
      reason,
      status: 'PENDING',
      attachments: []
    });
  }
}