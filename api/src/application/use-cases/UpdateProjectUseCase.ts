import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { UpdateProjectDto } from '../dto/UpdateProjectDto';
import { User } from '../../domain/entities/User';
import { Project } from '../../domain/entities/Project';
import { ValidationError, AuthorizationError, NotFoundError } from '../../shared/errors/AppErrors';

/**
 * Use case for updating project details (name and/or description)
 * Validates input and checks user authorization before updating
 */
export class UpdateProjectUseCase {
  constructor(
    private projectRepository: IProjectRepository
  ) {}

  async execute(projectId: string, dto: UpdateProjectDto, user: User): Promise<Project> {
    // Validate projectId
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new ValidationError('Project ID is required', { userId: user.id });
    }

    // Validate name
    if (!dto.name || typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new ValidationError('Project name is required', {
        userId: user.id,
        projectId
      });
    }

    // Validate name length (3-100 characters)
    const trimmedName = dto.name.trim();
    if (trimmedName.length < 3) {
      throw new ValidationError('Project name must be at least 3 characters', {
        userId: user.id,
        projectId,
        nameLength: trimmedName.length
      });
    }
    if (trimmedName.length > 100) {
      throw new ValidationError('Project name must not exceed 100 characters', {
        userId: user.id,
        projectId,
        nameLength: trimmedName.length
      });
    }

    // Check if project exists
    const existingProject = await this.projectRepository.findById(projectId);
    if (!existingProject) {
      throw new NotFoundError('Project not found', {
        userId: user.id,
        projectId
      });
    }

    // Check user authorization
    const hasAccess = await this.projectRepository.checkUserAccess(user.id, projectId);
    if (!hasAccess) {
      throw new AuthorizationError('Access denied to project', {
        userId: user.id,
        projectId
      });
    }

    // Prepare updates
    const updates: Partial<Project> = {
      name: trimmedName
    };

    // Add description if provided (trim or set to undefined if empty)
    if (dto.description !== undefined) {
      const trimmedDescription = dto.description.trim();
      updates.description = trimmedDescription.length > 0 ? trimmedDescription : undefined;
    }

    // Update the project
    await this.projectRepository.update(projectId, updates);

    // Fetch and return updated project
    const updatedProject = await this.projectRepository.findById(projectId);
    if (!updatedProject) {
      throw new NotFoundError('Project not found after update', {
        userId: user.id,
        projectId
      });
    }

    return updatedProject;
  }
}
