export type JobStatus = 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';

export interface JobInfo {
  id: string;
  status: JobStatus;
  prompt: string;
  createdAt: Date;
  updatedAt: Date;
  previewUrl?: string;
  errorMessage?: string;
  appDirectory?: string;
}

export class JobStatusService {
  private jobs: Map<string, JobInfo> = new Map();

  createJob(id: string, prompt: string): JobInfo {
    const job: JobInfo = {
      id,
      status: 'QUEUED',
      prompt,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.jobs.set(id, job);
    return job;
  }

  getJob(id: string): JobInfo | undefined {
    return this.jobs.get(id);
  }

  updateJobStatus(id: string, status: JobStatus, additionalData?: Partial<JobInfo>): JobInfo | undefined {
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }

    job.status = status;
    job.updatedAt = new Date();
    
    if (additionalData) {
      Object.assign(job, additionalData);
    }

    this.jobs.set(id, job);
    return job;
  }

  getAllJobs(): JobInfo[] {
    return Array.from(this.jobs.values());
  }

  deleteJob(id: string): boolean {
    return this.jobs.delete(id);
  }

  // Clean up old jobs (older than 24 hours)
  cleanupOldJobs(): void {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);

    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < cutoffTime) {
        this.jobs.delete(id);
      }
    }
  }
}