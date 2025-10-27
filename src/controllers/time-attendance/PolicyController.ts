import { Request, Response, NextFunction } from 'express';
import { PolicyEngine } from '../../services/time-attendance/PolicyEngine';
import { PolicyRepository } from '../../database/repositories/time-attendance/PolicyRepository';
import { AppError } from '../../utils/errors';
import { validateRequest } from '../../utils/validation';
import { z } from 'zod';

/**
 * Policy Controller
 * Handles policy management and configuration for leave and overtime policies
 */
export class PolicyController {
  private policyEngine: PolicyEngine;
  private policyRepository: PolicyRepository;

  constructor(policyEngine: PolicyEngine, policyRepository: PolicyRepository) {
    this.policyEngine = policyEngine;
    this.policyRepository = policyRepository;
  }

  /**
   * Get all policies
   * GET /api/policies
   */
  public getPolicies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        type: z.enum(['LEAVE', 'OVERTIME']).optional(),
        active: z.string().optional().transform(val => val === 'true')
      });

      const validatedData = validateRequest(req.query, schema);

      const policies = await this.policyRepository.findAll({
        type: validatedData.type,
        active: validatedData.active
      });

      res.status(200).json({
        success: true,
        data: policies
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get policy by ID
   * GET /api/policies/:id
   */
  public getPolicyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params.id;

      if (!policyId) {
        throw new AppError('Policy ID is required', 400, 'VALIDATION_ERROR');
      }

      const policy = await this.policyRepository.findById(policyId);

      if (!policy) {
        throw new AppError('Policy not found', 404, 'NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: policy
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create a new policy
   * POST /api/policies
   */
  public createPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        name: z.string().min(3).max(100),
        description: z.string().optional(),
        type: z.enum(['LEAVE', 'OVERTIME']),
        rules: z.record(z.any()),
        effectiveDate: z.string().datetime().transform(val => new Date(val)),
        expiryDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        applicableEmployeeGroups: z.array(z.string()).optional(),
        createdBy: z.string().uuid()
      });

      const validatedData = validateRequest(req.body, schema);

      const policy = await this.policyRepository.create({
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        rules: validatedData.rules,
        effectiveDate: validatedData.effectiveDate,
        expiryDate: validatedData.expiryDate,
        applicableEmployeeGroups: validatedData.applicableEmployeeGroups,
        active: true,
        createdBy: validatedData.createdBy
      });

      res.status(201).json({
        success: true,
        message: 'Policy created successfully',
        data: policy
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update a policy
   * PUT /api/policies/:id
   */
  public updatePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params.id;

      const schema = z.object({
        name: z.string().min(3).max(100).optional(),
        description: z.string().optional(),
        rules: z.record(z.any()).optional(),
        effectiveDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        expiryDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
        applicableEmployeeGroups: z.array(z.string()).optional(),
        active: z.boolean().optional(),
        updatedBy: z.string().uuid()
      });

      const validatedData = validateRequest(req.body, schema);

      const policy = await this.policyRepository.update(policyId, {
        name: validatedData.name,
        description: validatedData.description,
        rules: validatedData.rules,
        effectiveDate: validatedData.effectiveDate,
        expiryDate: validatedData.expiryDate,
        applicableEmployeeGroups: validatedData.applicableEmployeeGroups,
        active: validatedData.active
      });

      res.status(200).json({
        success: true,
        message: 'Policy updated successfully',
        data: policy
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete/deactivate a policy
   * DELETE /api/policies/:id
   */
  public deletePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params.id;

      if (!policyId) {
        throw new AppError('Policy ID is required', 400, 'VALIDATION_ERROR');
      }

      // Soft delete by deactivating
      await this.policyRepository.update(policyId, { active: false });

      res.status(200).json({
        success: true,
        message: 'Policy deactivated successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Validate policy rules
   * POST /api/policies/validate
   */
  public validatePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        type: z.enum(['LEAVE', 'OVERTIME']),
        rules: z.record(z.any())
      });

      const validatedData = validateRequest(req.body, schema);

      const validation = await this.policyEngine.validatePolicyRules(
        validatedData.type,
        validatedData.rules
      );

      res.status(200).json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Analyze policy impact
   * POST /api/policies/analyze-impact
   */
  public analyzePolicyImpact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        policyId: z.string().uuid(),
        employeeGroups: z.array(z.string()).optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const impact = await this.policyEngine.analyzePolicyImpact(
        validatedData.policyId,
        validatedData.employeeGroups
      );

      res.status(200).json({
        success: true,
        data: impact
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Assign policy to employee groups
   * POST /api/policies/:id/assign
   */
  public assignPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policyId = req.params.id;

      const schema = z.object({
        employeeGroups: z.array(z.string()),
        effectiveDate: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined)
      });

      const validatedData = validateRequest(req.body, schema);

      await this.policyRepository.assignToEmployeeGroups(
        policyId,
        validatedData.employeeGroups,
        validatedData.effectiveDate
      );

      res.status(200).json({
        success: true,
        message: 'Policy assigned successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Run accrual processing batch job
   * POST /api/policies/accrual/run
   */
  public runAccrualProcessing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeIds: z.array(z.string().uuid()).optional(),
        leaveTypeId: z.string().uuid().optional(),
        processingDate: z.string().datetime().optional().transform(val => val ? new Date(val) : new Date())
      });

      const validatedData = validateRequest(req.body, schema);

      const results = await this.policyEngine.runAccrualProcessing({
        employeeIds: validatedData.employeeIds,
        leaveTypeId: validatedData.leaveTypeId,
        processingDate: validatedData.processingDate
      });

      res.status(200).json({
        success: true,
        message: 'Accrual processing completed',
        data: results
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Manual balance adjustment
   * POST /api/policies/balance/adjust
   */
  public adjustBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schema = z.object({
        employeeId: z.string().uuid(),
        leaveTypeId: z.string().uuid(),
        adjustmentAmount: z.number(),
        reason: z.string().min(10).max(500),
        adjustedBy: z.string().uuid(),
        requiresApproval: z.boolean().optional()
      });

      const validatedData = validateRequest(req.body, schema);

      const result = await this.policyEngine.adjustLeaveBalance({
        employeeId: validatedData.employeeId,
        leaveTypeId: validatedData.leaveTypeId,
        adjustmentAmount: validatedData.adjustmentAmount,
        reason: validatedData.reason,
        adjustedBy: validatedData.adjustedBy,
        requiresApproval: validatedData.requiresApproval
      });

      res.status(200).json({
        success: true,
        message: 'Balance adjustment processed',
        data: result
      });
    } catch (error) {
      next(error);
    }
  };
}
