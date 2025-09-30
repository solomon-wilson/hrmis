import Joi from 'joi';
import { validateAndThrow, requiredStringSchema, dateSchema, employmentTypeSchema, uuidSchema } from '../utils/validation';
export class JobInfo {
    constructor(data) {
        this.validate(data);
        this.jobTitle = data.jobTitle.trim();
        this.department = data.department.trim();
        this.managerId = data.managerId;
        this.startDate = data.startDate;
        this.employmentType = data.employmentType;
        this.salary = data.salary;
        this.location = data.location.trim();
    }
    validate(data) {
        const schema = Joi.object({
            jobTitle: requiredStringSchema.max(100),
            department: requiredStringSchema.max(50),
            managerId: uuidSchema.optional(),
            startDate: dateSchema,
            employmentType: employmentTypeSchema,
            salary: Joi.number().min(0).optional(),
            location: requiredStringSchema.max(100)
        });
        validateAndThrow(schema, data);
    }
    update(updates) {
        const updatedData = { ...this.toJSON(), ...updates };
        return new JobInfo(updatedData);
    }
    toJSON() {
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
    isFullTime() {
        return this.employmentType === 'FULL_TIME';
    }
    isContractor() {
        return this.employmentType === 'CONTRACT';
    }
    getYearsOfService() {
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - this.startDate.getTime());
        const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
        return Math.floor(diffYears);
    }
}
