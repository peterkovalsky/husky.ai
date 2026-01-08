import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Singleton factory for creating and managing Supabase client instances.
 * Eliminates duplicate client initialization across repositories and services.
 */
export class SupabaseClientFactory {
  private static instance: SupabaseClient | null = null;
  private static isInitialized: boolean = false;

  /**
   * Get the shared Supabase client instance.
   * Creates the client on first access with proper environment validation.
   */
  public static getClient(): SupabaseClient {
    if (!this.isInitialized) {
      this.initializeClient();
    }
    
    return this.instance!;
  }

  /**
   * Initialize the Supabase client with environment validation.
   * Throws an error if required environment variables are missing.
   */
  private static initializeClient(): void {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    this.instance = createClient(supabaseUrl, supabaseServiceKey);
    this.isInitialized = true;

    console.log('Supabase client initialized successfully');
  }

  /**
   * Reset the client instance (primarily for testing purposes).
   * Forces re-initialization on next getClient() call.
   */
  public static reset(): void {
    this.instance = null;
    this.isInitialized = false;
  }

  /**
   * Check if the client has been initialized.
   */
  public static isClientInitialized(): boolean {
    return this.isInitialized && this.instance !== null;
  }
}