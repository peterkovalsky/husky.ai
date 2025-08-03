import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User } from '../../domain/entities/User';

export class SupabaseAuthService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
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