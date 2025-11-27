import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IQueueService, DeleteProjectMessage } from '../../domain/services/IQueueService';
import { IPostHogErrorTracker } from '../../infrastructure/monitoring/PostHogErrorTracker';
import { ProjectStatus } from '../../domain/entities/Project';

/**
 * CleanupStaleProjectsUseCase: Removes abandoned projects
 *
 * This use case identifies and deletes projects that:
 * - Have status NEW or FAILED
 * - Were created more than 7 days ago
 * - Are considered abandoned by users
 *
 * It tracks the cleanup operation via PostHog for monitoring.
 *
 * Usage: This should be run as a scheduled job (e.g., daily cron)
 */
export class CleanupStaleProjectsUseCase {
  private static readonly STALE_THRESHOLD_DAYS = 7;

  constructor(
    private projectRepository: IProjectRepository,
    private queueService: IQueueService,
    private postHogTracker: IPostHogErrorTracker
  ) {}

  async execute(): Promise<{ projectsIdentified: number; projectsQueued: number }> {
    const startTime = Date.now();

    console.log('[CleanupStaleProjectsUseCase] Starting stale project cleanup...');

    // Calculate the threshold date (7 days ago)
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - CleanupStaleProjectsUseCase.STALE_THRESHOLD_DAYS);

    // Find stale projects (NEW or FAILED status, older than threshold)
    const staleProjects = await this.projectRepository.findStaleProjects(thresholdDate);

    console.log(`[CleanupStaleProjectsUseCase] Found ${staleProjects.length} stale projects`);

    let queuedCount = 0;
    const projectIds: string[] = [];
    const statusBreakdown = {
      [ProjectStatus.NEW]: 0,
      [ProjectStatus.FAILED]: 0,
    };

    for (const project of staleProjects) {
      try {
        // Track status breakdown
        if (project.status === ProjectStatus.NEW || project.status === ProjectStatus.FAILED) {
          statusBreakdown[project.status]++;
        }
        projectIds.push(project.id);

        // Mark project as DELETING
        await this.projectRepository.updateStatus(project.id, ProjectStatus.DELETING);

        // Queue deletion job
        const deleteMessage: DeleteProjectMessage = {
          action: 'DELETE_PROJECT',
          projectId: project.id,
          userId: 'system-cleanup',
          timestamp: new Date().toISOString(),
        };

        await this.queueService.sendMessage(deleteMessage);
        queuedCount++;

        console.log(`[CleanupStaleProjectsUseCase] Queued deletion for project ${project.id} (status: ${project.status})`);
      } catch (error) {
        console.error(`[CleanupStaleProjectsUseCase] Failed to queue deletion for project ${project.id}:`, error);
        // Continue with other projects even if one fails
      }
    }

    const duration = Date.now() - startTime;

    // Track cleanup event in PostHog
    await this.postHogTracker.captureEvent('stale_projects_cleanup', {
      projects_identified: staleProjects.length,
      projects_queued: queuedCount,
      projects_failed: staleProjects.length - queuedCount,
      threshold_days: CleanupStaleProjectsUseCase.STALE_THRESHOLD_DAYS,
      threshold_date: thresholdDate.toISOString(),
      duration_ms: duration,
      status_breakdown: statusBreakdown,
      project_ids: projectIds.slice(0, 100), // Limit to first 100 to avoid huge payloads
    });

    console.log(`[CleanupStaleProjectsUseCase] Cleanup completed in ${duration}ms`);
    console.log(`[CleanupStaleProjectsUseCase] Identified: ${staleProjects.length}, Queued: ${queuedCount}`);

    return {
      projectsIdentified: staleProjects.length,
      projectsQueued: queuedCount,
    };
  }
}
