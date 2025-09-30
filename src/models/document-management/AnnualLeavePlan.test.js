import { AnnualLeavePlan } from './AnnualLeavePlan';
import { ValidationError } from '../../utils/validation';
describe('AnnualLeavePlan', () => {
    const currentYear = new Date().getFullYear();
    const validPlannedLeave = {
        startDate: new Date(currentYear, 5, 3), // June 3rd (Monday)
        endDate: new Date(currentYear, 5, 6), // June 6th (Thursday)
        days: 4,
        description: 'Summer vacation',
        type: 'ANNUAL'
    };
    const validLeavePlanData = {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        year: currentYear,
        totalEntitlement: 25,
        carriedOver: 5,
        plannedLeaves: [validPlannedLeave],
        status: 'DRAFT'
    };
    describe('constructor', () => {
        it('should create a valid leave plan', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            expect(plan.id).toBeDefined();
            expect(plan.employeeId).toBe(validLeavePlanData.employeeId);
            expect(plan.year).toBe(validLeavePlanData.year);
            expect(plan.totalEntitlement).toBe(validLeavePlanData.totalEntitlement);
            expect(plan.status).toBe('DRAFT');
        });
        it('should auto-generate ID if not provided', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            expect(plan.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        });
    });
    describe('validation', () => {
        it('should reject invalid employee ID', () => {
            const invalidData = { ...validLeavePlanData, employeeId: 'invalid-id' };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject past years', () => {
            const invalidData = { ...validLeavePlanData, year: currentYear - 1 };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject negative entitlement', () => {
            const invalidData = { ...validLeavePlanData, totalEntitlement: -1 };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject excessive carried over days', () => {
            const invalidData = { ...validLeavePlanData, carriedOver: 60 };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
    });
    describe('business rules validation', () => {
        it('should reject plans where total planned exceeds entitlement', () => {
            const excessiveLeave = {
                startDate: new Date(currentYear, 6, 1),
                endDate: new Date(currentYear, 6, 30),
                days: 30,
                type: 'ANNUAL'
            };
            const invalidData = {
                ...validLeavePlanData,
                totalEntitlement: 10,
                carriedOver: 0,
                plannedLeaves: [excessiveLeave]
            };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject overlapping leave periods', () => {
            const leave1 = {
                startDate: new Date(currentYear, 5, 3),
                endDate: new Date(currentYear, 5, 10),
                days: 6,
                type: 'ANNUAL'
            };
            const leave2 = {
                startDate: new Date(currentYear, 5, 8), // Overlaps with leave1
                endDate: new Date(currentYear, 5, 15),
                days: 6,
                type: 'ANNUAL'
            };
            const invalidData = {
                ...validLeavePlanData,
                plannedLeaves: [leave1, leave2]
            };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject leave with end date before start date', () => {
            const invalidLeave = {
                startDate: new Date(currentYear, 5, 10),
                endDate: new Date(currentYear, 5, 5), // Before start date
                days: 5,
                type: 'ANNUAL'
            };
            const invalidData = {
                ...validLeavePlanData,
                plannedLeaves: [invalidLeave]
            };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
        it('should reject leave outside plan year', () => {
            const invalidLeave = {
                startDate: new Date(currentYear + 1, 0, 1), // Next year
                endDate: new Date(currentYear + 1, 0, 5),
                days: 5,
                type: 'ANNUAL'
            };
            const invalidData = {
                ...validLeavePlanData,
                plannedLeaves: [invalidLeave]
            };
            expect(() => new AnnualLeavePlan(invalidData)).toThrow(ValidationError);
        });
    });
    describe('status workflow', () => {
        it('should submit a draft plan', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            const submittedPlan = plan.submit();
            expect(submittedPlan.status).toBe('SUBMITTED');
            expect(submittedPlan.submittedAt).toBeInstanceOf(Date);
        });
        it('should not submit non-draft plans', () => {
            const submittedData = {
                ...validLeavePlanData,
                status: 'SUBMITTED',
                submittedAt: new Date()
            };
            const plan = new AnnualLeavePlan(submittedData);
            expect(() => plan.submit()).toThrow('Only draft plans can be submitted');
        });
        it('should not submit plan with no leaves', () => {
            const emptyData = { ...validLeavePlanData, plannedLeaves: [] };
            const plan = new AnnualLeavePlan(emptyData);
            expect(() => plan.submit()).toThrow('Cannot submit plan with no planned leaves');
        });
        it('should approve by manager', () => {
            const submittedData = {
                ...validLeavePlanData,
                status: 'SUBMITTED',
                submittedAt: new Date()
            };
            const plan = new AnnualLeavePlan(submittedData);
            const managerId = '123e4567-e89b-12d3-a456-426614174001';
            const approvedPlan = plan.approveByManager(managerId);
            expect(approvedPlan.status).toBe('MANAGER_APPROVED');
            expect(approvedPlan.managerApprovedBy).toBe(managerId);
            expect(approvedPlan.managerApprovedAt).toBeInstanceOf(Date);
        });
        it('should approve by HR', () => {
            const managerApprovedData = {
                ...validLeavePlanData,
                status: 'MANAGER_APPROVED',
                submittedAt: new Date(),
                managerApprovedAt: new Date(),
                managerApprovedBy: '123e4567-e89b-12d3-a456-426614174001'
            };
            const plan = new AnnualLeavePlan(managerApprovedData);
            const hrId = '123e4567-e89b-12d3-a456-426614174002';
            const hrApprovedPlan = plan.approveByHR(hrId);
            expect(hrApprovedPlan.status).toBe('HR_APPROVED');
            expect(hrApprovedPlan.hrApprovedBy).toBe(hrId);
            expect(hrApprovedPlan.hrApprovedAt).toBeInstanceOf(Date);
        });
        it('should reject plan with reason', () => {
            const submittedData = {
                ...validLeavePlanData,
                status: 'SUBMITTED',
                submittedAt: new Date()
            };
            const plan = new AnnualLeavePlan(submittedData);
            const reason = 'Insufficient leave balance verification';
            const rejectedPlan = plan.reject(reason);
            expect(rejectedPlan.status).toBe('REJECTED');
            expect(rejectedPlan.rejectionReason).toBe(reason);
        });
    });
    describe('leave management', () => {
        it('should add planned leave', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            const newLeave = {
                startDate: new Date(currentYear, 7, 1),
                endDate: new Date(currentYear, 7, 1),
                days: 1,
                type: 'PERSONAL'
            };
            const updatedPlan = plan.addPlannedLeave(newLeave);
            expect(updatedPlan.plannedLeaves).toHaveLength(2);
            expect(updatedPlan.getTotalPlannedDays()).toBe(5);
        });
        it('should update planned leave', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            const updates = { days: 4, description: 'Extended vacation' };
            const updatedPlan = plan.updatePlannedLeave(0, updates);
            expect(updatedPlan.plannedLeaves[0].days).toBe(4);
            expect(updatedPlan.plannedLeaves[0].description).toBe('Extended vacation');
        });
        it('should remove planned leave', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            const updatedPlan = plan.removePlannedLeave(0);
            expect(updatedPlan.plannedLeaves).toHaveLength(0);
        });
        it('should not modify non-draft/rejected plans', () => {
            const approvedData = {
                ...validLeavePlanData,
                status: 'HR_APPROVED',
                submittedAt: new Date(),
                managerApprovedAt: new Date(),
                managerApprovedBy: '123e4567-e89b-12d3-a456-426614174001',
                hrApprovedAt: new Date(),
                hrApprovedBy: '123e4567-e89b-12d3-a456-426614174002'
            };
            const plan = new AnnualLeavePlan(approvedData);
            const newLeave = {
                startDate: new Date(currentYear, 7, 1),
                endDate: new Date(currentYear, 7, 3),
                days: 3,
                type: 'PERSONAL'
            };
            expect(() => plan.addPlannedLeave(newLeave)).toThrow('Cannot modify plan in current status');
        });
    });
    describe('utility methods', () => {
        it('should calculate total planned days', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            expect(plan.getTotalPlannedDays()).toBe(4);
        });
        it('should calculate remaining days', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            expect(plan.getRemainingDays()).toBe(26); // 25 + 5 - 4
        });
        it('should filter leaves by type', () => {
            const personalLeave = {
                startDate: new Date(currentYear, 7, 1),
                endDate: new Date(currentYear, 7, 1),
                days: 1,
                type: 'PERSONAL'
            };
            const planData = {
                ...validLeavePlanData,
                plannedLeaves: [validPlannedLeave, personalLeave]
            };
            const plan = new AnnualLeavePlan(planData);
            const annualLeaves = plan.getPlannedLeavesByType('ANNUAL');
            const personalLeaves = plan.getPlannedLeavesByType('PERSONAL');
            expect(annualLeaves).toHaveLength(1);
            expect(personalLeaves).toHaveLength(1);
            expect(plan.getTotalDaysByType('ANNUAL')).toBe(4);
            expect(plan.getTotalDaysByType('PERSONAL')).toBe(1);
        });
        it('should detect conflicts with date ranges', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            // Should conflict with existing leave (June 3-7)
            const conflictStart = new Date(currentYear, 5, 5);
            const conflictEnd = new Date(currentYear, 5, 9);
            expect(plan.hasConflictsWith(conflictStart, conflictEnd)).toBe(true);
            // Should not conflict
            const noConflictStart = new Date(currentYear, 6, 1);
            const noConflictEnd = new Date(currentYear, 6, 5);
            expect(plan.hasConflictsWith(noConflictStart, noConflictEnd)).toBe(false);
        });
        it('should check modification capability', () => {
            const draftPlan = new AnnualLeavePlan(validLeavePlanData);
            expect(draftPlan.canBeModified()).toBe(true);
            const rejectedData = { ...validLeavePlanData, status: 'REJECTED', rejectionReason: 'Test' };
            const rejectedPlan = new AnnualLeavePlan(rejectedData);
            expect(rejectedPlan.canBeModified()).toBe(true);
            const approvedData = {
                ...validLeavePlanData,
                status: 'HR_APPROVED',
                submittedAt: new Date(),
                managerApprovedAt: new Date(),
                managerApprovedBy: '123e4567-e89b-12d3-a456-426614174001',
                hrApprovedAt: new Date(),
                hrApprovedBy: '123e4567-e89b-12d3-a456-426614174002'
            };
            const approvedPlan = new AnnualLeavePlan(approvedData);
            expect(approvedPlan.canBeModified()).toBe(false);
        });
        it('should check approval status', () => {
            const draftPlan = new AnnualLeavePlan(validLeavePlanData);
            expect(draftPlan.isApproved()).toBe(false);
            expect(draftPlan.isPending()).toBe(false);
            const submittedData = { ...validLeavePlanData, status: 'SUBMITTED', submittedAt: new Date() };
            const submittedPlan = new AnnualLeavePlan(submittedData);
            expect(submittedPlan.isPending()).toBe(true);
            const approvedData = {
                ...validLeavePlanData,
                status: 'HR_APPROVED',
                submittedAt: new Date(),
                managerApprovedAt: new Date(),
                managerApprovedBy: '123e4567-e89b-12d3-a456-426614174001',
                hrApprovedAt: new Date(),
                hrApprovedBy: '123e4567-e89b-12d3-a456-426614174002'
            };
            const approvedPlan = new AnnualLeavePlan(approvedData);
            expect(approvedPlan.isApproved()).toBe(true);
        });
    });
    describe('static methods', () => {
        it('should create new plan with default status', () => {
            const { status, id, createdAt, updatedAt, ...createData } = validLeavePlanData;
            const plan = AnnualLeavePlan.createNew(createData);
            expect(plan.status).toBe('DRAFT');
            expect(plan.id).toBeDefined();
            expect(plan.createdAt).toBeInstanceOf(Date);
        });
        it('should create plan for employee', () => {
            const employeeId = '123e4567-e89b-12d3-a456-426614174000';
            const plan = AnnualLeavePlan.createForEmployee(employeeId, currentYear, 25, 5);
            expect(plan.employeeId).toBe(employeeId);
            expect(plan.year).toBe(currentYear);
            expect(plan.totalEntitlement).toBe(25);
            expect(plan.carriedOver).toBe(5);
            expect(plan.plannedLeaves).toHaveLength(0);
        });
    });
    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const plan = new AnnualLeavePlan(validLeavePlanData);
            const json = plan.toJSON();
            expect(json.id).toBe(plan.id);
            expect(json.employeeId).toBe(plan.employeeId);
            expect(json.year).toBe(plan.year);
            expect(json.status).toBe(plan.status);
            expect(json.plannedLeaves).toHaveLength(1);
        });
    });
});
