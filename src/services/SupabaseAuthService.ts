import { User as SupabaseUser, AuthError } from '@supabase/supabase-js';
import { supabase } from '../database/supabase';
import { SupabaseEmployeeRepository } from '../database/repositories/supabase-employee';
import { Employee } from '../models/Employee';
import { User, UserRole } from '../models/User';
import { logger } from '../utils/logger';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  employee?: Employee;
}

export interface SignUpRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles?: UserRole[];
}

export interface SignUpResponse {
  user: SupabaseUser;
  needsConfirmation: boolean;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export class SupabaseAuthService {
  private employeeRepository: SupabaseEmployeeRepository;

  constructor() {
    this.employeeRepository = new SupabaseEmployeeRepository();
  }

  /**
   * Sign in with email and password
   */
  async signIn(loginRequest: LoginRequest): Promise<LoginResponse> {
    const { email, password } = loginRequest;

    try {
      const { data, error } = await supabase.signIn(email, password);

      if (error) {
        logger.error('Supabase sign in failed:', error);
        throw new Error(this.mapAuthError(error));
      }

      if (!data.user || !data.session) {
        throw new Error('Sign in failed: No user data returned');
      }

      // Get employee record linked to this auth user
      let employee: Employee | null = null;
      try {
        employee = await this.employeeRepository.findByAuthUserId(data.user.id);
      } catch (error) {
        logger.warn('Could not fetch employee record for user:', { userId: data.user.id, error });
      }

      // Create User model from Supabase user and employee data
      const user = this.mapSupabaseUserToUser(data.user, employee);

      logger.info(`User ${user.email} signed in successfully`);

      return {
        user,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        employee: employee || undefined
      };
    } catch (error) {
      logger.error('Sign in failed:', error);
      throw error;
    }
  }

  /**
   * Sign up a new user
   */
  async signUp(signUpRequest: SignUpRequest): Promise<SignUpResponse> {
    const { email, password, firstName, lastName, roles = ['EMPLOYEE'] } = signUpRequest;

    try {
      const metadata = {
        first_name: firstName,
        last_name: lastName,
        roles: roles
      };

      const { data, error } = await supabase.signUp(email, password, metadata);

      if (error) {
        logger.error('Supabase sign up failed:', error);
        throw new Error(this.mapAuthError(error));
      }

      if (!data.user) {
        throw new Error('Sign up failed: No user data returned');
      }

      logger.info(`User ${email} signed up successfully`);

      return {
        user: data.user,
        needsConfirmation: !data.session // If no session, email confirmation is required
      };
    } catch (error) {
      logger.error('Sign up failed:', error);
      throw error;
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      await supabase.signOut();
      logger.info('User signed out successfully');
    } catch (error) {
      logger.error('Sign out failed:', error);
      throw error;
    }
  }

  /**
   * Get current user session
   */
  async getCurrentUser(): Promise<{ user: User; employee?: Employee } | null> {
    try {
      const supabaseUser = await supabase.getCurrentUser();

      if (!supabaseUser) {
        return null;
      }

      // Get employee record if available
      let employee: Employee | null = null;
      try {
        employee = await this.employeeRepository.findByAuthUserId(supabaseUser.id);
      } catch (error) {
        logger.warn('Could not fetch employee record for current user:', { userId: supabaseUser.id, error });
      }

      const user = this.mapSupabaseUserToUser(supabaseUser, employee);

      return {
        user,
        employee: employee || undefined
      };
    } catch (error) {
      logger.error('Get current user failed:', error);
      throw error;
    }
  }

  /**
   * Refresh the current session
   */
  async refreshSession(): Promise<TokenRefreshResponse> {
    try {
      const { data, error } = await supabase.refreshSession();

      if (error) {
        logger.error('Session refresh failed:', error);
        throw new Error(this.mapAuthError(error));
      }

      if (!data.user || !data.session) {
        throw new Error('Session refresh failed: No session data returned');
      }

      // Get employee record
      let employee: Employee | null = null;
      try {
        employee = await this.employeeRepository.findByAuthUserId(data.user.id);
      } catch (error) {
        logger.warn('Could not fetch employee record during refresh:', { userId: data.user.id, error });
      }

      const user = this.mapSupabaseUserToUser(data.user, employee);

      logger.info(`Session refreshed for user ${user.email}`);

      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        user
      };
    } catch (error) {
      logger.error('Session refresh failed:', error);
      throw error;
    }
  }

