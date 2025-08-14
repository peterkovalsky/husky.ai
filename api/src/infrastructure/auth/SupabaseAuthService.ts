import { SupabaseClient } from '@supabase/supabase-js';
import { User } from '../../domain/entities/User';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseAuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      
      if (error || !user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email || '',
        displayName: user.user_metadata?.display_name
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }
}