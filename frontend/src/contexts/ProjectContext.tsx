import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiService } from '../services/api';
import type { Workspace, Project } from '../services/api';

interface ProjectContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  loading: boolean;
  error: string | null;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

interface ProjectProviderProps {
  children: React.ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        setLoading(true);
        const { workspaces } = await ApiService.getWorkspaces();
        setWorkspaces(workspaces);
        
        // Select first workspace (usually "Personal")
        if (workspaces.length > 0) {
          const personalWorkspace = workspaces.find(w => w.name === 'Personal') || workspaces[0];
          setCurrentWorkspace(personalWorkspace);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces');
      } finally {
        setLoading(false);
      }
    };

    loadWorkspaces();
  }, []);

  useEffect(() => {
    const loadProjects = async () => {
      if (!currentWorkspace) return;

      try {
        const { projects } = await ApiService.getProjects(currentWorkspace.id);
        setProjects(projects);
        
        // Select default project (usually "My Project")
        if (projects.length > 0 && !currentProject) {
          const defaultProject = projects.find(p => p.name === 'My Project') || projects[0];
          setCurrentProject(defaultProject);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      }
    };

    loadProjects();
  }, [currentWorkspace, currentProject]);

  const handleSetCurrentProject = useCallback((project: Project) => {
    setCurrentProject(project);
  }, []);

  const value: ProjectContextType = {
    workspaces,
    currentWorkspace,
    projects,
    currentProject,
    setCurrentProject: handleSetCurrentProject,
    loading,
    error,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};