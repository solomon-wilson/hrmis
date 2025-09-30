import { supabaseAuthService } from '../services/SupabaseAuthService';
import { permissionManager } from '../services/PermissionManager';
import { logger } from '../utils/logger';
/**
 * Supabase authentication middleware - verifies access token and sets user context
 */
export const authenticateWithSupabase = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = supabaseAuthService.extractTokenFromHeader(authHeader);
        if (!token) {
            res.status(401).json({
                error: {
                    code: 'MISSING_TOKEN',
                    message: 'Authentication token is required'
                }
            });
            return;
        }
        // Validate token and get user
        const { user, employee } = await supabaseAuthService.verifyAccessToken(token);
        // Set user context in request
        req.user = user;
        req.employee = employee;
        req.accessToken = token;
        req.permissionContext = {
            userId: user.id,
            roles: user.roles,
            employeeId: user.employeeId || employee?.getEmployeeId()
        };
        logger.debug(`User ${user.email} authenticated successfully via Supabase`);
        next();
    }
    catch (error) {
        logger.error('Supabase authentication failed:', error);
        let errorCode = 'AUTHENTICATION_FAILED';
        let errorMessage = 'Authentication failed';
        if (error instanceof Error) {
            if (error.message.includes('expired')) {
                errorCode = 'TOKEN_EXPIRED';
                errorMessage = 'Authentication token has expired';
            }
            else if (error.message.includes('invalid') || error.message.includes('Invalid')) {
                errorCode = 'INVALID_TOKEN';
                errorMessage = 'Invalid authentication token';
            }
            else if (error.message.includes('banned') || error.message.includes('deactivated')) {
                errorCode = 'ACCOUNT_DEACTIVATED';
                errorMessage = 'Account has been deactivated';
            }
        }
        res.status(401).json({
            error: {
                code: errorCode,
                message: errorMessage
            }
        });
    }
};
/**
 * Optional Supabase authentication middleware - sets user context if token is provided
 */
export const optionalAuthenticateWithSupabase = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = supabaseAuthService.extractTokenFromHeader(authHeader);
        if (token) {
            const { user, employee } = await supabaseAuthService.verifyAccessToken(token);
            req.user = user;
            req.employee = employee;
            req.accessToken = token;
            req.permissionContext = {
                userId: user.id,
                roles: user.roles,
                employeeId: user.employeeId || employee?.getEmployeeId()
            };
        }
        next();
    }
    catch (error) {
        // For optional auth, we don't fail on invalid tokens
        logger.debug('Optional Supabase authentication failed, continuing without user context:', error);
        next();
    }
};
/**
 * Authorization middleware factory - checks if user has required permission
 * Works with Supabase RLS but also provides application-level checks
 */
export const authorize = (resource, action) => {
    return (req, res, next) => {
        try {
            if (!req.user || !req.permissionContext) {
                res.status(401).json({
                    error: {
                        code: 'AUTHENTICATION_REQUIRED',
                        message: 'Authentication is required for this operation'
                    }
                });
                return;
            }
            // Extract target ID from request parameters or body
            const targetId = req.params.id || req.params.employeeId || req.body.employeeId;
            const hasPermission = permissionManager.hasPermission(req.permissionContext, resource, action, targetId);
            if (!hasPermission) {
                logger.warn(`User ${req.user.email} denied access to ${resource}:${action}`, {
                    userId: req.user.id,
                    resource,
                    action,
                    targetId
                });
                res.status(403).json({
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'You do not have permission to perform this operation'
                    }
                });
                return;
            }
            logger.debug(`User ${req.user.email} authorized for ${resource}:${action}`, {
                userId: req.user.id,
                resource,
                action,
                targetId
            });
            next();
        }
        catch (error) {
            logger.error('Authorization check failed:', error);
            res.status(500).json({
                error: {
                    code: 'AUTHORIZATION_ERROR',
                    message: 'Failed to check permissions'
                }
            });
        }
    };
};
/**
 * Role-based authorization middleware for Supabase
 */
export const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user || !req.permissionContext) {
            res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication is required'
                }
            });
            return;
        }
        const hasRole = permissionManager.hasRole(req.permissionContext.roles, requiredRole);
        if (!hasRole) {
            res.status(403).json({
                error: {
                    code: 'INSUFFICIENT_ROLE',
                    message: `This operation requires ${requiredRole} role`
                }
            });
            return;
        }
        next();
    };
};
/**
 * Employee access middleware - checks if user can access specific employee
 * Note: Supabase RLS will also enforce these rules at the database level
 */
