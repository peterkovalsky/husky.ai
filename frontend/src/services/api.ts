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
  created_at: string;
  modified_at: string;
}

export interface Project {
  id: string;
  name: string;
  workspace_id: string;
  created_at: string;
  modified_at: string;
}

export interface Prompt {
  id: string;
  prompt: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
  project_id: string;
  user_id: string;
  created_at: string;
  modified_at: string;
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
  created_at: string;
  metrics?: {
    ai_generation_time_ms?: number;
    dependency_install_time_ms?: number;
    build_time_ms?: number;
    s3_upload_time_ms?: number;
    total_time_ms?: number;
  };
}

export interface Preview {
  id: string;
  preview_url: string;
  created_at: string;
  prompt_id?: string;
}

export interface ProjectDetails {
  project: {
    id: string;
    name: string;
    workspace_id: string;
    created_at: string;
    modified_at: string;
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
    created_at: string;
    modified_at: string;
  }[];
  builds: Build[];
  previews: Preview[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId?: string;
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

  static async submitPrompt(prompt: string, projectId?: string): Promise<PromptResponse> {
    return this.request<PromptResponse>('/api/prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt, project_id: projectId }),
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

  static async setupUser(): Promise<UserSetupResponse> {
    return this.request<UserSetupResponse>('/api/user/setup', {
      method: 'POST',
    });
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
}