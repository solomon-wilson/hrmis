import { supabase } from '../supabase';
/**
 * Abstract base repository class with common Supabase functionality
 */
export class SupabaseRepository {
    constructor(tableName) {
        this.tableName = tableName;
    }
    /**
     * Get Supabase client with optional user context
     */
    getClient(userAccessToken) {
        if (userAccessToken) {
            return supabase.getClientForUser(userAccessToken);
        }
        return supabase.getClient();
    }
    /**
     * Get admin client (bypasses RLS)
     */
    getAdminClient() {
        return supabase.getAdminClient();
    }
    /**
     * Execute a query with error handling
     */
    async executeQuery(queryBuilder, operation = 'query') {
        const { data, error } = await queryBuilder;
        if (error) {
            throw new Error(`${operation} failed: ${error.message}`);
        }
        return data;
    }
    /**
     * Calculate pagination metadata
     */
    calculatePaginationMeta(total, page, limit) {
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
    buildPagination(pagination) {
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
    buildOrderBy(sort) {
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
    applyFilters(query, filters) {
        if (!filters)
            return query;
        let filteredQuery = query;
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    filteredQuery = filteredQuery.in(key, value);
                }
                else if (typeof value === 'string' && key.includes('search')) {
                    // Handle text search
                    filteredQuery = filteredQuery.textSearch(key.replace('_search', ''), value);
                }
                else if (typeof value === 'string' && value.includes('%')) {
                    // Handle LIKE queries
                    filteredQuery = filteredQuery.ilike(key, value);
                }
                else {
                    filteredQuery = filteredQuery.eq(key, value);
                }
            }
        });
        return filteredQuery;
    }
    /**
     * Get total count for pagination
     */
    async getCount(filters, userContext) {
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
    /**
     * Default implementation for findAll - can be overridden
     */
    async findAll(options, userContext) {
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
        const data = await this.executeQuery(query, 'findAll');
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
    async exists(id, userContext) {
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