export const canAccessEmployee = (req, res, next) => {
    if (!req.user || !req.permissionContext) {
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authentication is required'
            }
        });
        return;
    }
    const targetEmployeeId = req.params.id || req.params.employeeId;
    if (!targetEmployeeId) {
        res.status(400).json({
            error: {
                code: 'MISSING_EMPLOYEE_ID',
                message: 'Employee ID is required'
            }
        });
        return;
    }
    const canAccess = permissionManager.canAccessEmployee(req.permissionContext, targetEmployeeId);
    if (!canAccess) {
        res.status(403).json({
            error: {
                code: 'EMPLOYEE_ACCESS_DENIED',
                message: 'You do not have permission to access this employee record'
            }
        });
        return;
    }
    next();
};
/**
 * Employee modification middleware - checks if user can modify specific employee
 */
export const canModifyEmployee = (req, res, next) => {
    if (!req.user || !req.permissionContext) {
        res.status(401).json({
            error: {
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authentication is required'
            }
        });
        return;
    }
    const targetEmployeeId = req.params.id || req.params.employeeId;
    if (!targetEmployeeId) {
        res.status(400).json({
            error: {
                code: 'MISSING_EMPLOYEE_ID',
                message: 'Employee ID is required'
            }
        });
        return;
    }
    const canModify = permissionManager.canModifyEmployee(req.permissionContext, targetEmployeeId);
    if (!canModify) {
        res.status(403).json({
            error: {
                code: 'EMPLOYEE_MODIFY_DENIED',
                message: 'You do not have permission to modify this employee record'
            }
        });
        return;
    }
    next();
};
/**
 * Field filtering middleware - filters response data based on user permissions
 * Note: With Supabase RLS, much of this filtering happens at the database level
 */
export const filterEmployeeFields = (req, res, next) => {
    if (!req.permissionContext) {
        next();
        return;
    }
    // Store original json method
    const originalJson = res.json;
    // Override json method to filter data
    res.json = function (data) {
        if (data && typeof data === 'object') {
            // Filter single employee object
            if (data.id && !Array.isArray(data)) {
                const filtered = permissionManager.filterSensitiveFields(data, req.permissionContext, 'employee');
                return originalJson.call(this, filtered);
            }
            // Filter array of employees
            if (data.data && Array.isArray(data.data)) {
                const filteredData = data.data.map((employee) => permissionManager.filterSensitiveFields(employee, req.permissionContext, 'employee'));
                return originalJson.call(this, { ...data, data: filteredData });
            }
            // Filter direct array
            if (Array.isArray(data)) {
                const filteredData = data.map((employee) => permissionManager.filterSensitiveFields(employee, req.permissionContext, 'employee'));
                return originalJson.call(this, filteredData);
            }
        }
        return originalJson.call(this, data);
    };
    next();
};
/**
 * Manager context middleware - adds managed employee IDs to permission context
 * Works with Supabase data
 */
export const addManagerContext = async (req, _res, next) => {
    try {
        if (!req.permissionContext || !req.employee) {
            next();
            return;
        }
        // Check if user has manager role
        const isManager = permissionManager.hasRole(req.permissionContext.roles, 'MANAGER');
        if (isManager && req.employee) {
            try {
                // Use Supabase repository to get direct reports
                const { SupabaseEmployeeRepository } = await import('../database/repositories/supabase-employee');
                const employeeRepository = new SupabaseEmployeeRepository();
                const directReports = await employeeRepository.getDirectReports(req.employee.getId(), req.accessToken);
                // Add managed employee IDs to context
                req.permissionContext.managedEmployeeIds = directReports.map(emp => emp.getId());
                req.permissionContext.isManager = true;
                logger.debug(`Manager context added`, {
                    managerId: req.employee.getId(),
                    managedEmployeeCount: directReports.length
                });
            }
            catch (error) {
                logger.warn('Failed to fetch managed employees, continuing without manager context:', error);
                req.permissionContext.isManager = true;
                req.permissionContext.managedEmployeeIds = [];
            }
        }
        next();
    }
    catch (error) {
        logger.error('Failed to add manager context:', error);
        next(); // Continue without manager context
    }
};
/**
 * Middleware to ensure user has an associated employee record
 */
export const requireEmployeeRecord = (req, res, next) => {
    if (!req.employee) {
        res.status(403).json({
            error: {
                code: 'NO_EMPLOYEE_RECORD',
                message: 'User account must be linked to an employee record'
            }
        });
        return;
    }
    next();
};
