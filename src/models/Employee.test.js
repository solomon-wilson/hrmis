import { Employee } from './Employee';
import { ValidationError } from '../utils/validation';
describe('Employee Model', () => {
    const validPersonalInfo = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '+1-555-123-4567',
        address: {
            street: '123 Main St',
            city: 'Anytown',
            state: 'CA',
            zipCode: '12345',
            country: 'USA'
        }
    };
    const validJobInfo = {
        jobTitle: 'Software Engineer',
        department: 'Engineering',
        startDate: new Date('2023-01-15'),
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA'
    };
    const validStatus = {
        current: 'ACTIVE',
        effectiveDate: new Date('2023-01-15')
    };
    const validEmployeeData = {
        employeeId: 'EMP-001',
        personalInfo: validPersonalInfo,
        jobInfo: validJobInfo,
        status: validStatus,
        createdBy: '123e4567-e89b-12d3-a456-426614174000',
        updatedBy: '123e4567-e89b-12d3-a456-426614174000'
    };
    describe('Constructor and Validation', () => {
        it('should create a valid employee with all required fields', () => {
            const employee = new Employee(validEmployeeData);
            expect(employee.employeeId).toBe('EMP-001');
            expect(employee.personalInfo.firstName).toBe('John');
            expect(employee.personalInfo.lastName).toBe('Doe');
            expect(employee.jobInfo.jobTitle).toBe('Software Engineer');
            expect(employee.status.current).toBe('ACTIVE');
            expect(employee.id).toBeDefined();
            expect(employee.createdAt).toBeInstanceOf(Date);
            expect(employee.updatedAt).toBeInstanceOf(Date);
        });
        it('should generate UUID for id if not provided', () => {
            const employee = new Employee(validEmployeeData);
            expect(employee.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
        it('should use provided id if given', () => {
            const customId = '123e4567-e89b-12d3-a456-426614174001';
            const dataWithId = { ...validEmployeeData, id: customId };
            const employee = new Employee(dataWithId);
            expect(employee.id).toBe(customId);
        });
        it('should throw ValidationError for invalid employee ID format', () => {
            const invalidData = { ...validEmployeeData, employeeId: 'invalid id!' };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for missing required fields', () => {
            const invalidData = { ...validEmployeeData };
            delete invalidData.employeeId;
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
        });
        it('should throw ValidationError for invalid UUID format in createdBy', () => {
            const invalidData = { ...validEmployeeData, createdBy: 'invalid-uuid' };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
        });
    });
    describe('Business Rule Validation', () => {
        it('should throw ValidationError if start date is in the future', () => {
            const futureDate = new Date();
            futureDate.setFullYear(futureDate.getFullYear() + 1);
            const invalidData = {
                ...validEmployeeData,
                jobInfo: { ...validJobInfo, startDate: futureDate }
            };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
            expect(() => new Employee(invalidData)).toThrow('Start date cannot be in the future');
        });
        it('should throw ValidationError if employee is their own manager', () => {
            const employeeId = '123e4567-e89b-12d3-a456-426614174001';
            const invalidData = {
                ...validEmployeeData,
                id: employeeId,
                jobInfo: { ...validJobInfo, managerId: employeeId }
            };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
            expect(() => new Employee(invalidData)).toThrow('Employee cannot be their own manager');
        });
        it('should throw ValidationError for terminated status without reason', () => {
            const invalidStatus = {
                current: 'TERMINATED',
                effectiveDate: new Date()
            };
            const invalidData = {
                ...validEmployeeData,
                status: invalidStatus
            };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
            expect(() => new Employee(invalidData)).toThrow('Termination reason is required');
        });
        it('should throw ValidationError for on leave status without reason', () => {
            const invalidStatus = {
                current: 'ON_LEAVE',
                effectiveDate: new Date()
            };
            const invalidData = {
                ...validEmployeeData,
                status: invalidStatus
            };
            expect(() => new Employee(invalidData)).toThrow(ValidationError);
            expect(() => new Employee(invalidData)).toThrow('Leave reason is required');
        });
        it('should accept terminated status with reason', () => {
            const validTerminatedStatus = {
                current: 'TERMINATED',
                effectiveDate: new Date(),
                reason: 'Voluntary resignation'
            };
            const validData = {
                ...validEmployeeData,
                status: validTerminatedStatus
            };
            expect(() => new Employee(validData)).not.toThrow();
        });
        it('should accept on leave status with reason', () => {
            const validLeaveStatus = {
                current: 'ON_LEAVE',
                effectiveDate: new Date(),
                reason: 'Medical leave'
            };
            const validData = {
                ...validEmployeeData,
                status: validLeaveStatus
            };
            expect(() => new Employee(validData)).not.toThrow();
        });
    });
    describe('Update Methods', () => {
        let employee;
        const updatedBy = '123e4567-e89b-12d3-a456-426614174002';
        beforeEach(() => {
            employee = new Employee(validEmployeeData);
        });
        it('should update employee with new data', () => {
            const updates = { employeeId: 'EMP-002' };
            const updatedEmployee = employee.update(updates, updatedBy);
            expect(updatedEmployee.employeeId).toBe('EMP-002');
            expect(updatedEmployee.updatedBy).toBe(updatedBy);
            expect(updatedEmployee.updatedAt).not.toEqual(employee.updatedAt);
            expect(updatedEmployee.id).toBe(employee.id); // ID should remain the same
        });
        it('should update personal info', () => {
            const updates = { firstName: 'Jane', lastName: 'Smith' };
            const updatedEmployee = employee.updatePersonalInfo(updates, updatedBy);
            expect(updatedEmployee.personalInfo.firstName).toBe('Jane');
            expect(updatedEmployee.personalInfo.lastName).toBe('Smith');
            expect(updatedEmployee.personalInfo.email).toBe(employee.personalInfo.email); // Unchanged
            expect(updatedEmployee.updatedBy).toBe(updatedBy);
        });
        it('should update job info', () => {
            const updates = { jobTitle: 'Senior Software Engineer', department: 'Platform' };
            const updatedEmployee = employee.updateJobInfo(updates, updatedBy);
            expect(updatedEmployee.jobInfo.jobTitle).toBe('Senior Software Engineer');
            expect(updatedEmployee.jobInfo.department).toBe('Platform');
            expect(updatedEmployee.jobInfo.startDate).toEqual(employee.jobInfo.startDate); // Unchanged
            expect(updatedEmployee.updatedBy).toBe(updatedBy);
        });
        it('should update status', () => {
            const newStatus = {
                current: 'ON_LEAVE',
                effectiveDate: new Date(),
                reason: 'Maternity leave'
            };
            const updatedEmployee = employee.updateStatus(newStatus, updatedBy);
            expect(updatedEmployee.status.current).toBe('ON_LEAVE');
            expect(updatedEmployee.status.reason).toBe('Maternity leave');
            expect(updatedEmployee.updatedBy).toBe(updatedBy);
        });
    });
    describe('Helper Methods', () => {
        let employee;
        beforeEach(() => {
            employee = new Employee(validEmployeeData);
        });
        it('should return full name', () => {
            expect(employee.getFullName()).toBe('John Doe');
        });
        it('should check if employee is active', () => {
            expect(employee.isActive()).toBe(true);
        });
        it('should check if employee is terminated', () => {
            expect(employee.isTerminated()).toBe(false);
            const terminatedStatus = {
                current: 'TERMINATED',
                effectiveDate: new Date(),
                reason: 'Resignation'
            };
            const terminatedEmployee = employee.updateStatus(terminatedStatus, employee.updatedBy);
            expect(terminatedEmployee.isTerminated()).toBe(true);
        });
        it('should check if employee is on leave', () => {
            expect(employee.isOnLeave()).toBe(false);
            const leaveStatus = {
                current: 'ON_LEAVE',
                effectiveDate: new Date(),
                reason: 'Sick leave'
            };
            const employeeOnLeave = employee.updateStatus(leaveStatus, employee.updatedBy);
            expect(employeeOnLeave.isOnLeave()).toBe(true);
        });
        it('should calculate years of service', () => {
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 2); // 2 years ago
            const jobInfoWithOlderStart = { ...validJobInfo, startDate };
            const employeeData = { ...validEmployeeData, jobInfo: jobInfoWithOlderStart };
            const olderEmployee = new Employee(employeeData);
            expect(olderEmployee.getYearsOfService()).toBe(2);
        });
        it('should check if employee has manager', () => {
            expect(employee.hasManager()).toBe(false);
            const jobInfoWithManager = { ...validJobInfo, managerId: '123e4567-e89b-12d3-a456-426614174003' };
            const employeeData = { ...validEmployeeData, jobInfo: jobInfoWithManager };
            const employeeWithManager = new Employee(employeeData);
            expect(employeeWithManager.hasManager()).toBe(true);
        });
    });
    describe('Validation Methods', () => {
        it('should validate for creation successfully', () => {
            const employee = new Employee(validEmployeeData);
            expect(() => employee.validateForCreation()).not.toThrow();
        });
        it('should throw ValidationError for creation without email', () => {
            const personalInfoWithoutEmail = { ...validPersonalInfo };
            delete personalInfoWithoutEmail.email;
            const invalidData = { ...validEmployeeData, personalInfo: personalInfoWithoutEmail };
            // This should fail at PersonalInfo validation level, but let's test the employee validation
            expect(() => new Employee(invalidData)).toThrow();
        });
        it('should throw ValidationError for creation with invalid status', () => {
            const invalidStatus = {
                current: 'TERMINATED',
                effectiveDate: new Date(),
                reason: 'Test'
            };
            const employeeData = { ...validEmployeeData, status: invalidStatus };
            const employee = new Employee(employeeData);
            expect(() => employee.validateForCreation()).toThrow(ValidationError);
            expect(() => employee.validateForCreation()).toThrow('New employees must have ACTIVE or INACTIVE status');
        });
        it('should validate for update successfully', () => {
            const employee = new Employee(validEmployeeData);
            expect(() => employee.validateForUpdate()).not.toThrow();
        });
    });
    describe('Static Factory Methods', () => {
        it('should create new employee with createNew', () => {
            const newEmployeeData = {
                employeeId: 'EMP-NEW',
                personalInfo: validPersonalInfo,
                jobInfo: validJobInfo,
                status: validStatus,
                createdBy: '123e4567-e89b-12d3-a456-426614174000',
                updatedBy: '123e4567-e89b-12d3-a456-426614174000'
            };
            const employee = Employee.createNew(newEmployeeData);
            expect(employee.employeeId).toBe('EMP-NEW');
            expect(employee.id).toBeDefined();
            expect(employee.createdAt).toBeInstanceOf(Date);
            expect(employee.updatedAt).toBeInstanceOf(Date);
        });
        it('should create employee from JSON with fromJSON', () => {
            const employee = Employee.fromJSON(validEmployeeData);
            expect(employee.employeeId).toBe('EMP-001');
            expect(employee.personalInfo.firstName).toBe('John');
            expect(employee.jobInfo.jobTitle).toBe('Software Engineer');
        });
    });
    describe('JSON Serialization', () => {
        it('should serialize to JSON correctly', () => {
            const employee = new Employee(validEmployeeData);
            const json = employee.toJSON();
            expect(json.employeeId).toBe('EMP-001');
            expect(json.personalInfo.firstName).toBe('John');
            expect(json.jobInfo.jobTitle).toBe('Software Engineer');
            expect(json.status.current).toBe('ACTIVE');
            expect(json.id).toBeDefined();
            expect(json.createdAt).toBeInstanceOf(Date);
            expect(json.updatedAt).toBeInstanceOf(Date);
        });
        it('should round-trip through JSON correctly', () => {
            const originalEmployee = new Employee(validEmployeeData);
            const json = originalEmployee.toJSON();
            const recreatedEmployee = Employee.fromJSON(json);
            expect(recreatedEmployee.employeeId).toBe(originalEmployee.employeeId);
            expect(recreatedEmployee.personalInfo.firstName).toBe(originalEmployee.personalInfo.firstName);
            expect(recreatedEmployee.jobInfo.jobTitle).toBe(originalEmployee.jobInfo.jobTitle);
            expect(recreatedEmployee.status.current).toBe(originalEmployee.status.current);
        });
    });
});
