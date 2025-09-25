import { PermissionManager, PermissionContext } from './PermissionManager';
import { UserRole } from '../models/User';

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;

  const createContext = (roles: UserRole[], overrides: Partial<PermissionContext> = {}): PermissionContext => ({
    userId: 'user-123',
    roles,
    employeeId: 'emp-123',
    ...overrides
  });

  beforeEach(() => {
    permissionManager = new PermissionManager();
  });

  describe('Role Hierarchy', () => {
    describe('getHighestRoleLevel', () => {
      it('should return highest role level for multiple roles', () => {
        const roles: UserRole[] = ['EMPLOYEE', 'MANAGER'];
        const level = permissionManager.getHighestRoleLevel(roles);
        expect(level).toBe(3); // MANAGER level
      });

      it('should return correct level for single role', () => {
        expect(permissionManager.getHighestRoleLevel(['VIEWER'])).toBe(1);
        expect(permissionManager.getHighestRoleLevel(['EMPLOYEE'])).toBe(2);
        expect(permissionManager.getHighestRoleLevel(['MANAGER'])).toBe(3);
        expect(permissionManager.getHighestRoleLevel(['HR_ADMIN'])).toBe(4);
      });
    });

    describe('hasRole', () => {
      it('should correctly identify if user has specific role', () => {
        const roles: UserRole[] = ['EMPLOYEE', 'MANAGER'];
        
        expect(permissionManager.hasRole(roles, 'EMPLOYEE')).toBe(true);
        expect(permissionManager.hasRole(roles, 'MANAGER')).toBe(true);
        expect(permissionManager.hasRole(roles, 'HR_ADMIN')).toBe(false);
        expect(permissionManager.hasRole(roles, 'VIEWER')).toBe(false);
      });
    });

    describe('hasRoleLevel', () => {
      it('should correctly check role level requirements', () => {
        const roles: UserRole[] = ['MANAGER'];
        
        expect(permissionManager.hasRoleLevel(roles, 'VIEWER')).toBe(true);
        expect(permissionManager.hasRoleLevel(roles, 'EMPLOYEE')).toBe(true);
        expect(permissionManager.hasRoleLevel(roles, 'MANAGER')).toBe(true);
        expect(permissionManager.hasRoleLevel(roles, 'HR_ADMIN')).toBe(false);
      });
    });
  });

  describe('Basic Permissions', () => {

    describe('HR_ADMIN permissions', () => {
      const context = createContext(['HR_ADMIN']);

      it('should have full access to employee operations', () => {
        expect(permissionManager.hasPermission(context, 'employee', 'create')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'update')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'delete')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'list')).toBe(true);
      });

      it('should have access to sensitive operations', () => {
        expect(permissionManager.hasPermission(context, 'employee', 'view_sensitive')).toBe(true);
        expect(permissionManager.hasPermission(context, 'report', 'export')).toBe(true);
        expect(permissionManager.hasPermission(context, 'audit_log', 'read')).toBe(true);
      });

      it('should have full user management access', () => {
        expect(permissionManager.hasPermission(context, 'user', 'create')).toBe(true);
        expect(permissionManager.hasPermission(context, 'user', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'user', 'update')).toBe(true);
        expect(permissionManager.hasPermission(context, 'user', 'delete')).toBe(true);
      });
    });

    describe('MANAGER permissions', () => {
      const context = createContext(['MANAGER'], {
        managedEmployeeIds: ['emp-456', 'emp-789']
      });

      it('should have limited employee access', () => {
        expect(permissionManager.hasPermission(context, 'employee', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'employee', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'update')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'delete')).toBe(false);
      });

      it('should have status management for direct reports', () => {
        expect(permissionManager.hasPermission(context, 'employee_status', 'manage_status', 'emp-456')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee_status', 'manage_status', 'emp-999')).toBe(false);
      });

      it('should have report access but not export', () => {
        expect(permissionManager.hasPermission(context, 'report', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'report', 'view_reports')).toBe(true);
        expect(permissionManager.hasPermission(context, 'report', 'export')).toBe(false);
      });

      it('should not have user management access', () => {
        expect(permissionManager.hasPermission(context, 'user', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'user', 'delete')).toBe(false);
      });
    });

    describe('EMPLOYEE permissions', () => {
      const context = createContext(['EMPLOYEE']);

      it('should have limited employee access', () => {
        expect(permissionManager.hasPermission(context, 'employee', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'employee', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'update')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'delete')).toBe(false);
      });

      it('should not have status management access', () => {
        expect(permissionManager.hasPermission(context, 'employee_status', 'manage_status')).toBe(false);
      });

      it('should not have report access', () => {
        expect(permissionManager.hasPermission(context, 'report', 'read')).toBe(false);
        expect(permissionManager.hasPermission(context, 'report', 'export')).toBe(false);
      });

      it('should have limited user access', () => {
        expect(permissionManager.hasPermission(context, 'user', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'user', 'update')).toBe(true);
        expect(permissionManager.hasPermission(context, 'user', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'user', 'delete')).toBe(false);
      });
    });

    describe('VIEWER permissions', () => {
      const context = createContext(['VIEWER']);

      it('should have read-only employee access', () => {
        expect(permissionManager.hasPermission(context, 'employee', 'read')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'list')).toBe(true);
        expect(permissionManager.hasPermission(context, 'employee', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'employee', 'update')).toBe(false);
        expect(permissionManager.hasPermission(context, 'employee', 'delete')).toBe(false);
      });

      it('should not have any management access', () => {
        expect(permissionManager.hasPermission(context, 'employee_status', 'manage_status')).toBe(false);
        expect(permissionManager.hasPermission(context, 'user', 'create')).toBe(false);
        expect(permissionManager.hasPermission(context, 'report', 'read')).toBe(false);
      });
    });
  });

  describe('Employee Access Control', () => {
    describe('canAccessEmployee', () => {
      it('should allow HR_ADMIN to access any employee', () => {
        const context = createContext(['HR_ADMIN']);
        expect(permissionManager.canAccessEmployee(context, 'any-employee-id')).toBe(true);
      });

      it('should allow employees to access their own record', () => {
        const context = createContext(['EMPLOYEE'], { employeeId: 'emp-123' });
        expect(permissionManager.canAccessEmployee(context, 'emp-123')).toBe(true);
        expect(permissionManager.canAccessEmployee(context, 'emp-456')).toBe(false);
      });

      it('should allow managers to access direct reports', () => {
        const context = createContext(['MANAGER'], {
          employeeId: 'emp-123',
          managedEmployeeIds: ['emp-456', 'emp-789']
        });
        
        expect(permissionManager.canAccessEmployee(context, 'emp-456')).toBe(true);
        expect(permissionManager.canAccessEmployee(context, 'emp-789')).toBe(true);
        expect(permissionManager.canAccessEmployee(context, 'emp-999')).toBe(false);
      });

      it('should allow viewers to access basic employee info', () => {
        const context = createContext(['VIEWER']);
        expect(permissionManager.canAccessEmployee(context, 'any-employee-id')).toBe(true);
      });
    });

    describe('canModifyEmployee', () => {
      it('should allow HR_ADMIN to modify any employee', () => {
        const context = createContext(['HR_ADMIN']);
        expect(permissionManager.canModifyEmployee(context, 'any-employee-id')).toBe(true);
      });

      it('should allow employees to modify their own record', () => {
        const context = createContext(['EMPLOYEE'], { employeeId: 'emp-123' });
        expect(permissionManager.canModifyEmployee(context, 'emp-123')).toBe(true);
        expect(permissionManager.canModifyEmployee(context, 'emp-456')).toBe(false);
      });

      it('should allow managers to modify direct reports', () => {
        const context = createContext(['MANAGER'], {
          managedEmployeeIds: ['emp-456', 'emp-789']
        });
        
        expect(permissionManager.canModifyEmployee(context, 'emp-456')).toBe(true);
        expect(permissionManager.canModifyEmployee(context, 'emp-999')).toBe(false);
      });

      it('should not allow viewers to modify employees', () => {
        const context = createContext(['VIEWER']);
        expect(permissionManager.canModifyEmployee(context, 'any-employee-id')).toBe(false);
      });
    });

    describe('canManageEmployeeStatus', () => {
      it('should allow HR_ADMIN to manage any employee status', () => {
        const context = createContext(['HR_ADMIN']);
        expect(permissionManager.canManageEmployeeStatus(context, 'any-employee-id')).toBe(true);
      });

      it('should allow managers to manage direct reports status', () => {
        const context = createContext(['MANAGER'], {
          managedEmployeeIds: ['emp-456', 'emp-789']
        });
        
        expect(permissionManager.canManageEmployeeStatus(context, 'emp-456')).toBe(true);
        expect(permissionManager.canManageEmployeeStatus(context, 'emp-999')).toBe(false);
      });

      it('should not allow employees to manage status', () => {
        const context = createContext(['EMPLOYEE']);
        expect(permissionManager.canManageEmployeeStatus(context, 'emp-123')).toBe(false);
      });
    });
  });

  describe('Field-Level Permissions', () => {
    describe('Employee field permissions', () => {
      it('should give HR_ADMIN access to all fields', () => {
        const context = createContext(['HR_ADMIN']);
        const permissions = permissionManager.getFieldPermissions(context, 'employee');
        
        expect(permissions.socialSecurityNumber).toBe('read');
        expect(permissions.salary).toBe('write');
        expect(permissions.dateOfBirth).toBe('read');
        expect(permissions.firstName).toBe('read');
        expect(permissions.email).toBe('read');
      });

      it('should restrict sensitive fields for non-HR roles', () => {
        const context = createContext(['MANAGER']);
        const permissions = permissionManager.getFieldPermissions(context, 'employee');
        
        expect(permissions.socialSecurityNumber).toBe('none');
        expect(permissions.salary).toBe('none');
        expect(permissions.dateOfBirth).toBe('none');
        expect(permissions.firstName).toBe('read');
        expect(permissions.email).toBe('read');
      });

      it('should allow employees to edit their own contact info', () => {
        const context = createContext(['EMPLOYEE'], { employeeId: 'emp-123' });
        const permissions = permissionManager.getFieldPermissions(context, 'employee', 'emp-123');
        
        expect(permissions.phone).toBe('write');
        expect(permissions.address).toBe('write');
        expect(permissions.emergencyContact).toBe('write');
        expect(permissions.salary).toBe('none');
      });

      it('should restrict write access for employees viewing others', () => {
        const context = createContext(['EMPLOYEE'], { employeeId: 'emp-123' });
        const permissions = permissionManager.getFieldPermissions(context, 'employee', 'emp-456');
        
        expect(permissions.phone).toBe('read');
        expect(permissions.address).toBe('read');
        expect(permissions.emergencyContact).toBe('read');
      });

      it('should give managers limited access to direct reports', () => {
        const context = createContext(['MANAGER'], {
          managedEmployeeIds: ['emp-456']
        });
        const permissions = permissionManager.getFieldPermissions(context, 'employee', 'emp-456');
        
        expect(permissions.phone).toBe('read');
        expect(permissions.emergencyContact).toBe('read');
        expect(permissions.salary).toBe('none');
      });
    });
  });

  describe('Data Filtering', () => {
    describe('filterSensitiveFields', () => {
      const sampleEmployeeData = {
        id: 'emp-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@company.com',
        phone: '555-1234',
        socialSecurityNumber: '123-45-6789',
        salary: 75000,
        dateOfBirth: '1990-01-01'
      };

      it('should return all fields for HR_ADMIN', () => {
        const context = createContext(['HR_ADMIN']);
        const filtered = permissionManager.filterSensitiveFields(
          sampleEmployeeData,
          context,
          'employee'
        );
        
        expect(filtered).toHaveProperty('socialSecurityNumber');
        expect(filtered).toHaveProperty('salary');
        expect(filtered).toHaveProperty('dateOfBirth');
        expect(filtered).toHaveProperty('firstName');
      });

      it('should filter sensitive fields for non-HR roles', () => {
        const context = createContext(['EMPLOYEE']);
        const filtered = permissionManager.filterSensitiveFields(
          sampleEmployeeData,
          context,
          'employee'
        );
        
        expect(filtered).not.toHaveProperty('socialSecurityNumber');
        expect(filtered).not.toHaveProperty('salary');
        expect(filtered).not.toHaveProperty('dateOfBirth');
        expect(filtered).toHaveProperty('firstName');
        expect(filtered).toHaveProperty('email');
      });

      it('should handle empty or null data gracefully', () => {
        const context = createContext(['EMPLOYEE']);
        
        expect(permissionManager.filterSensitiveFields({}, context, 'employee')).toEqual({});
        expect(permissionManager.filterSensitiveFields(null as any, context, 'employee')).toEqual({});
      });
    });
  });

  describe('Contextual Permission Rules', () => {
    it('should apply user-specific rules for user resource', () => {
      const context = createContext(['EMPLOYEE'], { userId: 'user-123' });
      
      // Can access own user record
      expect(permissionManager.hasPermission(context, 'user', 'read', 'user-123')).toBe(true);
      expect(permissionManager.hasPermission(context, 'user', 'update', 'user-123')).toBe(true);
      
      // Cannot access other user records
      expect(permissionManager.hasPermission(context, 'user', 'read', 'user-456')).toBe(false);
      expect(permissionManager.hasPermission(context, 'user', 'update', 'user-456')).toBe(false);
    });

    it('should handle multiple roles correctly', () => {
      const context = createContext(['EMPLOYEE', 'MANAGER'], {
        employeeId: 'emp-123',
        managedEmployeeIds: ['emp-456']
      });
      
      // Should have manager permissions
      expect(permissionManager.hasPermission(context, 'report', 'read')).toBe(true);
      expect(permissionManager.canManageEmployeeStatus(context, 'emp-456')).toBe(true);
      
      // Should still be able to access own record as employee
      expect(permissionManager.canAccessEmployee(context, 'emp-123')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid roles gracefully', () => {
      const context = createContext(['INVALID_ROLE' as UserRole]);
      
      expect(permissionManager.hasPermission(context, 'employee', 'read')).toBe(false);
      expect(permissionManager.getHighestRoleLevel(['INVALID_ROLE' as UserRole])).toBe(0);
    });

    it('should handle missing context properties', () => {
      const context: PermissionContext = {
        userId: 'user-123',
        roles: ['EMPLOYEE']
        // Missing optional properties
      };
      
      expect(() => permissionManager.hasPermission(context, 'employee', 'read')).not.toThrow();
      expect(() => permissionManager.getFieldPermissions(context, 'employee')).not.toThrow();
    });
  });
});