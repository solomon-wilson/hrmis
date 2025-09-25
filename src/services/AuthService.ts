import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '../models/User';
import { userRepository } from '../database/repositories/user';
import { logger } from '../utils/logger';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  roles: UserRole[];
  employeeId?: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
}

export class AuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshSecret: string;
  private readonly refreshExpiresIn: string;
  private readonly saltRounds = 12;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'fallback-secret';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    if (process.env.NODE_ENV === 'production' && 
        (this.jwtSecret === 'fallback-secret' || this.refreshSecret === 'fallback-refresh-secret')) {
      throw new Error('JWT secrets must be configured in production environment');
    }
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      logger.error('Error hashing password:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logger.error('Error verifying password:', error);
      throw new Error('Failed to verify password');
    }
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(user: User): string {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      employeeId: user.employeeId
    };

    try {
      return jwt.sign(payload, this.jwtSecret, {
        expiresIn: this.jwtExpiresIn,
        issuer: 'employee-management-system',
        audience: 'employee-management-api'
      } as jwt.SignOptions);
    } catch (error) {
      logger.error('Error generating access token:', error);
      throw new Error('Failed to generate access token');
    }
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(userId: string, tokenVersion: number = 0): string {
    const payload: RefreshTokenPayload = {
      userId,
      tokenVersion
    };

    try {
      return jwt.sign(payload, this.refreshSecret, {
        expiresIn: this.refreshExpiresIn,
        issuer: 'employee-management-system',
        audience: 'employee-management-api'
      } as jwt.SignOptions);
    } catch (error) {
      logger.error('Error generating refresh token:', error);
      throw new Error('Failed to generate refresh token');
    }
  }

  /**
   * Verify and decode JWT access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'employee-management-system',
        audience: 'employee-management-api'
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      } else {
        logger.error('Error verifying access token:', error);
        throw new Error('Failed to verify access token');
      }
    }
  }

  /**
   * Verify and decode JWT refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, this.refreshSecret, {
        issuer: 'employee-management-system',
        audience: 'employee-management-api'
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Error verifying refresh token:', error);
        throw new Error('Failed to verify refresh token');
      }
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
   * Generate token pair (access + refresh)
   */
  generateTokenPair(user: User, tokenVersion: number = 0): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user.id, tokenVersion)
    };
  }

  /**
   * Authenticate user with email and password
   */
  async login(loginRequest: LoginRequest): Promise<LoginResponse> {
    const { email, password } = loginRequest;

    try {
      // Find user by email
      const userWithPassword = await userRepository.findByEmail(email);
      
      if (!userWithPassword) {
        throw new Error('Invalid credentials');
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(password, userWithPassword.passwordHash);
      
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (!userWithPassword.isActive) {
        throw new Error('Account is deactivated');
      }

      // Generate tokens
      const { accessToken, refreshToken } = this.generateTokenPair(userWithPassword, userWithPassword.tokenVersion);

      // Update last login
      await userRepository.update(userWithPassword.id, { 
        // Note: We would need to add lastLogin to the UpdateUserInput interface
      });

      // Remove password from response
      const { passwordHash, tokenVersion, ...user } = userWithPassword;

      logger.info(`User ${user.email} logged in successfully`);

      return {
        user,
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      // Verify refresh token
      const decoded = this.verifyRefreshToken(refreshToken);

      // Find user
      const user = await userRepository.findById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      // Get current token version from database
      const userWithPassword = await userRepository.findByEmail(user.email);
      
      if (!userWithPassword || userWithPassword.tokenVersion !== decoded.tokenVersion) {
        throw new Error('Invalid refresh token');
      }

      // Generate new token pair
      const tokens = this.generateTokenPair(user, userWithPassword.tokenVersion);

      logger.info(`Token refreshed for user ${user.email}`);

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Logout user by invalidating refresh tokens
   */
  async logout(userId: string): Promise<void> {
    try {
      // Increment token version to invalidate all refresh tokens
      await userRepository.incrementTokenVersion(userId);
      
      logger.info(`User ${userId} logged out successfully`);
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }

  /**
   * Logout from all devices by incrementing token version
   */
  async logoutFromAllDevices(userId: string): Promise<void> {
    try {
      await userRepository.incrementTokenVersion(userId);
      
      logger.info(`User ${userId} logged out from all devices`);
    } catch (error) {
      logger.error('Logout from all devices failed:', error);
      throw error;
    }
  }

  /**
   * Validate user session and return user info
   */
  async validateSession(token: string): Promise<User> {
    try {
      const decoded = this.verifyAccessToken(token);
      
      const user = await userRepository.findById(decoded.userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      return user;
    } catch (error) {
      logger.error('Session validation failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();