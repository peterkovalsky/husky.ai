import { SupabaseClient } from '@supabase/supabase-js';
import { IInspoRepository, InspoListOptions } from '../../domain/repositories/IInspoRepository';
import { Inspo, InspoType } from '../../domain/entities/Inspo';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

interface InspoRow {
  id: string;
  name: string;
  type: InspoType;
  mime_type: string;
  file_name: string;
  created_at: string;
  modified_at: string;
}

export class SupabaseInspoRepository implements IInspoRepository {
  private supabase: SupabaseClient;
  private readonly BASE_URL = 'https://media.huskystudio.ai/inspo/landing-pages/760x950';

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async findById(id: string): Promise<Inspo | null> {
    const { data, error } = await this.supabase
      .from('inspo')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to find inspo: ${error.message}`);
    }

    return this.mapToEntity(data);
  }

  async findAll(options?: InspoListOptions): Promise<{ items: Inspo[]; total: number }> {
    const limit = options?.limit || 12;
    const offset = options?.offset || 0;

    let query = this.supabase
      .from('inspo')
      .select('*', { count: 'exact' });

    if (options?.type) {
      query = query.eq('type', options.type);
    }

    const { data, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch inspo gallery: ${error.message}`);
    }

    return {
      items: (data || []).map((row) => this.mapToEntity(row)),
      total: count || 0
    };
  }

  private mapToEntity(data: InspoRow): Inspo {
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      mimeType: data.mime_type,
      fileName: data.file_name,
      imageUrl: `${this.BASE_URL}/${data.file_name}`,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}
