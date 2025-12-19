import { IInspoRepository, InspoListOptions } from '../../domain/repositories/IInspoRepository';
import { InspoType } from '../../domain/entities/Inspo';

export interface GetInspoGalleryRequestDto {
  type?: InspoType;
  limit?: number;
  offset?: number;
}

export interface InspoGalleryItem {
  id: string;
  name: string;
  imageUrl: string;
}

export interface GetInspoGalleryResponseDto {
  items: InspoGalleryItem[];
  total: number;
  hasMore: boolean;
}

export class GetInspoGalleryUseCase {
  constructor(private inspoRepository: IInspoRepository) {}

  async execute(dto: GetInspoGalleryRequestDto): Promise<GetInspoGalleryResponseDto> {
    const limit = dto.limit || 12;
    const offset = dto.offset || 0;

    const { items, total } = await this.inspoRepository.findAll({
      type: dto.type || 'LANDING_PAGE',
      limit,
      offset
    });

    return {
      items: items.map(item => ({
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl
      })),
      total,
      hasMore: offset + items.length < total
    };
  }
}
