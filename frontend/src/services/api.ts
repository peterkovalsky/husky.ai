export interface JobStatus {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY';
  createdAt: string;
  updatedAt: string;
  previewUrl?: string;
  errorMessage?: string;
}

export interface PromptResponse {
  message: string;
  jobId: string;
  status: string;
  timestamp: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

import { supabase } from '../lib/supabase';

const API_BASE_URL = '/api';

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

  static async submitPrompt(prompt: string): Promise<PromptResponse> {
    return this.request<PromptResponse>('/prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  static async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/status/${jobId}`);
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
        if (status.status === 'READY' || status.errorMessage) {
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