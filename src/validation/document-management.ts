import Joi from 'joi';

export const paramsWithId = Joi.object({
  id: Joi.string().uuid().required()
});

export const paramsWithEmployeeId = Joi.object({
  employeeId: Joi.string().uuid().required()
});

export const uploadBody = Joi.object({
  employeeId: Joi.string().uuid().required(),
  category: Joi.string().valid(
    'PASSPORT_PHOTO',
    'IDENTIFICATION',
    'CONTRACT',
    'CERTIFICATE',
    'PERFORMANCE_REVIEW',
    'TRAINING_RECORD',
    'OTHER'
  ).required(),
  title: Joi.string().trim().min(1).max(255).required(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  expiresAt: Joi.date().optional(),
  metadata: Joi.object().unknown(true).optional()
});

export const listQuery = Joi.object({
  employeeId: Joi.string().uuid().optional(),
  category: Joi.string().optional(),
  status: Joi.string().optional(),
  fromDate: Joi.date().optional(),
  toDate: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const updateBody = Joi.object({
  title: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  metadata: Joi.object().unknown(true).optional()
}).min(1);

export const daysQuery = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30)
});

// Leave plan
export const leavePlanCreate = Joi.object({
  employeeId: Joi.string().uuid().required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  entries: Joi.array().items(Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    type: Joi.string().valid('ANNUAL', 'SICK', 'UNPAID', 'OTHER').required(),
    days: Joi.number().positive().required()
  })).min(1).required(),
  notes: Joi.string().trim().max(1000).allow('', null).optional()
});

export const leavePlanUpdate = Joi.object({
  year: Joi.number().integer().min(2000).max(2100).optional(),
  entries: Joi.array().items(Joi.object({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    type: Joi.string().valid('ANNUAL', 'SICK', 'UNPAID', 'OTHER').required(),
    days: Joi.number().positive().required()
  })).min(1).optional(),
  notes: Joi.string().trim().max(1000).allow('', null).optional()
}).min(1);


