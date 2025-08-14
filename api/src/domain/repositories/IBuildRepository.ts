import { Build, CreateBuildRequest, BuildMetrics, BuildStatus } from '../entities/Build';

export interface IBuildRepository {
  create(request: CreateBuildRequest): Promise<Build>;
  findById(id: string): Promise<Build | null>;
  findByProjectId(projectId: string): Promise<Build[]>;
  findLatestByProjectId(projectId: string): Promise<Build | null>;
  findLatestSuccessfulByProjectId(projectId: string): Promise<Build | null>;
  findByProjectAndVersion(projectId: string, version: number): Promise<Build | null>;
  getNextVersionForProject(projectId: string): Promise<number>;
  updateMetrics(id: string, metrics: BuildMetrics): Promise<void>;
  updateStatus(id: string, status: BuildStatus): Promise<void>;
  updateFileTree(id: string, fileTree: Record<string, string>): Promise<void>;
  updateTokens(id: string, inputTokens: number, outputTokens: number): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}