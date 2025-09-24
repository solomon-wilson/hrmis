import Joi from 'joi';

// Common validation schemas
export const emailSchema = Joi.string().email().required();
export const phoneSchema = Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20);
export const requiredStringSchema = Joi.string().required().trim().min(1);
export const optionalStringSchema = Joi.string().optional().allow('').trim();
export const dateSchema = Joi.date().required();
export const optionalDateSchema = Joi.date().optional();
export const uuidSchema = Joi.string().uuid().required();

// Address validation schema
export const addressSchema = Joi.object({
  street: requiredStringSchema,
  city: requiredStringSchema,
  state: requiredStringSchema,
  zipCode: Joi.string().required().pattern(/^\d{5}(-\d{4})?$/),
  country: requiredStringSchema
});

// Emergency contact validation schema
export const emergencyContactSchema = Joi.object({
  name: requiredStringSchema,
  relationship: requiredStringSchema,
  phone: phoneSchema.required(),
  email: emailSchema.optional()
});

// Employment type validation
export const employmentTypeSchema = Joi.string().valid('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN').required();

// Employee status validation
export const employeeStatusTypeSchema = Joi.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').required();

// Validation error class
export class ValidationError extends Error {
  public details: Joi.ValidationErrorItem[];

  constructor(message: string, details: Joi.ValidationErrorItem[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// Helper function to validate and throw custom error
export function validateAndThrow<T>(schema: Joi.Schema, data: any): T {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    throw new ValidationError('Validation failed', error.details);
  }
  return value;
}