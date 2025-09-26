import { Router } from 'express';
import { MonitoringController } from '../controllers/MonitoringController';
import { authenticate, authorize } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import Joi from 'joi';

const router = Router();

// Query validation schema for monitoring endpoints
const timeRangeSchema = Joi.object({
  start: Joi.date().iso().optional(),
  end: Joi.date().iso().optional(),
  range: Joi.number().integer().min(60).max(86400).optional() // 1 minute to 1 day in seconds
}).with('start', 'end'); // If start is provided, end must also be provided

/**
 * @route GET /api/monitoring/metrics
 * @desc Get comprehensive system metrics
 * @access HR_ADMIN only
 */
router.get('/metrics',
  authenticate,
  authorize(['HR_ADMIN']),
  validateQuery(timeRangeSchema),
  MonitoringController.getMetrics
);

/**
 * @route GET /api/monitoring/errors
 * @desc Get error tracking information
 * @access HR_ADMIN only
 */
router.get('/errors',
  authenticate,
  authorize(['HR_ADMIN']),
  validateQuery(timeRangeSchema),
  MonitoringController.getErrors
);

/**
 * @route GET /api/monitoring/performance
 * @desc Get performance statistics
 * @access HR_ADMIN only
 */
router.get('/performance',
  authenticate,
  authorize(['HR_ADMIN']),
  validateQuery(timeRangeSchema),
  MonitoringController.getPerformance
);

/**
 * @route GET /api/monitoring/health
 * @desc Get system health status
 * @access HR_ADMIN, MANAGER (limited access)
 */
router.get('/health',
  authenticate,
  authorize(['HR_ADMIN', 'MANAGER']),
  MonitoringController.getHealth
);

/**
 * @route GET /api/monitoring/prometheus
 * @desc Export metrics in Prometheus format
 * @access HR_ADMIN only
 */
router.get('/prometheus',
  authenticate,
  authorize(['HR_ADMIN']),
  validateQuery(timeRangeSchema),
  MonitoringController.getPrometheusMetrics
);

export { router as monitoringRoutes };