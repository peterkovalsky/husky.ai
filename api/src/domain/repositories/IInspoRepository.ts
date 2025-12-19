import { Inspo, InspoType } from '../entities/Inspo';

export interface InspoListOptions {
  type?: InspoType;
  limit?: number;
  offset?: number;
}

export interface IInspoRepository {
  findById(id: string): Promise<Inspo | null>;
  findAll(options?: InspoListOptions): Promise<{ items: Inspo[]; total: number }>;
}
