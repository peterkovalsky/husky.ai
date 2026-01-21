import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { Media, CreateMediaRequest } from '../../domain/entities/Media';

interface MediaRow {
  id: string;
  user_id: string;
  type: string;
  mime_type: string;
  s3_key: string;
  s3_bucket: string;
  s3_public_key?: string;
  s3_public_bucket?: string;
  thumbnail_s3_key?: string;
  thumbnail_s3_bucket?: string;
  file_size: number;
  width?: number;
  height?: number;
  created_at: string;
  modified_at: string;
  deleted_at: string | null;
}

export class SupabaseMediaRepository implements IMediaRepository {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  private mapRowToEntity(row: MediaRow): Media {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as 'image' | 'video' | 'doc',
      mimeType: row.mime_type,
      s3Key: row.s3_key,
      s3Bucket: row.s3_bucket,
      s3PublicKey: row.s3_public_key,
      s3PublicBucket: row.s3_public_bucket,
      thumbnailS3Key: row.thumbnail_s3_key,
      thumbnailS3Bucket: row.thumbnail_s3_bucket,
      fileSize: row.file_size,
      width: row.width,
      height: row.height,
      createdAt: new Date(row.created_at),
      modifiedAt: new Date(row.modified_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }

  async create(request: CreateMediaRequest): Promise<Media> {
    const { data, error } = await this.supabase
      .from('medias')
      .insert({
        user_id: request.userId,
        type: request.type,
        mime_type: request.mimeType,
        s3_key: request.s3Key,
        s3_bucket: request.s3Bucket,
        file_size: request.fileSize,
        width: request.width,
        height: request.height,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create media: ${error.message}`);
    }

    return this.mapRowToEntity(data);
  }

  async findById(id: string): Promise<Media | null> {
    const { data, error } = await this.supabase
      .from('medias')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to find media: ${error.message}`);
    }

    return this.mapRowToEntity(data);
  }

  async findByIdIncludingDeleted(id: string): Promise<Media | null> {
    const { data, error } = await this.supabase
      .from('medias')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to find media (including deleted): ${error.message}`);
    }

    return this.mapRowToEntity(data);
  }

  async findByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('medias')
      .select('*')
      .in('id', ids)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to find medias: ${error.message}`);
    }

    return data.map(this.mapRowToEntity);
  }

  async findByUserId(userId: string): Promise<Media[]> {
    const { data, error } = await this.supabase
      .from('medias')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to find medias by user: ${error.message}`);
    }

    return data.map(this.mapRowToEntity);
  }

  async updateDimensions(id: string, width: number, height: number): Promise<void> {
    const { error } = await this.supabase
      .from('medias')
      .update({
        width,
        height,
        modified_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update media dimensions: ${error.message}`);
    }
  }

  async updatePublicS3Info(id: string, s3PublicKey: string, s3PublicBucket: string): Promise<void> {
    const { error } = await this.supabase
      .from('medias')
      .update({
        s3_public_key: s3PublicKey || null,
        s3_public_bucket: s3PublicBucket || null,
        modified_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update media public S3 info: ${error.message}`);
    }
  }

  async updateThumbnailInfo(id: string, thumbnailS3Key: string, thumbnailS3Bucket: string): Promise<void> {
    const { error } = await this.supabase
      .from('medias')
      .update({
        thumbnail_s3_key: thumbnailS3Key || null,
        thumbnail_s3_bucket: thumbnailS3Bucket || null,
        modified_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update media thumbnail info: ${error.message}`);
    }
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('medias')
      .update({
        deleted_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to soft delete media: ${error.message}`);
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('medias')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete media: ${error.message}`);
    }
  }
}
