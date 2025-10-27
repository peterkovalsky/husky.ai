export interface JobStatus {
  jobId: string;
  promptId?: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  previewUrl?: string;
  errorMessage?: string;
  projectId?: string;
  prompt?: string;
}

export interface PromptResponse {
  message: string;
  jobId: string;
  promptId?: string;
  status: string;
  timestamp: string;
  projectId?: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
}

export interface Project {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
  modifiedAt: string;
  subdomain?: string;
  publishedStatus?: PublishingStatus;
  publishedAt?: string;
  currentVersion?: number;
}

export interface Prompt {
  id: string;
  prompt: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
  projectId: string;
  userId: string;
  createdAt: string;
  modifiedAt: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface UserSetupResponse {
  status: 'existing' | 'created';
  message: string;
  workspace?: Workspace;
  project?: Project;
}

export interface Build {
  id: string;
  version: number;
  createdAt: string;
  metrics?: {
    aiGenerationTimeMs?: number;
    dependencyInstallTimeMs?: number;
    buildTimeMs?: number;
    s3UploadTimeMs?: number;
    totalTimeMs?: number;
  };
}

export interface Preview {
  id: string;
  previewUrl: string;
  createdAt: string;
  promptId?: string;
}

export interface ProjectDetails {
  project: {
    id: string;
    name: string;
    workspaceId: string;
    createdAt: string;
    modifiedAt: string;
  };
  workspace: {
    id: string;
    name: string;
  } | null;
  stats: {
    totalPrompts: number;
    totalBuilds: number;
    totalPreviews: number;
    currentVersion: number;
  };
  recentPrompts: {
    id: string;
    prompt: string;
    status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
    createdAt: string;
    modifiedAt: string;
  }[];
  builds: Build[];
  previews: Preview[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId?: string;
}

export interface GeneratePresignedUploadResponse {
  mediaId: string;
  uploadUrl: string;
  s3Key: string;
}

export interface ConfirmMediaUploadResponse {
  success: boolean;
  media: {
    id: string;
    s3Key: string;
    mimeType: string;
  };
}

export type PublishingStatus = 'UNPUBLISHED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'UNPUBLISHING';

export interface PublishStatusResponse {
  status: PublishingStatus;
  publishedAt?: string;
  publishedUrl?: string;
  error?: string;
  subdomain?: string;
}

export interface PublishResponse {
  message: string;
  projectId: string;
}


import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3333';

export class ApiService {
  private static async getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token 
      ? { 'Authorization': `Bearer ${session.access_token}` }
      : {};
  }

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    try {
      const authHeaders = await this.getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  static async submitPrompt(prompt: string, projectId?: string, mediaIds?: string[]): Promise<PromptResponse> {
    return this.request<PromptResponse>('/api/prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt, projectId, mediaIds }),
    });
  }


  static async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/api/status/${jobId}`);
  }

  static async getWorkspaces(): Promise<{ workspaces: Workspace[] }> {
    return this.request<{ workspaces: Workspace[] }>('/api/workspaces');
  }

  static async getProjects(workspaceId: string): Promise<{ projects: Project[] }> {
    return this.request<{ projects: Project[] }>(`/api/projects/${workspaceId}`);
  }

  static async getPrompts(projectId: string): Promise<{ prompts: Prompt[] }> {
    return this.request<{ prompts: Prompt[] }>(`/api/prompts/${projectId}`);
  }

  static async getProjectDetails(projectId: string): Promise<ProjectDetails> {
    return this.request<ProjectDetails>(`/api/project/${projectId}`);
  }


  static async getDefaultProject(): Promise<{ project: Project }> {
    return this.request<{ project: Project }>('/api/user/default-project');
  }

  static async createProject(request: CreateProjectRequest): Promise<Project> {
    return this.request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  static async deleteProject(projectId: string): Promise<{ message: string; projectId: string }> {
    return this.request<{ message: string; projectId: string }>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  static async pollJobStatus(
    jobId: string,
    onUpdate: (status: JobStatus) => void,
    onError: (error: Error) => void
  ): Promise<() => void> {
    const poll = async () => {
      try {
        const status = await this.getJobStatus(jobId);
        onUpdate(status);

        // Stop polling if job is in final state
        if (status.status === 'READY' || status.status === 'FAILED' || status.errorMessage) {
          clearInterval(intervalId);
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Failed to poll job status'));
        clearInterval(intervalId);
      }
    };

    // Poll immediately
    await poll();

    // Set up interval for polling every 10 seconds
    const intervalId = setInterval(poll, 10000);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }

  // Media upload methods
  static async generatePresignedUpload(
    fileName: string,
    mimeType: string,
    projectId: string
  ): Promise<GeneratePresignedUploadResponse> {
    return this.request<GeneratePresignedUploadResponse>('/api/media/presigned-upload', {
      method: 'POST',
      body: JSON.stringify({ fileName, mimeType, projectId }),
    });
  }

  static async uploadToS3(file: File, uploadUrl: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to upload to S3: ${response.statusText}`);
    }
  }

  static async confirmMediaUpload(mediaId: string): Promise<ConfirmMediaUploadResponse> {
    return this.request<ConfirmMediaUploadResponse>('/api/media/confirm-upload', {
      method: 'POST',
      body: JSON.stringify({ mediaId }),
    });
  }

  static async deleteMedia(mediaId: string, projectId?: string): Promise<{ success: boolean }> {
    const endpoint = projectId
      ? `/api/media/${mediaId}?projectId=${projectId}`
      : `/api/media/${mediaId}`;
    return this.request<{ success: boolean }>(endpoint, {
      method: 'DELETE',
    });
  }

  // Publishing methods
  static async publishProject(projectId: string): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/api/projects/${projectId}/publish`, {
      method: 'POST',
    });
  }

  static async unpublishProject(projectId: string): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/api/projects/${projectId}/unpublish`, {
      method: 'POST',
    });
  }

  static async getPublishStatus(projectId: string): Promise<PublishStatusResponse> {
    return this.request<PublishStatusResponse>(`/api/projects/${projectId}/publish/status`);
  }

  static async retryPublish(projectId: string): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/api/projects/${projectId}/publish/retry`, {
      method: 'POST',
    });
  }

  static async pollPublishStatus(
    projectId: string,
    onUpdate: (status: PublishStatusResponse) => void,
    onError: (error: Error) => void
  ): Promise<() => void> {
    const poll = async () => {
      try {
        const status = await this.getPublishStatus(projectId);
        onUpdate(status);

        // Stop polling if publishing is in final state
        if (status.status === 'PUBLISHED' || status.status === 'FAILED' || status.status === 'UNPUBLISHED') {
          clearInterval(intervalId);
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Failed to poll publish status'));
        clearInterval(intervalId);
      }
    };

    // Poll immediately
    await poll();

    // Set up interval for polling every 2 seconds
    const intervalId = setInterval(poll, 2000);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}