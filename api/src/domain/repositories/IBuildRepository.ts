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
  updateVersion(id: string, version: number): Promise<void>;
  updateFileTree(id: string, fileTree: Record<string, string>): Promise<void>;
  update(id: string, updates: Partial<Build>): Promise<void>; // Generic update for any build fields
  removeMediaIdFromProject(projectId: string, mediaId: string): Promise<void>;
  removeMediaIdFromAllBuilds(mediaId: string): Promise<void>; // Remove media from all builds that reference it
  deleteById(id: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
  deleteByVersion(projectId: string, version: number): Promise<void>;
  undoBuild(buildId: string, projectId: string, restoreVersion: number): Promise<void>;
}