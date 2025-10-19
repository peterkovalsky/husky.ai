import { Media, CreateMediaRequest } from '../entities/Media';

export interface IMediaRepository {
  create(request: CreateMediaRequest): Promise<Media>;
  findById(id: string): Promise<Media | null>;
  findByIds(ids: string[]): Promise<Media[]>;
  findByUserId(userId: string): Promise<Media[]>;
  updateDimensions(id: string, width: number, height: number): Promise<void>;
  delete(id: string): Promise<void>;
}
