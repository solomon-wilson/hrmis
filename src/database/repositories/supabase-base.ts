import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';

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
 * Base repository interface defining common CRUD operations for Supabase
 */
export interface ISupabaseRepository<T, CreateInput, UpdateInput> {
  create(data: CreateInput, userContext?: string): Promise<T>;
  findById(id: string, userContext?: string): Promise<T | null>;
  findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: FilterOptions;
  }, userContext?: string): Promise<PaginatedResult<T>>;
  update(id: string, data: UpdateInput, userContext?: string): Promise<T | null>;
  delete(id: string, userContext?: string): Promise<boolean>;
  exists(id: string, userContext?: string): Promise<boolean>;
}

/**
 * Abstract base repository class with common Supabase functionality
 */
export abstract class SupabaseRepository<T, CreateInput, UpdateInput>
  implements ISupabaseRepository<T, CreateInput, UpdateInput> {

  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Get Supabase client with optional user context
   */
  protected getClient(userAccessToken?: string): SupabaseClient {
    if (userAccessToken) {
      return supabase.getClientForUser(userAccessToken);
    }
    return supabase.getClient();
  }

  /**
   * Get admin client (bypasses RLS)
   */
  protected getAdminClient(): SupabaseClient {
    return supabase.getAdminClient();
  }

  /**
   * Execute a query with error handling
   */
  protected async executeQuery<TResult = any>(
    queryBuilder: any,
    operation: string = 'query'
  ): Promise<TResult> {
    const { data, error } = await queryBuilder;

    if (error) {
      throw new Error(`${operation} failed: ${error.message}`);
    }

    return data as TResult;
  }

  /**
   * Calculate pagination metadata
   */
  protected calculatePaginationMeta(
    total: number,
    page: number,
    limit: number
  ) {
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

  /**
   * Build pagination for Supabase query
   */
  protected buildPagination(pagination?: PaginationOptions) {
    if (!pagination) {
      return { from: 0, to: 999 }; // Default limit
    }

    const offset = pagination.offset || (pagination.page - 1) * pagination.limit;
    return {
      from: offset,
      to: offset + pagination.limit - 1
    };
  }

  /**
   * Build order clause for Supabase query
   */
  protected buildOrderBy(sort?: SortOptions) {
    if (!sort) {
      return { column: 'created_at', ascending: false };
    }

    return {
      column: sort.field,
      ascending: sort.direction === 'ASC'
    };
  }

  /**
   * Apply filters to Supabase query
   */
  protected applyFilters(query: any, filters?: FilterOptions) {
    if (!filters) return query;

    let filteredQuery = query;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          filteredQuery = filteredQuery.in(key, value);
        } else if (typeof value === 'string' && key.includes('search')) {
          // Handle text search
          filteredQuery = filteredQuery.textSearch(key.replace('_search', ''), value);
        } else if (typeof value === 'string' && value.includes('%')) {
          // Handle LIKE queries
          filteredQuery = filteredQuery.ilike(key, value);
        } else {
          filteredQuery = filteredQuery.eq(key, value);
        }
      }
    });

    return filteredQuery;
  }

  /**
   * Get total count for pagination
   */
  protected async getCount(
    filters?: FilterOptions,
    userContext?: string
  ): Promise<number> {
    const client = this.getClient(userContext);
    let query = client
      .from(this.tableName)
      .select('*', { count: 'exact', head: true });

    query = this.applyFilters(query, filters);

    const { count, error } = await query;

    if (error) {
      throw new Error(`Count query failed: ${error.message}`);
    }

    return count || 0;
  }

  // Abstract methods that must be implemented by derived classes
  abstract create(data: CreateInput, userContext?: string): Promise<T>;
  abstract findById(id: string, userContext?: string): Promise<T | null>;
  abstract update(id: string, data: UpdateInput, userContext?: string): Promise<T | null>;
  abstract delete(id: string, userContext?: string): Promise<boolean>;

  /**
   * Default implementation for findAll - can be overridden
   */
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    filters?: FilterOptions;
  }, userContext?: string): Promise<PaginatedResult<T>> {
    const { pagination, sort, filters } = options || {};

    const client = this.getClient(userContext);

    // Get total count
    const total = await this.getCount(filters, userContext);

    // Build query
    let query = client.from(this.tableName).select('*');

    // Apply filters
    query = this.applyFilters(query, filters);

    // Apply sorting
    const orderBy = this.buildOrderBy(sort);
    query = query.order(orderBy.column, { ascending: orderBy.ascending });

    // Apply pagination
    const { from, to } = this.buildPagination(pagination);
    query = query.range(from, to);

    const data = await this.executeQuery<T[]>(query, 'findAll');

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const paginationMeta = this.calculatePaginationMeta(total, page, limit);

    return {
      data,
      pagination: paginationMeta
    };
  }

  /**
   * Default implementation for exists
   */
  async exists(id: string, userContext?: string): Promise<boolean> {
    const client = this.getClient(userContext);

    const { data, error } = await client
      .from(this.tableName)
      .select('id')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      throw new Error(`Exists check failed: ${error.message}`);
    }

    return !!data;
  }
}