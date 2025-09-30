import Joi from 'joi';
import { requiredStringSchema, optionalStringSchema, emailSchema, phoneSchema, dateSchema, optionalDateSchema, addressSchema, emergencyContactSchema, employmentTypeSchema, uuidSchema } from '../utils/validation';
// Validation schemas for different endpoints
const validationSchemas = {
    createEmployee: {
        body: Joi.object({
            employeeId: requiredStringSchema.max(20).pattern(/^[A-Z0-9-]+$/),
            personalInfo: Joi.object({
                firstName: requiredStringSchema.max(50),
                lastName: requiredStringSchema.max(50),
                email: emailSchema,
                phone: phoneSchema.optional(),
                dateOfBirth: optionalDateSchema,
                socialSecurityNumber: Joi.string().optional().pattern(/^\d{3}-\d{2}-\d{4}$/),
                address: addressSchema.optional(),
                emergencyContact: emergencyContactSchema.optional()
            }).required(),
            jobInfo: Joi.object({
                jobTitle: requiredStringSchema.max(100),
                department: requiredStringSchema.max(100),
                managerId: uuidSchema.optional(),
                startDate: dateSchema,
                employmentType: employmentTypeSchema,
                salary: Joi.number().positive().optional(),
                location: requiredStringSchema.max(100)
            }).required()
        })
    },
    updateEmployee: {
        params: Joi.object({
            id: uuidSchema
        }),
        body: Joi.object({
            personalInfo: Joi.object({
                firstName: requiredStringSchema.max(50).optional(),
                lastName: requiredStringSchema.max(50).optional(),
                email: emailSchema.optional(),
                phone: phoneSchema.optional(),
                dateOfBirth: optionalDateSchema,
                socialSecurityNumber: Joi.string().optional().pattern(/^\d{3}-\d{2}-\d{4}$/),
                address: addressSchema.optional(),
                emergencyContact: emergencyContactSchema.optional()
            }).optional(),
            jobInfo: Joi.object({
                jobTitle: requiredStringSchema.max(100).optional(),
                department: requiredStringSchema.max(100).optional(),
                managerId: uuidSchema.optional().allow(null),
                startDate: dateSchema.optional(),
                employmentType: employmentTypeSchema.optional(),
                salary: Joi.number().positive().optional(),
                location: requiredStringSchema.max(100).optional()
            }).optional()
        }).min(1) // At least one field must be provided
    },
    terminateEmployee: {
        params: Joi.object({
            id: uuidSchema
        }),
        body: Joi.object({
            reason: Joi.string().valid('RESIGNATION', 'TERMINATION_FOR_CAUSE', 'LAYOFF', 'END_OF_CONTRACT', 'RETIREMENT').required(),
            effectiveDate: dateSchema.default(() => new Date()),
            notes: optionalStringSchema
        })
    },
    employeeId: {
        params: Joi.object({
            id: uuidSchema
        })
    },
    searchEmployees: {
        query: Joi.object({
            search: optionalStringSchema,
            department: optionalStringSchema,
            managerId: uuidSchema.optional(),
            status: Joi.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').optional(),
            employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').optional(),
            startDateFrom: Joi.date().optional(),
            startDateTo: Joi.date().optional(),
            page: Joi.number().integer().min(1).default(1),
            limit: Joi.number().integer().min(1).max(100).default(20),
            sortBy: Joi.string().valid('firstName', 'lastName', 'employeeId', 'department', 'startDate').default('lastName'),
            sortOrder: Joi.string().valid('asc', 'desc').default('asc')
        })
    },
    // Self-service validation schemas
    updateSelfProfile: {
        body: Joi.object({
            personalInfo: Joi.object({
                phone: phoneSchema.optional(),
                address: addressSchema.optional(),
                emergencyContact: emergencyContactSchema.optional()
            }).optional()
        }).min(1) // At least one field must be provided
    },
    submitChangeRequest: {
        body: Joi.object({
            requestType: Joi.string().valid('PERSONAL_INFO', 'JOB_INFO').required(),
            requestedChanges: Joi.object({
                // Personal info changes
                firstName: optionalStringSchema.max(50),
                lastName: optionalStringSchema.max(50),
                email: emailSchema,
                dateOfBirth: Joi.date().optional(),
                // Job info changes (employee can request but needs approval)
                jobTitle: optionalStringSchema.max(100),
                department: optionalStringSchema.max(100),
                location: optionalStringSchema.max(100)
            }).min(1).required(),
            reason: Joi.string().min(10).max(500).required()
        })
    },
    changeRequestId: {
        params: Joi.object({
            requestId: uuidSchema
        })
    },
    managerId: {
        params: Joi.object({
            id: uuidSchema
        })
    }
};
export const validateRequest = (schemaName) => {
    return (req, res, next) => {
        const schema = validationSchemas[schemaName];
        if (!schema) {
            res.status(500).json({
                error: {
                    code: 'VALIDATION_SCHEMA_NOT_FOUND',
                    message: 'Validation schema not found'
                }
            });
            return;
        }
        const validationPromises = [];
        // Validate params if schema exists
        if (schema.params) {
            validationPromises.push(new Promise((resolve, reject) => {
                const { error, value } = schema.params.validate(req.params);
                if (error) {
                    reject({
                        type: 'params',
                        error: error.details
                    });
                }
                else {
                    req.params = value;
                    resolve(value);
                }
            }));
        }
        // Validate query if schema exists
        if (schema.query) {
            validationPromises.push(new Promise((resolve, reject) => {
                const { error, value } = schema.query.validate(req.query);
                if (error) {
                    reject({
                        type: 'query',
                        error: error.details
                    });
                }
                else {
                    req.query = value;
                    resolve(value);
                }
            }));
        }
        // Validate body if schema exists
        if (schema.body) {
            validationPromises.push(new Promise((resolve, reject) => {
                const { error, value } = schema.body.validate(req.body);
                if (error) {
                    reject({
                        type: 'body',
                        error: error.details
                    });
                }
                else {
                    req.body = value;
                    resolve(value);
                }
            }));
        }
        // Execute all validations
        Promise.all(validationPromises)
            .then(() => {
            next();
        })
            .catch((validationError) => {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Invalid ${validationError.type} data`,
                    details: validationError.error
                }
            });
        });
    };
};
