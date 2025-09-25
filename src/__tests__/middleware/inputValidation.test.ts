import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { 
  validateInput, 
  commonSchemas, 
  sanitizeInput, 
  validateContentType 
} from '../../middleware/inputValidation';
import { ValidationError } from '../../utils/errors';

describe('Input Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {}
    };
    mockResponse = {};
    mockNext = jest.fn();
  });

  describe('validateInput', () => {
    const testSchema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().min(0).max(120).required(),
      email: Joi.string().email().optional()
    });

    it('should pass validation with valid data', () => {
      mockRequest.body = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };

      const middleware = validateInput(testSchema, 'body');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      });
    });

    it('should fail validation with invalid data', () => {
      mockRequest.body = {
        name: '',
        age: -5,
        email: 'invalid-email'
      };

      const middleware = validateInput(testSchema, 'body');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
      const error = (mockNext as jest.Mock).mock.calls[0][0];
      expect(error.message).toBe('Input validation failed');
      expect(error.details).toHaveLength(3);
    });

    it('should strip unknown fields', () => {
      mockRequest.body = {
        name: 'John Doe',
        age: 30,
        unknownField: 'should be removed'
      };

      const middleware = validateInput(testSchema, 'body');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.body).toEqual({
        name: 'John Doe',
        age: 30
      });
    });

    it('should validate query parameters', () => {
      mockRequest.query = {
        name: 'John',
        age: '30'
      };

      const middleware = validateInput(testSchema, 'query');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.query).toEqual({
        name: 'John',
        age: 30 // Should be converted to number
      });
    });

    it('should validate URL parameters', () => {
      mockRequest.params = {
        name: 'John',
        age: '25'
      };

      const middleware = validateInput(testSchema, 'params');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRequest.params).toEqual({
        name: 'John',
        age: 25
      });
    });
  });

  describe('commonSchemas', () => {
    describe('uuid schema', () => {
      it('should validate valid UUID', () => {
        const { error } = commonSchemas.uuid.validate('123e4567-e89b-12d3-a456-426614174000');
        expect(error).toBeUndefined();
      });

      it('should reject invalid UUID', () => {
        const { error } = commonSchemas.uuid.validate('invalid-uuid');
        expect(error).toBeDefined();
      });
    });

    describe('pagination schema', () => {
      it('should validate pagination with defaults', () => {
        const { error, value } = commonSchemas.pagination.validate({});
        expect(error).toBeUndefined();
        expect(value).toEqual({
          page: 1,
          limit: 20,
          sortOrder: 'asc'
        });
      });

      it('should validate custom pagination values', () => {
        const { error, value } = commonSchemas.pagination.validate({
          page: 2,
          limit: 50,
          sortBy: 'name',
          sortOrder: 'desc'
        });
        expect(error).toBeUndefined();
        expect(value).toEqual({
          page: 2,
          limit: 50,
          sortBy: 'name',
          sortOrder: 'desc'
        });
      });

      it('should reject invalid pagination values', () => {
        const { error } = commonSchemas.pagination.validate({
          page: 0,
          limit: 101,
          sortOrder: 'invalid'
        });
        expect(error).toBeDefined();
      });
    });

    describe('createEmployee schema', () => {
      const validEmployeeData = {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1-555-0123',
          dateOfBirth: '1990-01-01',
          socialSecurityNumber: '123-45-6789',
          address: {
            street: '123 Main St',
            city: 'Anytown',
            state: 'CA',
            zipCode: '12345',
            country: 'USA'
          },
          emergencyContact: {
            name: 'Jane Doe',
            relationship: 'Spouse',
            phone: '+1-555-0124',
            email: 'jane.doe@example.com'
          }
        },
        jobInfo: {
          jobTitle: 'Software Engineer',
          department: 'Engineering',
          managerId: '123e4567-e89b-12d3-a456-426614174000',
          startDate: '2023-01-01',
          employmentType: 'FULL_TIME',
          salary: 75000,
          location: 'San Francisco'
        }
      };

      it('should validate complete employee data', () => {
        const { error } = commonSchemas.createEmployee.validate(validEmployeeData);
        expect(error).toBeUndefined();
      });

      it('should validate minimal employee data', () => {
        const minimalData = {
          personalInfo: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com'
          },
          jobInfo: {
            jobTitle: 'Software Engineer',
            department: 'Engineering',
            startDate: '2023-01-01',
            employmentType: 'FULL_TIME',
            location: 'San Francisco'
          }
        };

        const { error } = commonSchemas.createEmployee.validate(minimalData);
        expect(error).toBeUndefined();
      });

      it('should reject invalid email format', () => {
        const invalidData = {
          ...validEmployeeData,
          personalInfo: {
            ...validEmployeeData.personalInfo,
            email: 'invalid-email'
          }
        };

        const { error } = commonSchemas.createEmployee.validate(invalidData);
        expect(error).toBeDefined();
      });

      it('should reject invalid employment type', () => {
        const invalidData = {
          ...validEmployeeData,
          jobInfo: {
            ...validEmployeeData.jobInfo,
            employmentType: 'INVALID_TYPE'
          }
        };

        const { error } = commonSchemas.createEmployee.validate(invalidData);
        expect(error).toBeDefined();
      });
    });

    describe('updateEmployee schema', () => {
      it('should validate partial employee updates', () => {
        const updateData = {
          personalInfo: {
            phone: '+1-555-9999'
          },
          jobInfo: {
            jobTitle: 'Senior Software Engineer'
          }
        };

        const { error } = commonSchemas.updateEmployee.validate(updateData);
        expect(error).toBeUndefined();
      });

      it('should require at least one field', () => {
        const { error } = commonSchemas.updateEmployee.validate({});
        expect(error).toBeDefined();
      });
    });

    describe('selfServiceUpdate schema', () => {
      it('should validate allowed self-service fields', () => {
        const updateData = {
          personalInfo: {
            phone: '+1-555-9999',
            address: {
              street: '456 New St',
              city: 'New City'
            }
          }
        };

        const { error } = commonSchemas.selfServiceUpdate.validate(updateData);
        expect(error).toBeUndefined();
      });

      it('should reject restricted fields', () => {
        const updateData = {
          personalInfo: {
            firstName: 'NewName', // Not allowed in self-service
            phone: '+1-555-9999'
          }
        };

        const { error } = commonSchemas.selfServiceUpdate.validate(updateData);
        expect(error).toBeDefined();
      });
    });
  });

  describe('sanitizeInput', () => {
    it('should trim strings in request body', () => {
      mockRequest.body = {
        name: '  John Doe  ',
        nested: {
          value: '  trimmed  '
        },
        array: ['  item1  ', '  item2  ']
      };

      sanitizeInput(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({
        name: 'John Doe',
        nested: {
          value: 'trimmed'
        },
        array: ['item1', 'item2']
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should trim strings in query parameters', () => {
      mockRequest.query = {
        search: '  test query  ',
        filter: '  active  '
      };

      sanitizeInput(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.query).toEqual({
        search: 'test query',
        filter: 'active'
      });
    });

    it('should handle non-string values', () => {
      mockRequest.body = {
        name: '  John  ',
        age: 30,
        active: true,
        tags: null,
        metadata: undefined
      };

      sanitizeInput(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body).toEqual({
        name: 'John',
        age: 30,
        active: true,
        tags: null,
        metadata: undefined
      });
    });
  });

  describe('validateContentType', () => {
    it('should allow valid content type', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {
        'content-type': 'application/json'
      };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid content type', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {
        'content-type': 'text/plain'
      };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ValidationError));
    });

    it('should skip validation for GET requests', () => {
      mockRequest.method = 'GET';
      mockRequest.headers = {
        'content-type': 'text/plain'
      };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should handle content type with charset', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {
        'content-type': 'application/json; charset=utf-8'
      };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should skip validation when no content-type header', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {};

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});