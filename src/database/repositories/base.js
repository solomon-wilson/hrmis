import { database } from '../connection';
/**
 * Abstract base repository class with common functionality
 */
export class BaseRepository {
    constructor(tableName) {
        this.primaryKey = 'id';
        this.tableName = tableName;
    }
    /**
     * Get database client (either provided or from pool)
     */
    async getClient(client) {
        if (client) {
            return { client, shouldRelease: false };
        }
        const poolClient = await database.getClient();
        return { client: poolClient, shouldRelease: true };
    }
    /**
     * Execute query with automatic client management
     */
    async executeQuery(query, params = [], client) {
        const { client: dbClient, shouldRelease } = await this.getClient(client);
        try {
            const result = await dbClient.query(query, params);
            return result;
        }
        finally {
            if (shouldRelease) {
                dbClient.release();
            }
        }
    }
    /**
     * Build WHERE clause from filters
     */
    buildWhereClause(filters) {
        if (!filters || Object.keys(filters).length === 0) {
            return { whereClause: '', params: [] };
        }
        const conditions = [];
        const params = [];
        let paramIndex = 1;
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    // Handle IN clause for arrays
                    const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
                    conditions.push(`${key} IN (${placeholders})`);
                    params.push(...value);
                }
                else if (typeof value === 'string' && value.includes('%')) {
                    // Handle LIKE clause for string patterns
                    conditions.push(`${key} ILIKE $${paramIndex++}`);
                    params.push(value);
                }
                else {
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
    buildOrderByClause(sort) {
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
    buildPaginationClause(pagination) {
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
     * Check if record exists
     */
    async exists(id, client) {
        const query = `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`;
        const result = await this.executeQuery(query, [id], client);
        return result.rowCount > 0;
    }
}
