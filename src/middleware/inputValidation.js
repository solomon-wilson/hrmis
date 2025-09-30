import Joi from 'joi';
import { ValidationError } from '../utils/errors';
// Validation middleware factory
export function validateInput(schema, source = 'body') {
    return (req, _res, next) => {
        const data = req[source];
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
            allowUnknown: false
        });
        if (error) {
            const validationError = new ValidationError('Input validation failed', error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            })));
            return next(validationError);
        }
        // Replace the original data with validated and sanitized data
        req[source] = value;
        next();
    };
}
// Common validation schemas
export const commonSchemas = {
    // UUID validation
    uuid: Joi.string().uuid().required(),
    // Pagination
    pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sortBy: Joi.string().optional(),
        sortOrder: Joi.string().valid('asc', 'desc').default('asc')
    }),
    // Search filters
    searchFilters: Joi.object({
        search: Joi.string().trim().max(255).optional(),
        department: Joi.string().trim().max(100).optional(),
        status: Joi.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').optional(),
        employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').optional(),
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional()
    }),
    // Employee creation
    createEmployee: Joi.object({
        personalInfo: Joi.object({
            firstName: Joi.string().trim().min(1).max(100).required(),
            lastName: Joi.string().trim().min(1).max(100).required(),
            email: Joi.string().email().required(),
            phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional(),
            dateOfBirth: Joi.date().max('now').optional(),
            socialSecurityNumber: Joi.string().pattern(/^\d{3}-\d{2}-\d{4}$/).optional(),
            address: Joi.object({
                street: Joi.string().trim().min(1).max(255).required(),
                city: Joi.string().trim().min(1).max(100).required(),
                state: Joi.string().trim().min(1).max(100).required(),
                zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
                country: Joi.string().trim().min(1).max(100).required()
            }).optional(),
            emergencyContact: Joi.object({
                name: Joi.string().trim().min(1).max(100).required(),
                relationship: Joi.string().trim().min(1).max(50).required(),
                phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).required(),
                email: Joi.string().email().optional()
            }).optional()
        }).required(),
        jobInfo: Joi.object({
            jobTitle: Joi.string().trim().min(1).max(100).required(),
            department: Joi.string().trim().min(1).max(100).required(),
            managerId: Joi.string().uuid().optional(),
            startDate: Joi.date().required(),
            employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').required(),
            salary: Joi.number().positive().optional(),
            location: Joi.string().trim().min(1).max(100).required()
        }).required()
    }),
    // Employee update
    updateEmployee: Joi.object({
        personalInfo: Joi.object({
            firstName: Joi.string().trim().min(1).max(100).optional(),
            lastName: Joi.string().trim().min(1).max(100).optional(),
            email: Joi.string().email().optional(),
            phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional(),
            dateOfBirth: Joi.date().max('now').optional(),
            address: Joi.object({
                street: Joi.string().trim().min(1).max(255).optional(),
                city: Joi.string().trim().min(1).max(100).optional(),
                state: Joi.string().trim().min(1).max(100).optional(),
                zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).optional(),
                country: Joi.string().trim().min(1).max(100).optional()
            }).optional(),
            emergencyContact: Joi.object({
                name: Joi.string().trim().min(1).max(100).optional(),
                relationship: Joi.string().trim().min(1).max(50).optional(),
                phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional(),
                email: Joi.string().email().optional()
            }).optional()
        }).optional(),
        jobInfo: Joi.object({
            jobTitle: Joi.string().trim().min(1).max(100).optional(),
            department: Joi.string().trim().min(1).max(100).optional(),
            managerId: Joi.string().uuid().allow(null).optional(),
            employmentType: Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').optional(),
            salary: Joi.number().positive().optional(),
            location: Joi.string().trim().min(1).max(100).optional()
        }).optional()
    }).min(1), // At least one field must be provided
    // Status update
    updateStatus: Joi.object({
        status: Joi.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').required(),
        effectiveDate: Joi.date().required(),
        reason: Joi.string().trim().min(1).max(500).optional(),
        notes: Joi.string().trim().max(1000).optional()
    }),
    // Self-service update (limited fields)
    selfServiceUpdate: Joi.object({
        personalInfo: Joi.object({
            phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional(),
            address: Joi.object({
                street: Joi.string().trim().min(1).max(255).optional(),
                city: Joi.string().trim().min(1).max(100).optional(),
                state: Joi.string().trim().min(1).max(100).optional(),
                zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).optional(),
                country: Joi.string().trim().min(1).max(100).optional()
            }).optional(),
            emergencyContact: Joi.object({
                name: Joi.string().trim().min(1).max(100).optional(),
                relationship: Joi.string().trim().min(1).max(50).optional(),
                phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20).optional(),
                email: Joi.string().email().optional()
            }).optional()
        }).optional()
    }).min(1),
    // Change request
    changeRequest: Joi.object({
        requestType: Joi.string().valid('PERSONAL_INFO', 'JOB_INFO').required(),
        requestedChanges: Joi.object().required(),
        reason: Joi.string().trim().min(10).max(500).required(),
        priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH').default('MEDIUM')
    })
};
// Sanitization middleware
export const sanitizeInput = (req, _res, next) => {
    // Recursively sanitize strings in request body
    const sanitizeObject = (obj) => {
        if (typeof obj === 'string') {
            return obj.trim();
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
        }
        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = sanitizeObject(value);
            }
            return sanitized;
        }
        return obj;
    };
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query);
    }
    next();
};
// Content type validation middleware
export const validateContentType = (allowedTypes = ['application/json']) => {
    return (req, _res, next) => {
        // Skip validation for GET requests and requests without body
        if (req.method === 'GET' || req.method === 'HEAD' || !req.headers['content-type']) {
            return next();
        }
        const contentType = req.headers['content-type']?.split(';')[0];
        if (!contentType || !allowedTypes.includes(contentType)) {
            const error = new ValidationError(`Invalid content type. Expected one of: ${allowedTypes.join(', ')}`, {
                received: contentType,
                allowed: allowedTypes
            });
            return next(error);
        }
        next();
    };
};
