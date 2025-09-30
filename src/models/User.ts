export type UserRole = 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'VIEWER';

export interface User {
  id: string;
  username: string;
  email: string;
  roles: UserRole[];
  employeeId?: string; // Link to employee record if applicable
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissionContext?: {
    userId: string;
    roles: UserRole[];
    employeeId?: string;
    targetEmployeeId?: string;
    targetUserId?: string;
    isManager?: boolean;
    managedEmployeeIds?: string[];
  };
}