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
  updateStepStatus(id: string, stepStatus: string): Promise<void>;
  updateVersion(id: string, version: number): Promise<void>;
  updateFileTree(id: string, fileTree: Record<string, string>): Promise<void>;
  removeMediaIdFromProject(projectId: string, mediaId: string): Promise<void>;
  removeMediaIdFromAllBuilds(mediaId: string): Promise<void>; // Remove media from all builds that reference it
  deleteByProjectId(projectId: string): Promise<void>;
  deleteByVersion(projectId: string, version: number): Promise<void>;
}