  /**
   * Verify and decode access token
   */
  async verifyAccessToken(token: string): Promise<{ user: User; employee?: Employee }> {
    try {
      const client = supabase.getClientForUser(token);
      const { data: { user: supabaseUser }, error } = await client.auth.getUser();

      if (error) {
        throw new Error(this.mapAuthError(error));
      }

      if (!supabaseUser) {
        throw new Error('Invalid access token');
      }

      // Get employee record
      let employee: Employee | null = null;
      try {
        employee = await this.employeeRepository.findByAuthUserId(supabaseUser.id, token);
      } catch (error) {
        logger.warn('Could not fetch employee record during token verification:', { userId: supabaseUser.id, error });
      }

      const user = this.mapSupabaseUserToUser(supabaseUser, employee);

      return {
        user,
        employee: employee || undefined
      };
    } catch (error) {
      logger.error('Token verification failed:', error);
      throw error;
    }
  }

  /**
   * Update user metadata (roles, etc.)
   */
  async updateUserMetadata(userId: string, metadata: Record<string, any>): Promise<void> {
    try {
      const adminClient = supabase.getAdminClient();

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: metadata
      });

      if (error) {
        throw new Error(this.mapAuthError(error));
      }

      logger.info(`User metadata updated for user ${userId}`);
    } catch (error) {
      logger.error('Update user metadata failed:', error);
      throw error;
    }
  }

  /**
   * Link employee record to Supabase auth user
   */
  async linkEmployeeToUser(employeeId: string, authUserId: string): Promise<void> {
    try {
      await this.employeeRepository.update(employeeId, { auth_user_id: authUserId });
      logger.info(`Employee ${employeeId} linked to auth user ${authUserId}`);
    } catch (error) {
      logger.error('Link employee to user failed:', error);
      throw error;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    try {
      const client = supabase.getClient();
      const { error } = await client.auth.resetPasswordForEmail(email);

      if (error) {
        throw new Error(this.mapAuthError(error));
      }

      logger.info(`Password reset email sent to ${email}`);
    } catch (error) {
      logger.error('Password reset failed:', error);
      throw error;
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword: string): Promise<void> {
    try {
      const client = supabase.getClient();
      const { error } = await client.auth.updateUser({ password: newPassword });

      if (error) {
        throw new Error(this.mapAuthError(error));
      }

      logger.info('Password updated successfully');
    } catch (error) {
      logger.error('Password update failed:', error);
      throw error;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Map Supabase user to application User model
   */
  private mapSupabaseUserToUser(supabaseUser: SupabaseUser, employee?: Employee | null): User {
    const metadata = supabaseUser.user_metadata || {};
    const roles = metadata.roles || ['EMPLOYEE'];

    return {
      id: supabaseUser.id,
      username: metadata.username || supabaseUser.email?.split('@')[0] || '',
      email: supabaseUser.email || '',
      roles: roles as UserRole[],
      employeeId: employee?.getEmployeeId(),
      isActive: !supabaseUser.banned_until,
      createdAt: new Date(supabaseUser.created_at),
      updatedAt: new Date(supabaseUser.updated_at || supabaseUser.created_at)
    };
  }

  /**
   * Map Supabase auth errors to friendly messages
   */
  private mapAuthError(error: AuthError): string {
    switch (error.message) {
      case 'Invalid login credentials':
        return 'Invalid email or password';
      case 'Email not confirmed':
        return 'Please check your email and click the confirmation link';
      case 'User not found':
        return 'No account found with this email address';
      case 'Signup disabled':
        return 'Account registration is currently disabled';
      case 'Invalid token':
        return 'Authentication token is invalid or expired';
      case 'Token expired':
        return 'Authentication token has expired';
      default:
        return error.message || 'Authentication failed';
    }
  }
}

// Export singleton instance
export const supabaseAuthService = new SupabaseAuthService();