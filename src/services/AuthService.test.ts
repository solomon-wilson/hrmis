import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthService, LoginRequest } from './AuthService';
import { userRepository } from '../database/repositories/user';
import { User } from '../models/User';

// Mock dependencies
jest.mock('../database/repositories/user');
jest.mock('../utils/logger');

const mockUserRepository = userRepository as jest.Mocked<typeof userRepository>;

describe('AuthService', () => {
  let authService: AuthService;
  
  const mockUser: User = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    roles: ['EMPLOYEE'],
    employeeId: 'emp-123',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockUserWithPassword = {
    ...mockUser,
    passwordHash: '$2a$12$hashedpassword',
    tokenVersion: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set test environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    
    // Create new instance after setting env vars
    authService = new AuthService();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  describe('Password Management', () => {
    describe('hashPassword', () => {
      it('should hash password successfully', async () => {
        const password = 'testpassword123';
        const hashedPassword = await authService.hashPassword(password);
        
        expect(hashedPassword).toBeDefined();
        expect(hashedPassword).not.toBe(password);
        expect(hashedPassword.length).toBeGreaterThan(50);
      });

      it('should generate different hashes for same password', async () => {
        const password = 'testpassword123';
        const hash1 = await authService.hashPassword(password);
        const hash2 = await authService.hashPassword(password);
        
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('verifyPassword', () => {
      it('should verify correct password', async () => {
        const password = 'testpassword123';
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const isValid = await authService.verifyPassword(password, hashedPassword);
        
        expect(isValid).toBe(true);
      });

      it('should reject incorrect password', async () => {
        const password = 'testpassword123';
        const wrongPassword = 'wrongpassword';
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const isValid = await authService.verifyPassword(wrongPassword, hashedPassword);
        
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Token Management', () => {
    describe('generateAccessToken', () => {
      it('should generate valid access token', () => {
        const token = authService.generateAccessToken(mockUser);
        
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        
        // Verify token structure
        const decoded = jwt.verify(token, 'test-secret') as any;
        expect(decoded.userId).toBe(mockUser.id);
        expect(decoded.email).toBe(mockUser.email);
        expect(decoded.roles).toEqual(mockUser.roles);
        expect(decoded.employeeId).toBe(mockUser.employeeId);
      });

      it('should include correct claims in token', () => {
        const token = authService.generateAccessToken(mockUser);
        const decoded = jwt.verify(token, 'test-secret') as any;
        
        expect(decoded.iss).toBe('employee-management-system');
        expect(decoded.aud).toBe('employee-management-api');
        expect(decoded.exp).toBeDefined();
      });
    });

    describe('generateRefreshToken', () => {
      it('should generate valid refresh token', () => {
        const token = authService.generateRefreshToken(mockUser.id, 0);
        
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        
        // Verify token structure
        const decoded = jwt.verify(token, 'test-refresh-secret') as any;
        expect(decoded.userId).toBe(mockUser.id);
        expect(decoded.tokenVersion).toBe(0);
      });
    });

    describe('verifyAccessToken', () => {
      it('should verify valid access token', () => {
        const token = authService.generateAccessToken(mockUser);
        const decoded = authService.verifyAccessToken(token);
        
        expect(decoded.userId).toBe(mockUser.id);
        expect(decoded.email).toBe(mockUser.email);
        expect(decoded.roles).toEqual(mockUser.roles);
      });

      it('should throw error for invalid token', () => {
        expect(() => {
          authService.verifyAccessToken('invalid-token');
        }).toThrow('Invalid access token');
      });

      it('should throw error for expired token', () => {
        // Create expired token
        const expiredToken = jwt.sign(
          { 
            userId: mockUser.id,
            iss: 'employee-management-system',
            aud: 'employee-management-api'
          },
          'test-secret',
          { expiresIn: '-1h' }
        );
        
        expect(() => {
          authService.verifyAccessToken(expiredToken);
        }).toThrow('Access token expired');
      });
    });

    describe('verifyRefreshToken', () => {
      it('should verify valid refresh token', () => {
        const token = authService.generateRefreshToken(mockUser.id, 0);
        const decoded = authService.verifyRefreshToken(token);
        
        expect(decoded.userId).toBe(mockUser.id);
        expect(decoded.tokenVersion).toBe(0);
      });

      it('should throw error for invalid refresh token', () => {
        expect(() => {
          authService.verifyRefreshToken('invalid-token');
        }).toThrow('Invalid refresh token');
      });
    });

    describe('extractTokenFromHeader', () => {
      it('should extract token from valid Bearer header', () => {
        const token = 'valid-jwt-token';
        const header = `Bearer ${token}`;
        
        const extracted = authService.extractTokenFromHeader(header);
        
        expect(extracted).toBe(token);
      });

      it('should return null for invalid header format', () => {
        expect(authService.extractTokenFromHeader('InvalidFormat token')).toBeNull();
        expect(authService.extractTokenFromHeader('Bearer')).toBeNull();
        expect(authService.extractTokenFromHeader('')).toBeNull();
        expect(authService.extractTokenFromHeader(undefined)).toBeNull();
      });
    });
  });

  describe('Authentication Flow', () => {
    describe('login', () => {
      const loginRequest: LoginRequest = {
        email: 'test@example.com',
        password: 'testpassword123'
      };

      beforeEach(() => {
        mockUserRepository.findByEmail.mockResolvedValue(mockUserWithPassword);
        mockUserRepository.update.mockResolvedValue(mockUser);
      });

      it('should login successfully with valid credentials', async () => {
        // Mock password verification
        jest.spyOn(authService, 'verifyPassword').mockResolvedValue(true);
        
        const result = await authService.login(loginRequest);
        
        expect(result.user.email).toBe(mockUser.email);
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(loginRequest.email);
      });

      it('should throw error for non-existent user', async () => {
        mockUserRepository.findByEmail.mockResolvedValue(null);
        
        await expect(authService.login(loginRequest)).rejects.toThrow('Invalid credentials');
      });

      it('should throw error for invalid password', async () => {
        jest.spyOn(authService, 'verifyPassword').mockResolvedValue(false);
        
        await expect(authService.login(loginRequest)).rejects.toThrow('Invalid credentials');
      });

      it('should throw error for inactive user', async () => {
        const inactiveUser = { ...mockUserWithPassword, isActive: false };
        mockUserRepository.findByEmail.mockResolvedValue(inactiveUser);
        jest.spyOn(authService, 'verifyPassword').mockResolvedValue(true);
        
        await expect(authService.login(loginRequest)).rejects.toThrow('Account is deactivated');
      });
    });

    describe('refreshToken', () => {
      it('should refresh token successfully', async () => {
        const refreshToken = authService.generateRefreshToken(mockUser.id, 0);
        
        mockUserRepository.findById.mockResolvedValue(mockUser);
        mockUserRepository.findByEmail.mockResolvedValue(mockUserWithPassword);
        
        const result = await authService.refreshToken(refreshToken);
        
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
      });

      it('should throw error for invalid refresh token', async () => {
        await expect(authService.refreshToken('invalid-token')).rejects.toThrow();
      });

      it('should throw error for non-existent user', async () => {
        const refreshToken = authService.generateRefreshToken(mockUser.id, 0);
        mockUserRepository.findById.mockResolvedValue(null);
        
        await expect(authService.refreshToken(refreshToken)).rejects.toThrow('User not found');
      });

      it('should throw error for token version mismatch', async () => {
        const refreshToken = authService.generateRefreshToken(mockUser.id, 0);
        const userWithDifferentVersion = { ...mockUserWithPassword, tokenVersion: 1 };
        
        mockUserRepository.findById.mockResolvedValue(mockUser);
        mockUserRepository.findByEmail.mockResolvedValue(userWithDifferentVersion);
        
        await expect(authService.refreshToken(refreshToken)).rejects.toThrow('Invalid refresh token');
      });
    });

    describe('logout', () => {
      it('should logout successfully', async () => {
        mockUserRepository.incrementTokenVersion.mockResolvedValue(1);
        
        await authService.logout(mockUser.id);
        
        expect(mockUserRepository.incrementTokenVersion).toHaveBeenCalledWith(mockUser.id);
      });
    });

    describe('validateSession', () => {
      it('should validate session successfully', async () => {
        const token = authService.generateAccessToken(mockUser);
        mockUserRepository.findById.mockResolvedValue(mockUser);
        
        const result = await authService.validateSession(token);
        
        expect(result).toEqual(mockUser);
      });

      it('should throw error for invalid token', async () => {
        await expect(authService.validateSession('invalid-token')).rejects.toThrow();
      });

      it('should throw error for non-existent user', async () => {
        const token = authService.generateAccessToken(mockUser);
        mockUserRepository.findById.mockResolvedValue(null);
        
        await expect(authService.validateSession(token)).rejects.toThrow('User not found');
      });

      it('should throw error for inactive user', async () => {
        const token = authService.generateAccessToken(mockUser);
        const inactiveUser = { ...mockUser, isActive: false };
        mockUserRepository.findById.mockResolvedValue(inactiveUser);
        
        await expect(authService.validateSession(token)).rejects.toThrow('Account is deactivated');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle bcrypt errors gracefully', async () => {
      const mockHash = jest.spyOn(bcrypt, 'hash');
      mockHash.mockRejectedValue(new Error('Bcrypt error') as never);
      
      await expect(authService.hashPassword('password')).rejects.toThrow('Failed to hash password');
    });

    it('should handle JWT signing errors gracefully', () => {
      // Mock JWT sign to throw error
      const mockSign = jest.spyOn(jwt, 'sign');
      mockSign.mockImplementation(() => {
        throw new Error('JWT error');
      });
      
      expect(() => authService.generateAccessToken(mockUser)).toThrow('Failed to generate access token');
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error in production without proper JWT secrets', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'fallback-secret';
      
      expect(() => new AuthService()).toThrow('JWT secrets must be configured in production environment');
      
      delete process.env.NODE_ENV;
    });
  });
});