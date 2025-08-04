import { Build, CreateBuildRequest, BuildMetrics } from '../entities/Build';

export interface IBuildRepository {
  create(request: CreateBuildRequest): Promise<Build>;
  findById(id: string): Promise<Build | null>;
  findByProjectId(projectId: string): Promise<Build[]>;
  findLatestByProjectId(projectId: string): Promise<Build | null>;
  findByProjectAndVersion(projectId: string, version: number): Promise<Build | null>;
  getNextVersionForProject(projectId: string): Promise<number>;
  updateMetrics(id: string, metrics: BuildMetrics): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}