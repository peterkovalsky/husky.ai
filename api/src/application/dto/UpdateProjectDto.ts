/**
 * Data Transfer Object for updating project details
 * Used when renaming a project or updating its description
 */
export interface UpdateProjectDto {
  name: string;
  description?: string;
}
