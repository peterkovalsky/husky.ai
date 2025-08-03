// Legacy service to maintain backward compatibility with existing job status functionality
// This can be removed once all consumers migrate to the new architecture

export interface JobStatus {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';
  prompt: string;
  createdAt: Date;
  data?: any;
}

export class LegacyJobStatusService {
  private jobs = new Map<string, JobStatus>();

  createJob(id: string, prompt: string): void {
    this.jobs.set(id, {
      id,
      status: 'QUEUED',
      prompt,
      createdAt: new Date()
    });
  }

  updateJobStatus(id: string, status: JobStatus['status'], data?: any): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      if (data) {
        job.data = { ...job.data, ...data };
      }
    }
  }

  getJob(id: string): JobStatus | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): JobStatus[] {
    return Array.from(this.jobs.values());
  }

  cleanupOldJobs(): void {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [id, job] of this.jobs.entries()) {
      if (job.createdAt < oneDayAgo) {
        this.jobs.delete(id);
      }
    }
  }
}