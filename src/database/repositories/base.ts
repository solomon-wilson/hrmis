import { PoolClient } from 'pg';
import { database } from '../connection';

export interface PaginationOptions {
  page: number;
  limit: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SortOptions {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface FilterOptions {
  [key: string]: any;
}

/**
 * Base repository interface defining common CRUD operations
 */
export interface IBaseRepository<T, CreateInput, UpdateInput> {
  create(data: CreateInput, client?: PoolClient): Promise<T>;
  findById(id: string, client?: PoolClient): Promise<T | null>;
  findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: FilterOptions;
  }, client?: PoolClient): Promise<PaginatedResult<T>>;
  update(id: string, data: UpdateInput, client?: PoolClient): Promise<T | null>;
  delete(id: string, client?: PoolClient): Promise<boolean>;
  exists(id: string, client?: PoolClient): Promise<boolean>;
}

/**
 * Abstract base repository class with common functionality
 */
export abstract class BaseRepository<T, CreateInput, UpdateInput> 
  implements IBaseRepository<T, CreateInput, UpdateInput> {
  
  protected tableName: string;
  protected primaryKey: string = 'id';

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Get database client (either provided or from pool)
   */
  protected async getClient(client?: PoolClient): Promise<{ client: PoolClient; shouldRelease: boolean }> {
    if (client) {
      return { client, shouldRelease: false };
    }
    
    const poolClient = await database.getClient();
    return { client: poolClient, shouldRelease: true };
  }

  /**
   * Execute query with automatic client management
   */
  protected async executeQuery<R = any>(
    query: string, 
    params: any[] = [], 
    client?: PoolClient
  ): Promise<R> {
    const { client: dbClient, shouldRelease } = await this.getClient(client);
    
    try {
      const result = await dbClient.query(query, params);
      return result as R;
    } finally {
      if (shouldRelease) {
        dbClient.release();
      }
    }
  }

  /**
   * Build WHERE clause from filters
   */
  protected buildWhereClause(filters: FilterOptions): { whereClause: string; params: any[] } {
    if (!filters || Object.keys(filters).length === 0) {
      return { whereClause: '', params: [] };
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // Handle IN clause for arrays
          const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
          conditions.push(`${key} IN (${placeholders})`);
          params.push(...value);
        } else if (typeof value === 'string' && value.includes('%')) {
          // Handle LIKE clause for string patterns
          conditions.push(`${key} ILIKE $${paramIndex++}`);
          params.push(value);
        } else {
          // Handle equality
          conditions.push(`${key} = $${paramIndex++}`);
          params.push(value);
        }
      }
    });

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }

  /**
   * Build ORDER BY clause from sort options
   */
  protected buildOrderByClause(sort?: SortOptions): string {
    if (!sort) {
      return `ORDER BY ${this.primaryKey} ASC`;
    }

    // Validate sort direction
    const direction = sort.direction === 'DESC' ? 'DESC' : 'ASC';
    return `ORDER BY ${sort.field} ${direction}`;
  }

  /**
   * Build pagination clause
   */
  protected buildPaginationClause(pagination?: PaginationOptions): { 
    limitClause: string; 
    offset: number; 
    limit: number; 
  } {
    const limit = pagination?.limit || 50;
    const page = pagination?.page || 1;
    const offset = pagination?.offset ?? (page - 1) * limit;

    return {
      limitClause: `LIMIT ${limit} OFFSET ${offset}`,
      offset,
      limit
    };
  }

  /**
   * Calculate pagination metadata
   */
  protected calculatePaginationMeta(
    total: number, 
    page: number, 
    limit: number
  ): PaginatedResult<T>['pagination'] {
    const totalPages = Math.ceil(total / limit);
    
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }

  // Abstract methods to be implemented by concrete repositories
  abstract create(data: CreateInput, client?: PoolClient): Promise<T>;
  abstract findById(id: string, client?: PoolClient): Promise<T | null>;
  abstract findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: FilterOptions;
  }, client?: PoolClient): Promise<PaginatedResult<T>>;
  abstract update(id: string, data: UpdateInput, client?: PoolClient): Promise<T | null>;
  abstract delete(id: string, client?: PoolClient): Promise<boolean>;

  /**
   * Check if record exists
   */
  async exists(id: string, client?: PoolClient): Promise<boolean> {
    const query = `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`;
    const result = await this.executeQuery(query, [id], client);
    return result.rowCount > 0;
  }
}