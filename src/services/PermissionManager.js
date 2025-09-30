import { logger } from '../utils/logger';
/**
 * Role-based access control manager
 */
export class PermissionManager {
    constructor() {
        this.roleHierarchy = {
            'VIEWER': 1,
            'EMPLOYEE': 2,
            'MANAGER': 3,
            'HR_ADMIN': 4
        };
        this.rolePermissions = {
            'VIEWER': {
                employee: ['read', 'list'],
                employee_status: ['read'],
                employee_history: [],
                user: [],
                report: [],
                audit_log: []
            },
            'EMPLOYEE': {
                employee: ['read', 'update'], // Can update own profile
                employee_status: ['read'],
                employee_history: ['read'], // Can view own history
                user: ['read', 'update'], // Can update own user profile
                report: [],
                audit_log: []
            },
            'MANAGER': {
                employee: ['read', 'list', 'update'], // Can manage direct reports
                employee_status: ['read', 'manage_status'], // Can update status of direct reports
                employee_history: ['read'],
                user: ['read'],
                report: ['read', 'view_reports'], // Can view team reports
                audit_log: []
            },
            'HR_ADMIN': {
                employee: ['create', 'read', 'update', 'delete', 'list', 'view_sensitive'],
                employee_status: ['read', 'manage_status'],
                employee_history: ['read'],
                user: ['create', 'read', 'update', 'delete', 'list'],
                report: ['read', 'export', 'view_reports'],
                audit_log: ['read', 'list']
            }
        };
    }
    /**
     * Check if user has permission to perform action on resource
     */
    hasPermission(context, resource, action, targetId) {
        try {
            // Check if any role has the required permission
            const hasRolePermission = context.roles.some(role => {
                const roleActions = this.rolePermissions[role]?.[resource] || [];
                return roleActions.includes(action);
            });
            if (!hasRolePermission) {
                return false;
            }
            // Apply context-specific rules
            return this.applyContextualRules(context, resource, action, targetId);
        }
        catch (error) {
            logger.error('Error checking permission:', error);
            return false;
        }
    }
    /**
     * Get field-level permissions for a resource
     */
    getFieldPermissions(context, resource, targetId) {
        try {
            const basePermissions = this.getBaseFieldPermissions(context.roles, resource);
            // Apply contextual modifications
            return this.applyFieldContextualRules(basePermissions, context, resource, targetId);
        }
        catch (error) {
            logger.error('Error getting field permissions:', error);
            return {};
        }
    }
    /**
     * Check if user can access specific employee data
     */
    canAccessEmployee(context, targetEmployeeId) {
        // HR_ADMIN can access all employees
        if (this.hasRole(context.roles, 'HR_ADMIN')) {
            return true;
        }
        // Users can access their own employee record
        if (context.employeeId === targetEmployeeId) {
            return true;
        }
        // Managers can access their direct reports
        if (this.hasRole(context.roles, 'MANAGER') && context.managedEmployeeIds?.includes(targetEmployeeId)) {
            return true;
        }
        // Viewers can access basic employee info (handled by field permissions)
        if (this.hasRole(context.roles, 'VIEWER')) {
            return true;
        }
        return false;
    }
    /**
     * Check if user can modify employee data
     */
    canModifyEmployee(context, targetEmployeeId) {
        // HR_ADMIN can modify all employees
        if (this.hasRole(context.roles, 'HR_ADMIN')) {
            return true;
        }
        // Employees can modify limited fields of their own record
        if (context.employeeId === targetEmployeeId && this.hasRole(context.roles, 'EMPLOYEE')) {
            return true;
        }
        // Managers can modify limited fields of direct reports
        if (this.hasRole(context.roles, 'MANAGER') && context.managedEmployeeIds?.includes(targetEmployeeId)) {
            return true;
        }
        return false;
    }
    /**
     * Check if user can manage employee status
     */
    canManageEmployeeStatus(context, targetEmployeeId) {
        // HR_ADMIN can manage all employee statuses
        if (this.hasRole(context.roles, 'HR_ADMIN')) {
            return true;
        }
        // Managers can manage status of direct reports (limited actions)
        if (this.hasRole(context.roles, 'MANAGER') && context.managedEmployeeIds?.includes(targetEmployeeId)) {
            return true;
        }
        return false;
    }
    /**
     * Get highest role level for user
     */
    getHighestRoleLevel(roles) {
        return Math.max(...roles.map(role => this.roleHierarchy[role] || 0));
    }
    /**
     * Check if user has specific role
     */
    hasRole(roles, targetRole) {
        return roles.includes(targetRole);
    }
    /**
     * Check if user has role at or above specified level
     */
    hasRoleLevel(roles, minimumRole) {
        const userLevel = this.getHighestRoleLevel(roles);
        const requiredLevel = this.roleHierarchy[minimumRole];
        return userLevel >= requiredLevel;
    }
    /**
     * Filter sensitive fields based on user permissions
     */
    filterSensitiveFields(data, context, resource) {
        if (!data || typeof data !== 'object') {
            return {};
        }
        const fieldPermissions = this.getFieldPermissions(context, resource);
        const filtered = {};
        Object.entries(data).forEach(([key, value]) => {
            const permission = fieldPermissions[key] || 'read';
            if (permission !== 'none') {
                filtered[key] = value;
            }
        });
        return filtered;
    }
    /**
     * Apply contextual rules for permissions
     */
    applyContextualRules(context, resource, action, targetId) {
        // Employee resource specific rules
        if (resource === 'employee') {
            if (action === 'read' || action === 'update') {
                return targetId ? this.canAccessEmployee(context, targetId) : true;
            }
            if (action === 'create' || action === 'delete') {
                return this.hasRole(context.roles, 'HR_ADMIN');
            }
        }
        // Employee status specific rules
        if (resource === 'employee_status' && action === 'manage_status') {
            return targetId ? this.canManageEmployeeStatus(context, targetId) : false;
        }
        // User resource specific rules
        if (resource === 'user') {
            if (action === 'read' || action === 'update') {
                // Users can access their own user record
                if (targetId && context.userId === targetId) {
                    return true;
                }
                // HR_ADMIN can access all user records
                if (this.hasRole(context.roles, 'HR_ADMIN')) {
                    return true;
                }
                // If no targetId specified, allow if user has the base permission
                if (!targetId) {
                    return true;
                }
                return false;
            }
        }
        // Report access rules
        if (resource === 'report') {
            if (action === 'export') {
                return this.hasRole(context.roles, 'HR_ADMIN');
            }
        }
        return true;
    }
    /**
     * Get base field permissions for roles
     */
    getBaseFieldPermissions(roles, resource) {
        const permissions = {};
        if (resource === 'employee') {
            // Default permissions for all roles
            permissions.id = 'read';
            permissions.employeeId = 'read';
            permissions.firstName = 'read';
            permissions.lastName = 'read';
            permissions.email = 'read';
            permissions.jobTitle = 'read';
            permissions.department = 'read';
            permissions.status = 'read';
            permissions.startDate = 'read';
            permissions.employmentType = 'read';
            // Sensitive fields - restricted access
            permissions.socialSecurityNumber = 'none';
            permissions.salary = 'none';
            permissions.dateOfBirth = 'none';
            // HR_ADMIN gets access to sensitive fields
            if (this.hasRole(roles, 'HR_ADMIN')) {
                permissions.socialSecurityNumber = 'read';
                permissions.salary = 'write';
                permissions.dateOfBirth = 'read';
                permissions.phone = 'write';
                permissions.address = 'write';
                permissions.emergencyContact = 'write';
                permissions.managerId = 'write';
            }
            // MANAGER gets limited write access
            if (this.hasRole(roles, 'MANAGER')) {
                permissions.phone = 'read';
                permissions.emergencyContact = 'read';
            }
            // EMPLOYEE gets limited write access to own record
            if (this.hasRole(roles, 'EMPLOYEE')) {
                permissions.phone = 'write';
                permissions.address = 'write';
                permissions.emergencyContact = 'write';
            }
        }
        return permissions;
    }
    /**
     * Apply contextual rules to field permissions
     */
    applyFieldContextualRules(basePermissions, context, resource, targetId) {
        const permissions = { ...basePermissions };
        if (resource === 'employee' && targetId) {
            // Employees can only write to their own record
            if (this.hasRole(context.roles, 'EMPLOYEE') && context.employeeId !== targetId) {
                Object.keys(permissions).forEach(key => {
                    if (permissions[key] === 'write') {
                        permissions[key] = 'read';
                    }
                });
            }
            // Managers can only write to direct reports
            if (this.hasRole(context.roles, 'MANAGER') &&
                !this.hasRole(context.roles, 'HR_ADMIN') &&
                !context.managedEmployeeIds?.includes(targetId)) {
                Object.keys(permissions).forEach(key => {
                    if (permissions[key] === 'write') {
                        permissions[key] = 'read';
                    }
                });
            }
            // Viewers get read-only access to non-sensitive fields
            if (this.hasRole(context.roles, 'VIEWER') && !this.hasRoleLevel(context.roles, 'EMPLOYEE')) {
                Object.keys(permissions).forEach(key => {
                    if (permissions[key] === 'write') {
                        permissions[key] = 'read';
                    }
                });
            }
        }
        return permissions;
    }
}
// Export singleton instance
export const permissionManager = new PermissionManager();
