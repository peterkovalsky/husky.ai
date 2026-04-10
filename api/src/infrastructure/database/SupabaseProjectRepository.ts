import { SupabaseClient } from '@supabase/supabase-js';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { Project, ProjectTemplate, CreateProjectRequest, PublishingStatus, ProjectStatus, HostnameStatus, CustomDomainStatus } from '../../domain/entities/Project';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseProjectRepository implements IProjectRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateProjectRequest): Promise<Project> {
    const insertData = {
      name: request.name,
      description: request.description,
      workspace_id: request.workspaceId,
      template: request.template || 'react18-ts'
    };

    const { data, error } = await this.supabase
      .from('projects')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async findByWorkspaceId(workspaceId: string): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .neq('status', 'DELETING');

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async checkUserAccess(userId: string, projectId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .single();

    if (error) return false;

    // Check if user has access to the workspace
    const { data: userWorkspace, error: uwError } = await this.supabase
      .from('user_workspaces')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', data.workspace_id)
      .single();

    if (uwError && uwError.code !== 'PGRST116') return false;
    return !!userWorkspace;
  }

  async updatePreviewUrl(projectId: string, previewUrl: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ preview_url: previewUrl })
      .eq('id', projectId);

    if (error) throw error;
  }

  async updateCurrentVersion(projectId: string, version: number): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ current_version: version })
      .eq('id', projectId);

    if (error) throw error;
  }

  async findByIdForOperations(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async updateStatus(projectId: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ status })
      .eq('id', projectId);

    if (error) throw error;
  }

  async deleteById(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw error;
  }

  async setSubdomain(projectId: string, subdomain: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ subdomain })
      .eq('id', projectId);

    if (error) throw error;
  }

  async isSubdomainTaken(subdomain: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id')
      .eq('subdomain', subdomain)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  async updatePublishingStatus(projectId: string, status: PublishingStatus): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ published_status: status })
      .eq('id', projectId);

    if (error) throw error;
  }

  async updatePublishingError(projectId: string, errorMessage: string | null): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ publishing_error: errorMessage })
      .eq('id', projectId);

    if (error) throw error;
  }

  async updateCloudFrontDetails(
    projectId: string,
    distributionId: string,
    domain: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({
        cloudfront_distribution_id: distributionId,
        cloudfront_domain: domain
      })
      .eq('id', projectId);

    if (error) throw error;
  }

  async setPublishedAt(projectId: string, publishedAt: Date | null): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ published_at: publishedAt ? publishedAt.toISOString() : null })
      .eq('id', projectId);

    if (error) throw error;
  }

  async setPublishedVersion(projectId: string, version: number | null): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ published_version: version })
      .eq('id', projectId);

    if (error) throw error;
  }

  async setCustomDomain(projectId: string, domain: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({ custom_domain: domain })
      .eq('id', projectId);

    if (error) throw error;
  }

  async isCustomDomainTaken(domain: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id')
      .eq('custom_domain', domain)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  async clearCustomDomain(projectId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .update({
        custom_domain: null,
        custom_domain_cloudflare_id: null,
        custom_domain_status: 'NONE',
        custom_domain_error: null,
        custom_domain_verified_at: null
      })
      .eq('id', projectId);

    if (error) throw error;
  }

  async updateCustomDomainStatus(projectId: string, status: string, errorMessage?: string | null): Promise<void> {
    const updateData: any = {
      custom_domain_status: status
    };

    if (errorMessage !== undefined) {
      updateData.custom_domain_error = errorMessage;
    }

    const { error } = await this.supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (error) throw error;
  }

  async update(projectId: string, updates: Partial<Project>): Promise<void> {
    // Convert camelCase entity properties to snake_case database columns
    const dbUpdates: any = {};

    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.previewUrl !== undefined) dbUpdates.preview_url = updates.previewUrl;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.currentVersion !== undefined) dbUpdates.current_version = updates.currentVersion;
    if (updates.subdomain !== undefined) dbUpdates.subdomain = updates.subdomain;
    if (updates.publishedStatus !== undefined) dbUpdates.published_status = updates.publishedStatus;
    if (updates.publishedAt !== undefined) dbUpdates.published_at = updates.publishedAt ? updates.publishedAt.toISOString() : null;
    if (updates.publishedVersion !== undefined) dbUpdates.published_version = updates.publishedVersion;
    if (updates.cloudfrontDistributionId !== undefined) dbUpdates.cloudfront_distribution_id = updates.cloudfrontDistributionId;
    if (updates.cloudfrontDomain !== undefined) dbUpdates.cloudfront_domain = updates.cloudfrontDomain;
    if (updates.cloudflareHostnameId !== undefined) dbUpdates.cloudflare_hostname_id = updates.cloudflareHostnameId;
    if (updates.cloudflareHostnameStatus !== undefined) dbUpdates.cloudflare_hostname_status = updates.cloudflareHostnameStatus;
    if (updates.hostnameStatus !== undefined) dbUpdates.hostname_status = updates.hostnameStatus;
    if (updates.hostnameError !== undefined) dbUpdates.hostname_error = updates.hostnameError;
    if (updates.publishingError !== undefined) dbUpdates.publishing_error = updates.publishingError;
    if (updates.customDomain !== undefined) dbUpdates.custom_domain = updates.customDomain;
    if (updates.customDomainCloudflareId !== undefined) dbUpdates.custom_domain_cloudflare_id = updates.customDomainCloudflareId;
    if (updates.customDomainStatus !== undefined) dbUpdates.custom_domain_status = updates.customDomainStatus;
    if (updates.customDomainError !== undefined) dbUpdates.custom_domain_error = updates.customDomainError;
    if (updates.customDomainVerifiedAt !== undefined) dbUpdates.custom_domain_verified_at = updates.customDomainVerifiedAt ? updates.customDomainVerifiedAt.toISOString() : null;
    if (updates.designSystem !== undefined) dbUpdates.design_system = updates.designSystem;
    // Note: thumbnailUrl is not stored in DB - it's constructed on-the-fly from projectId and currentVersion

    const { error } = await this.supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', projectId);

    if (error) throw error;
  }

  async isNameTakenInWorkspace(name: string, workspaceId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', name)
      .neq('status', 'DELETING')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  async findStaleProjects(olderThan: Date): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .in('status', ['NEW', 'FAILED'])
      .lt('created_at', olderThan.toISOString());

    if (error) throw error;
    return (data || []).map(this.mapToEntity);
  }

  private mapToEntity(data: any): Project {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      template: (data.template || 'react18-ts') as ProjectTemplate,
      previewUrl: data.preview_url,
      workspaceId: data.workspace_id,
      status: data.status as ProjectStatus,
      currentVersion: data.current_version || 0,
      subdomain: data.subdomain,
      publishedStatus: data.published_status || PublishingStatus.UNPUBLISHED,
      publishedAt: data.published_at ? new Date(data.published_at) : undefined,
      publishedVersion: data.published_version,
      cloudfrontDistributionId: data.cloudfront_distribution_id,
      cloudfrontDomain: data.cloudfront_domain,
      cloudflareHostnameId: data.cloudflare_hostname_id,
      cloudflareHostnameStatus: data.cloudflare_hostname_status,
      hostnameStatus: data.hostname_status as HostnameStatus | undefined,
      hostnameError: data.hostname_error,
      publishingError: data.publishing_error,
      customDomain: data.custom_domain,
      customDomainCloudflareId: data.custom_domain_cloudflare_id,
      customDomainStatus: data.custom_domain_status as CustomDomainStatus | undefined,
      customDomainError: data.custom_domain_error,
      customDomainVerifiedAt: data.custom_domain_verified_at ? new Date(data.custom_domain_verified_at) : undefined,
      designSystem: data.design_system || undefined,
      // Note: thumbnailUrl is constructed on-the-fly by ProjectController.addThumbnailUrls()
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at)
    };
  }
}