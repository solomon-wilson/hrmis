import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { PersonalInfo } from './PersonalInfo';
import { JobInfo } from './JobInfo';
import { EmployeeStatus } from './EmployeeStatus';
import { validateAndThrow, ValidationError, requiredStringSchema, uuidSchema } from '../utils/validation';
export class Employee {
    constructor(data) {
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
    validate(data) {
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
        validateAndThrow(schema, data);
    }
    validateBusinessRules() {
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
    update(updates, updatedBy) {
        const updatedData = {
            ...this.toJSON(),
            ...updates,
            updatedBy,
            updatedAt: new Date()
        };
        return new Employee(updatedData);
    }
    updatePersonalInfo(updates, updatedBy) {
        const updatedPersonalInfo = this.personalInfo.update(updates);
        return this.update({ personalInfo: updatedPersonalInfo.toJSON() }, updatedBy);
    }
    updateJobInfo(updates, updatedBy) {
        const updatedJobInfo = this.jobInfo.update(updates);
        return this.update({ jobInfo: updatedJobInfo.toJSON() }, updatedBy);
    }
    updateStatus(newStatus, updatedBy) {
        return this.update({ status: newStatus }, updatedBy);
    }
    toJSON() {
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
    getFullName() {
        return this.personalInfo.getFullName();
    }
    isActive() {
        return this.status.current === 'ACTIVE';
    }
    isTerminated() {
        return this.status.current === 'TERMINATED';
    }
    isOnLeave() {
        return this.status.current === 'ON_LEAVE';
    }
    getYearsOfService() {
        return this.jobInfo.getYearsOfService();
    }
    hasManager() {
        return !!this.jobInfo.managerId;
    }
    validateForCreation() {
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
    validateForUpdate() {
        // Validation rules specific to employee updates
        if (this.isTerminated() && this.status.current !== 'TERMINATED') {
            throw new ValidationError('Cannot change status of terminated employee', []);
        }
    }
    // Static factory methods
    static createNew(data) {
        const employee = new Employee({
            ...data,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        employee.validateForCreation();
        return employee;
    }
    static fromJSON(data) {
        return new Employee(data);
    }
}
