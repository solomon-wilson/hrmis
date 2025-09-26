import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

class SupabaseConnection {
  private client: SupabaseClient | null = null;
  private adminClient: SupabaseClient | null = null;
  private config: SupabaseConfig;

  constructor() {
    this.config = {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    };

    if (!this.config.url || !this.config.anonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
  }

  /**
   * Initialize the Supabase connection
   */
  public async connect(): Promise<void> {
    try {
      // Create public client (for auth and RLS-protected operations)
      this.client = createClient(this.config.url, this.config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
        },
      });

      // Create admin client (bypasses RLS for admin operations)
      if (this.config.serviceRoleKey) {
        this.adminClient = createClient(this.config.url, this.config.serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        });
      }

      // Test the connection
      const { data, error } = await this.client.from('users').select('count', { count: 'exact', head: true });

      if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist yet
        throw error;
      }

      logger.info('Supabase connection established successfully', {
        url: this.config.url,
      });

    } catch (error) {
      logger.error('Failed to connect to Supabase', error);
      throw new Error(`Supabase connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the public Supabase client (with RLS)
   */
  public getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get the admin Supabase client (bypasses RLS)
   */
  public getAdminClient(): SupabaseClient {
    if (!this.adminClient) {
      throw new Error('Supabase admin client not available. Check service role key configuration.');
    }
    return this.adminClient;
  }

  /**
   * Get a client with a specific user context
   */
  public getClientForUser(accessToken: string): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    return createClient(this.config.url, this.config.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  /**
   * Authenticate with email and password
   */
  public async signIn(email: string, password: string) {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logger.error('Supabase sign in failed:', error);
      throw error;
    }

    return data;
  }

  /**
   * Sign up a new user
   */
  public async signUp(email: string, password: string, metadata?: Record<string, any>) {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });

    if (error) {
      logger.error('Supabase sign up failed:', error);
      throw error;
    }

    return data;
  }

  /**
   * Sign out current user
   */
  public async signOut() {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    const { error } = await this.client.auth.signOut();

    if (error) {
      logger.error('Supabase sign out failed:', error);
      throw error;
    }
  }

  /**
   * Get current user
   */
  public async getCurrentUser(): Promise<User | null> {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    const { data: { user }, error } = await this.client.auth.getUser();

    if (error) {
      logger.error('Failed to get current user:', error);
      throw error;
    }

    return user;
  }

  /**
   * Refresh the current session
   */
  public async refreshSession() {
    if (!this.client) {
      throw new Error('Supabase not connected. Call connect() first.');
    }

    const { data, error } = await this.client.auth.refreshSession();

    if (error) {
      logger.error('Failed to refresh session:', error);
      throw error;
    }

    return data;
  }

  /**
   * Check if Supabase is connected
   */
  public isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Close the Supabase connection (cleanup)
   */
  public async disconnect(): Promise<void> {
    if (this.client) {
      await this.signOut().catch(() => {}); // Ignore errors on cleanup
      this.client = null;
      this.adminClient = null;
      logger.info('Supabase connection closed');
    }
  }
}

// Create a singleton instance
export const supabase = new SupabaseConnection();

// Export types
export type { SupabaseClient, User };