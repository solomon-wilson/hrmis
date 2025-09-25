import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../../models/User';
import { BaseRepository, PaginatedResult, PaginationOptions, SortOptions, FilterOptions } from './base';
import { logger } from '../../utils/logger';

export interface CreateUserInput {
  username: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  employeeId?: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  passwordHash?: string;
  roles?: UserRole[];
  employeeId?: string;
  isActive?: boolean;
}

export interface UserWithPassword extends User {
  passwordHash: string;
  tokenVersion: number;
}

export interface UserFilters extends FilterOptions {
  email?: string;
  username?: string;
  roles?: UserRole[];
  isActive?: boolean;
  employeeId?: string;
}

export class UserRepository extends BaseRepository<User, CreateUserInput, UpdateUserInput> {
  constructor() {
    super('users');
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserInput, client?: PoolClient): Promise<User> {
    const id = uuidv4();
    const now = new Date();

    const query = `
      INSERT INTO users (
        id, username, email, password_hash, roles, employee_id, 
        is_active, token_version, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, username, email, roles, employee_id, is_active, created_at, updated_at
    `;

    const params = [
      id,
      data.username,
      data.email,
      data.passwordHash,
      JSON.stringify(data.roles),
      data.employeeId || null,
      data.isActive ?? true,
      0, // Initial token version
      now,
      now
    ];

    try {
      const result = await this.executeQuery(query, params, client);
      const row = result.rows[0];
      
      return this.mapRowToUser(row);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string, client?: PoolClient): Promise<User | null> {
    const query = `
      SELECT id, username, email, roles, employee_id, is_active, created_at, updated_at
      FROM users 
      WHERE id = $1
    `;

    try {
      const result = await this.executeQuery(query, [id], client);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw new Error('Failed to find user');
    }
  }

  /**
   * Find user by email (for authentication)
   */
  async findByEmail(email: string, client?: PoolClient): Promise<UserWithPassword | null> {
    const query = `
      SELECT id, username, email, password_hash, roles, employee_id, 
             is_active, token_version, created_at, updated_at
      FROM users 
      WHERE email = $1 AND is_active = true
    `;

    try {
      const result = await this.executeQuery(query, [email], client);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUserWithPassword(result.rows[0]);
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw new Error('Failed to find user');
    }
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string, client?: PoolClient): Promise<User | null> {
    const query = `
      SELECT id, username, email, roles, employee_id, is_active, created_at, updated_at
      FROM users 
      WHERE username = $1
    `;

    try {
      const result = await this.executeQuery(query, [username], client);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error finding user by username:', error);
      throw new Error('Failed to find user');
    }
  }

  /**
   * Find all users with pagination and filtering
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: UserFilters;
  }, client?: PoolClient): Promise<PaginatedResult<User>> {
    const { pagination, sort, filters } = options || {};
    
    // Build WHERE clause
    const { whereClause, params } = this.buildWhereClause(filters || {});
    
    // Build ORDER BY clause
    const orderByClause = this.buildOrderByClause(sort);
    
    // Build pagination
    const { limitClause, limit } = this.buildPaginationClause(pagination);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
      ${whereClause}
    `;

    // Data query
    const dataQuery = `
      SELECT id, username, email, roles, employee_id, is_active, created_at, updated_at
      FROM users
      ${whereClause}
      ${orderByClause}
      ${limitClause}
    `;

    try {
      const [countResult, dataResult] = await Promise.all([
        this.executeQuery(countQuery, params, client),
        this.executeQuery(dataQuery, params, client)
      ]);

      const total = parseInt(countResult.rows[0].total);
      const users = dataResult.rows.map((row: any) => this.mapRowToUser(row));
      
      const paginationMeta = this.calculatePaginationMeta(
        total, 
        pagination?.page || 1, 
        limit
      );

      return {
        data: users,
        pagination: paginationMeta
      };
    } catch (error) {
      logger.error('Error finding users:', error);
      throw new Error('Failed to find users');
    }
  }

  /**
   * Update user
   */
  async update(id: string, data: UpdateUserInput, client?: PoolClient): Promise<User | null> {
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbField = this.mapFieldToColumn(key);
        if (key === 'roles') {
          updateFields.push(`${dbField} = $${paramIndex++}`);
          params.push(JSON.stringify(value));
        } else {
          updateFields.push(`${dbField} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });

    if (updateFields.length === 0) {
      return this.findById(id, client);
    }

    updateFields.push(`updated_at = $${paramIndex++}`);
    params.push(new Date());
    params.push(id); // Add ID as last parameter

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, email, roles, employee_id, is_active, created_at, updated_at
    `;

    try {
      const result = await this.executeQuery(query, params, client);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  /**
   * Soft delete user (set inactive)
   */
  async delete(id: string, client?: PoolClient): Promise<boolean> {
    const query = `
      UPDATE users 
      SET is_active = false, updated_at = $1
      WHERE id = $2
    `;

    try {
      const result = await this.executeQuery(query, [new Date(), id], client);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw new Error('Failed to delete user');
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeId?: string, client?: PoolClient): Promise<boolean> {
    let query = 'SELECT 1 FROM users WHERE email = $1';
    const params: any[] = [email];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    try {
      const result = await this.executeQuery(query, params, client);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error checking email existence:', error);
      throw new Error('Failed to check email existence');
    }
  }

  /**
   * Check if username exists
   */
  async usernameExists(username: string, excludeId?: string, client?: PoolClient): Promise<boolean> {
    let query = 'SELECT 1 FROM users WHERE username = $1';
    const params: any[] = [username];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    try {
      const result = await this.executeQuery(query, params, client);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error checking username existence:', error);
      throw new Error('Failed to check username existence');
    }
  }

  /**
   * Increment token version (for refresh token invalidation)
   */
  async incrementTokenVersion(id: string, client?: PoolClient): Promise<number> {
    const query = `
      UPDATE users 
      SET token_version = token_version + 1, updated_at = $1
      WHERE id = $2
      RETURNING token_version
    `;

    try {
      const result = await this.executeQuery(query, [new Date(), id], client);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0].token_version;
    } catch (error) {
      logger.error('Error incrementing token version:', error);
      throw new Error('Failed to increment token version');
    }
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      roles: JSON.parse(row.roles),
      employeeId: row.employee_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to UserWithPassword object
   */
  private mapRowToUserWithPassword(row: any): UserWithPassword {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      roles: JSON.parse(row.roles),
      employeeId: row.employee_id,
      isActive: row.is_active,
      tokenVersion: row.token_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map field names to database column names
   */
  private mapFieldToColumn(field: string): string {
    const fieldMap: Record<string, string> = {
      'passwordHash': 'password_hash',
      'employeeId': 'employee_id',
      'isActive': 'is_active'
    };

    return fieldMap[field] || field;
  }
}

// Export singleton instance
export const userRepository = new UserRepository();