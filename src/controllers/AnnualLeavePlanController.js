import { logger } from '../utils/logger';
import { ValidationError } from '../utils/validation';
import { AnnualLeavePlanRepository } from '../database/repositories/AnnualLeavePlanRepository';
import { AnnualLeavePlan } from '../models/document-management';
export class AnnualLeavePlanController {
    constructor() {
        /**
         * Create a new annual leave plan
         * POST /api/leave-plans
         */
        this.createLeavePlan = async (req, res) => {
            try {
                logger.info('Create leave plan request received', {
                    userId: req.user?.id,
                    employeeId: req.body.employeeId,
                    year: req.body.year
                });
                const { employeeId, year, totalEntitlement, carriedOver, plannedLeaves } = req.body;
                // Validate required fields
                if (!employeeId || !year || totalEntitlement === undefined) {
                    res.status(400).json({
                        success: false,
                        message: 'Missing required fields',
                        errors: ['employeeId, year, and totalEntitlement are required']
                    });
                    return;
                }
                // Permission check - users can only create plans for themselves unless they're HR/admin
                const currentUser = req.user;
                if (employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to create leave plans for other employees'
                    });
                    return;
                }
                // Validate year range
                const currentYear = new Date().getFullYear();
                if (year < currentYear || year > currentYear + 2) {
                    res.status(400).json({
                        success: false,
                        message: 'Invalid year',
                        errors: [`Year must be between ${currentYear} and ${currentYear + 2}`]
                    });
                    return;
                }
                // Check if plan already exists for this employee and year
                const existingPlan = await this.leavePlanRepository.findByEmployeeAndYear(employeeId, year);
                if (existingPlan) {
                    res.status(409).json({
                        success: false,
                        message: 'Leave plan already exists for this employee and year'
                    });
                    return;
                }
                // Validate planned leaves if provided
                let validatedPlannedLeaves = [];
                if (plannedLeaves && Array.isArray(plannedLeaves)) {
                    try {
                        validatedPlannedLeaves = plannedLeaves.map((leave) => {
                            const plannedLeave = new AnnualLeavePlan({
                                id: '', employeeId, year, totalEntitlement,
                                carriedOver: 0, plannedLeaves: [leave],
                                status: 'DRAFT',
                                createdAt: new Date(), updatedAt: new Date()
                            }).plannedLeaves[0];
                            return plannedLeave;
                        });
                        // Check for conflicts
                        const conflictCheck = await this.leavePlanRepository.checkConflicts(employeeId, validatedPlannedLeaves);
                        if (conflictCheck.hasConflicts) {
                            res.status(400).json({
                                success: false,
                                message: 'Leave plan contains conflicts with existing plans',
                                errors: conflictCheck.conflicts.map(conflict => `Conflict: ${conflict.plannedLeave.leaveType} from ${conflict.plannedLeave.startDate} to ${conflict.plannedLeave.endDate} overlaps with existing leave`)
                            });
                            return;
                        }
                    }
                    catch (validationError) {
                        res.status(400).json({
                            success: false,
                            message: 'Invalid planned leaves',
                            errors: [validationError instanceof Error ? validationError.message : 'Invalid leave data']
                        });
                        return;
                    }
                }
                const planData = {
                    employeeId,
                    year,
                    totalEntitlement: parseFloat(totalEntitlement),
                    carriedOver: carriedOver ? parseFloat(carriedOver) : 0,
                    plannedLeaves: validatedPlannedLeaves,
                    status: 'DRAFT'
                };
                const leavePlan = await this.leavePlanRepository.create(planData);
                logger.info('Leave plan created successfully', {
                    planId: leavePlan.id,
                    employeeId: leavePlan.employeeId,
                    year: leavePlan.year
                });
                res.status(201).json({
                    success: true,
                    message: 'Leave plan created successfully',
                    data: {
                        id: leavePlan.id,
                        employeeId: leavePlan.employeeId,
                        year: leavePlan.year,
                        totalEntitlement: leavePlan.totalEntitlement,
                        carriedOver: leavePlan.carriedOver,
                        plannedLeaves: leavePlan.plannedLeaves,
                        status: leavePlan.status,
                        createdAt: leavePlan.createdAt
                    }
                });
            }
            catch (error) {
                logger.error('Error creating leave plan', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id,
                    body: req.body
                });
                if (error instanceof ValidationError) {
                    res.status(400).json({
                        success: false,
                        message: error.message,
                        errors: error.details
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error during leave plan creation'
                });
            }
        };
        /**
         * Get leave plan by ID
         * GET /api/leave-plans/:id
         */
        this.getLeavePlan = async (req, res) => {
            try {
                const { id } = req.params;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                // Permission check
                const currentUser = req.user;
                const canAccess = currentUser.roles.includes('hr_admin') ||
                    currentUser.roles.includes('manager') ||
                    leavePlan.employeeId === currentUser.employeeId;
                if (!canAccess) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to access this leave plan'
                    });
                    return;
                }
                res.json({
                    success: true,
                    data: {
                        id: leavePlan.id,
                        employeeId: leavePlan.employeeId,
                        year: leavePlan.year,
                        totalEntitlement: leavePlan.totalEntitlement,
                        carriedOver: leavePlan.carriedOver,
                        plannedLeaves: leavePlan.plannedLeaves,
                        status: leavePlan.status,
                        submittedAt: leavePlan.submittedAt,
                        managerApprovedAt: leavePlan.managerApprovedAt,
                        managerApprovedBy: leavePlan.managerApprovedBy,
                        hrApprovedAt: leavePlan.hrApprovedAt,
                        hrApprovedBy: leavePlan.hrApprovedBy,
                        rejectionReason: leavePlan.rejectionReason,
                        createdAt: leavePlan.createdAt,
                        updatedAt: leavePlan.updatedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error retrieving leave plan', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * List leave plans with filtering and pagination
         * GET /api/leave-plans
         */
        this.listLeavePlans = async (req, res) => {
            try {
                const currentUser = req.user;
                const { employeeId, year, status, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = req.query;
                // Build search criteria
                const criteria = {};
                if (employeeId) {
                    // Permission check - users can only view their own plans unless they're HR/manager
                    if (employeeId !== currentUser.employeeId &&
                        !currentUser.roles.includes('hr_admin') &&
                        !currentUser.roles.includes('manager')) {
                        res.status(403).json({
                            success: false,
                            message: 'Unauthorized to view leave plans for other employees'
                        });
                        return;
                    }
                    criteria.employeeId = employeeId;
                }
                else if (!currentUser.roles.includes('hr_admin')) {
                    // Non-HR users can only see their own plans
                    criteria.employeeId = currentUser.employeeId;
                }
                if (year)
                    criteria.year = parseInt(year);
                if (status)
                    criteria.status = status;
                const options = {
                    page: parseInt(page),
                    limit: Math.min(parseInt(limit), 100), // Cap limit at 100
                    sortBy: sortBy,
                    sortOrder: sortOrder
                };
                const result = await this.leavePlanRepository.search(criteria, options);
                res.json({
                    success: true,
                    data: {
                        plans: result.plans.map(plan => ({
                            id: plan.id,
                            employeeId: plan.employeeId,
                            year: plan.year,
                            totalEntitlement: plan.totalEntitlement,
                            carriedOver: plan.carriedOver,
                            plannedLeaves: plan.plannedLeaves,
                            status: plan.status,
                            submittedAt: plan.submittedAt,
                            managerApprovedAt: plan.managerApprovedAt,
                            managerApprovedBy: plan.managerApprovedBy,
                            hrApprovedAt: plan.hrApprovedAt,
                            hrApprovedBy: plan.hrApprovedBy,
                            rejectionReason: plan.rejectionReason,
                            createdAt: plan.createdAt,
                            updatedAt: plan.updatedAt
                        })),
                        pagination: {
                            page: result.page,
                            limit: options.limit,
                            total: result.total,
                            totalPages: result.totalPages
                        }
                    }
                });
            }
            catch (error) {
                logger.error('Error listing leave plans', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    query: req.query,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Update leave plan
         * PUT /api/leave-plans/:id
         */
        this.updateLeavePlan = async (req, res) => {
            try {
                const { id } = req.params;
                const { totalEntitlement, carriedOver, plannedLeaves } = req.body;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Permission check - users can only update their own draft plans
                if (leavePlan.employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to update this leave plan'
                    });
                    return;
                }
                // Only draft plans can be updated by employees
                if (leavePlan.status !== 'DRAFT' && !currentUser.roles.includes('hr_admin')) {
                    res.status(400).json({
                        success: false,
                        message: 'Only draft leave plans can be updated'
                    });
                    return;
                }
                const updates = {};
                if (totalEntitlement !== undefined) {
                    updates.totalEntitlement = parseFloat(totalEntitlement);
                    if (updates.totalEntitlement < 0) {
                        res.status(400).json({
                            success: false,
                            message: 'Total entitlement cannot be negative'
                        });
                        return;
                    }
                }
                if (carriedOver !== undefined) {
                    updates.carriedOver = parseFloat(carriedOver);
                    if (updates.carriedOver < 0) {
                        res.status(400).json({
                            success: false,
                            message: 'Carried over days cannot be negative'
                        });
                        return;
                    }
                }
                if (plannedLeaves && Array.isArray(plannedLeaves)) {
                    try {
                        // Validate planned leaves
                        updates.plannedLeaves = plannedLeaves.map((leave) => {
                            const plannedLeave = new AnnualLeavePlan({
                                id: '', employeeId: leavePlan.employeeId, year: leavePlan.year,
                                totalEntitlement: leavePlan.totalEntitlement, carriedOver: 0,
                                plannedLeaves: [leave], status: 'DRAFT',
                                createdAt: new Date(), updatedAt: new Date()
                            }).plannedLeaves[0];
                            return plannedLeave;
                        });
                        // Check for conflicts (excluding current plan)
                        const conflictCheck = await this.leavePlanRepository.checkConflicts(leavePlan.employeeId, updates.plannedLeaves, id);
                        if (conflictCheck.hasConflicts) {
                            res.status(400).json({
                                success: false,
                                message: 'Updated leave plan contains conflicts',
                                errors: conflictCheck.conflicts.map(conflict => `Conflict: ${conflict.plannedLeave.leaveType} from ${conflict.plannedLeave.startDate} to ${conflict.plannedLeave.endDate} overlaps with existing leave`)
                            });
                            return;
                        }
                    }
                    catch (validationError) {
                        res.status(400).json({
                            success: false,
                            message: 'Invalid planned leaves',
                            errors: [validationError instanceof Error ? validationError.message : 'Invalid leave data']
                        });
                        return;
                    }
                }
                const updatedPlan = await this.leavePlanRepository.update(id, updates);
                logger.info('Leave plan updated successfully', {
                    planId: id,
                    userId: currentUser.id,
                    updates: Object.keys(updates)
                });
                res.json({
                    success: true,
                    message: 'Leave plan updated successfully',
                    data: {
                        id: updatedPlan.id,
                        totalEntitlement: updatedPlan.totalEntitlement,
                        carriedOver: updatedPlan.carriedOver,
                        plannedLeaves: updatedPlan.plannedLeaves,
                        updatedAt: updatedPlan.updatedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error updating leave plan', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                if (error instanceof ValidationError) {
                    res.status(400).json({
                        success: false,
                        message: error.message,
                        errors: error.details
                    });
                    return;
                }
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Submit leave plan for approval
         * POST /api/leave-plans/:id/submit
         */
        this.submitLeavePlan = async (req, res) => {
            try {
                const { id } = req.params;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Permission check
                if (leavePlan.employeeId !== currentUser.employeeId && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to submit this leave plan'
                    });
                    return;
                }
                if (leavePlan.status !== 'DRAFT') {
                    res.status(400).json({
                        success: false,
                        message: 'Only draft leave plans can be submitted'
                    });
                    return;
                }
                // Validate that the plan has at least one planned leave
                if (!leavePlan.plannedLeaves || leavePlan.plannedLeaves.length === 0) {
                    res.status(400).json({
                        success: false,
                        message: 'Cannot submit leave plan without planned leaves'
                    });
                    return;
                }
                const updatedPlan = await this.leavePlanRepository.update(id, {
                    status: 'SUBMITTED',
                    submittedAt: new Date()
                });
                logger.info('Leave plan submitted successfully', {
                    planId: id,
                    userId: currentUser.id
                });
                res.json({
                    success: true,
                    message: 'Leave plan submitted for approval',
                    data: {
                        id: updatedPlan.id,
                        status: updatedPlan.status,
                        submittedAt: updatedPlan.submittedAt
                    }
                });
            }
            catch (error) {
                logger.error('Error submitting leave plan', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Manager approval/rejection
         * POST /api/leave-plans/:id/manager-approve
         * POST /api/leave-plans/:id/manager-reject
         */
        this.managerApproval = async (req, res) => {
            try {
                const { id } = req.params;
                const { reason } = req.body;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Check if user is manager or HR admin
                if (!currentUser.roles.includes('manager') && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to approve leave plans'
                    });
                    return;
                }
                if (leavePlan.status !== 'SUBMITTED') {
                    res.status(400).json({
                        success: false,
                        message: 'Only submitted leave plans can be approved by managers'
                    });
                    return;
                }
                const isApproval = req.path.includes('approve');
                const updates = {
                    status: isApproval ? 'MANAGER_APPROVED' : 'REJECTED',
                    managerApprovedAt: new Date(),
                    managerApprovedBy: currentUser.id
                };
                if (!isApproval && reason) {
                    updates.rejectionReason = reason;
                }
                const updatedPlan = await this.leavePlanRepository.update(id, updates);
                logger.info(`Leave plan ${isApproval ? 'approved' : 'rejected'} by manager`, {
                    planId: id,
                    managerId: currentUser.id,
                    reason
                });
                res.json({
                    success: true,
                    message: `Leave plan ${isApproval ? 'approved' : 'rejected'} by manager`,
                    data: {
                        id: updatedPlan.id,
                        status: updatedPlan.status,
                        managerApprovedAt: updatedPlan.managerApprovedAt,
                        managerApprovedBy: updatedPlan.managerApprovedBy,
                        rejectionReason: updatedPlan.rejectionReason
                    }
                });
            }
            catch (error) {
                logger.error('Error processing manager approval', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * HR approval/rejection
         * POST /api/leave-plans/:id/hr-approve
         * POST /api/leave-plans/:id/hr-reject
         */
        this.hrApproval = async (req, res) => {
            try {
                const { id } = req.params;
                const { reason } = req.body;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Only HR admins can give final approval
                if (!currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to provide HR approval'
                    });
                    return;
                }
                if (leavePlan.status !== 'MANAGER_APPROVED') {
                    res.status(400).json({
                        success: false,
                        message: 'Only manager-approved leave plans can be approved by HR'
                    });
                    return;
                }
                const isApproval = req.path.includes('approve');
                const updates = {
                    status: isApproval ? 'HR_APPROVED' : 'REJECTED',
                    hrApprovedAt: new Date(),
                    hrApprovedBy: currentUser.id
                };
                if (!isApproval && reason) {
                    updates.rejectionReason = reason;
                }
                const updatedPlan = await this.leavePlanRepository.update(id, updates);
                logger.info(`Leave plan ${isApproval ? 'approved' : 'rejected'} by HR`, {
                    planId: id,
                    hrId: currentUser.id,
                    reason
                });
                res.json({
                    success: true,
                    message: `Leave plan ${isApproval ? 'approved' : 'rejected'} by HR`,
                    data: {
                        id: updatedPlan.id,
                        status: updatedPlan.status,
                        hrApprovedAt: updatedPlan.hrApprovedAt,
                        hrApprovedBy: updatedPlan.hrApprovedBy,
                        rejectionReason: updatedPlan.rejectionReason
                    }
                });
            }
            catch (error) {
                logger.error('Error processing HR approval', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Delete leave plan
         * DELETE /api/leave-plans/:id
         */
        this.deleteLeavePlan = async (req, res) => {
            try {
                const { id } = req.params;
                const leavePlan = await this.leavePlanRepository.findById(id);
                if (!leavePlan) {
                    res.status(404).json({
                        success: false,
                        message: 'Leave plan not found'
                    });
                    return;
                }
                const currentUser = req.user;
                // Permission check - only draft plans can be deleted by employees
                const canDelete = currentUser.roles.includes('hr_admin') ||
                    (leavePlan.employeeId === currentUser.employeeId && leavePlan.status === 'DRAFT');
                if (!canDelete) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to delete this leave plan'
                    });
                    return;
                }
                await this.leavePlanRepository.delete(id);
                logger.info('Leave plan deleted successfully', {
                    planId: id,
                    userId: currentUser.id
                });
                res.json({
                    success: true,
                    message: 'Leave plan deleted successfully'
                });
            }
            catch (error) {
                logger.error('Error deleting leave plan', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    planId: req.params.id,
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Get pending approvals for manager
         * GET /api/leave-plans/pending/manager
         */
        this.getPendingManagerApprovals = async (req, res) => {
            try {
                const currentUser = req.user;
                if (!currentUser.roles.includes('manager') && !currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to view pending approvals'
                    });
                    return;
                }
                const pendingPlans = await this.leavePlanRepository.getPendingManagerApprovals(currentUser.employeeId);
                res.json({
                    success: true,
                    data: pendingPlans.map(plan => ({
                        id: plan.id,
                        employeeId: plan.employeeId,
                        year: plan.year,
                        totalEntitlement: plan.totalEntitlement,
                        carriedOver: plan.carriedOver,
                        plannedLeaves: plan.plannedLeaves,
                        status: plan.status,
                        submittedAt: plan.submittedAt,
                        createdAt: plan.createdAt
                    }))
                });
            }
            catch (error) {
                logger.error('Error getting pending manager approvals', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Get pending HR approvals
         * GET /api/leave-plans/pending/hr
         */
        this.getPendingHRApprovals = async (req, res) => {
            try {
                const currentUser = req.user;
                if (!currentUser.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to view pending HR approvals'
                    });
                    return;
                }
                const pendingPlans = await this.leavePlanRepository.getPendingHRApprovals();
                res.json({
                    success: true,
                    data: pendingPlans.map(plan => ({
                        id: plan.id,
                        employeeId: plan.employeeId,
                        year: plan.year,
                        totalEntitlement: plan.totalEntitlement,
                        carriedOver: plan.carriedOver,
                        plannedLeaves: plan.plannedLeaves,
                        status: plan.status,
                        submittedAt: plan.submittedAt,
                        managerApprovedAt: plan.managerApprovedAt,
                        managerApprovedBy: plan.managerApprovedBy,
                        createdAt: plan.createdAt
                    }))
                });
            }
            catch (error) {
                logger.error('Error getting pending HR approvals', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        /**
         * Get leave plan statistics
         * GET /api/leave-plans/stats
         */
        this.getStatistics = async (req, res) => {
            try {
                const { year } = req.query;
                // Only HR admins can view statistics
                if (!req.user?.roles.includes('hr_admin')) {
                    res.status(403).json({
                        success: false,
                        message: 'Unauthorized to view leave plan statistics'
                    });
                    return;
                }
                const stats = await this.leavePlanRepository.getStatistics(year ? parseInt(year) : undefined);
                res.json({
                    success: true,
                    data: stats
                });
            }
            catch (error) {
                logger.error('Error getting leave plan statistics', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userId: req.user?.id
                });
                res.status(500).json({
                    success: false,
                    message: 'Internal server error'
                });
            }
        };
        this.leavePlanRepository = new AnnualLeavePlanRepository();
    }
}
