import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiService } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { Workspace, Project, CreditBalanceResponse } from '../services/api';

interface ProjectContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  projects: Project[];
  currentProject: Project | null;
  creditBalance: CreditBalanceResponse | null;
  isLoadingCredits: boolean;
  setCurrentProject: (project: Project) => void;
  deleteProject?: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  refreshCredits: () => Promise<void>;
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
  const [creditBalance, setCreditBalance] = useState<CreditBalanceResponse | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserWorkspaces = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        // Get workspaces (backend will auto-setup if needed)
        const { workspaces } = await ApiService.getWorkspaces();
        
        setWorkspaces(workspaces);
        if (workspaces.length > 0) {
          setCurrentWorkspace(workspaces[0]);
          // Projects will be loaded by the second useEffect when currentWorkspace changes
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workspaces');
      } finally {
        setLoading(false);
      }
    };

    loadUserWorkspaces();
  }, [user?.id]);

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

          // Check if this is a newly created user (single workspace with single "My Project" and no successful builds)
          if (workspaces.length === 1 && projects.length === 1 && projects[0].name === 'My Project' && (!projects[0].currentVersion || projects[0].currentVersion === 0)) {
            // Navigate to the newly created project
            navigate(`/project/${projects[0].id}`, { replace: true });
          }
        }
        
        setProjectsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        setProjectsLoaded(true);
      }
    };

    loadProjects();
  }, [currentWorkspace]);

  // Update loading state when projects are loaded
  useEffect(() => {
    if ((currentWorkspace !== null || workspaces.length === 0) && projectsLoaded) {
      setLoading(false);
    }
  }, [currentWorkspace, workspaces.length, projectsLoaded]);

  // Fetch credit balance when workspace changes
  useEffect(() => {
    const loadCredits = async () => {
      if (!currentWorkspace) {
        setCreditBalance(null);
        return;
      }

      try {
        setIsLoadingCredits(true);
        const balance = await ApiService.getCredits(currentWorkspace.id);
        setCreditBalance(balance);
      } catch (err) {
        console.error('Failed to load credit balance:', err);
        // Don't set error state here - credits are non-critical for initial load
      } finally {
        setIsLoadingCredits(false);
      }
    };

    loadCredits();
  }, [currentWorkspace]);

  const handleSetCurrentProject = useCallback((project: Project) => {
    setCurrentProject(project);
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await ApiService.deleteProject(projectId);

      // Remove from projects list
      setProjects(prev => prev.filter(p => p.id !== projectId));

      // If deleted project was current project, clear it
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
      }
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }, [currentProject]);

  const handleRefreshProjects = useCallback(async () => {
    if (!currentWorkspace) return;

    try {
      const { projects } = await ApiService.getProjects(currentWorkspace.id);
      setProjects(projects);
    } catch (err) {
      console.error('Failed to refresh projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh projects');
    }
  }, [currentWorkspace]);

  const handleRefreshCredits = useCallback(async () => {
    if (!currentWorkspace) return;

    try {
      setIsLoadingCredits(true);
      const balance = await ApiService.getCredits(currentWorkspace.id);
      setCreditBalance(balance);
    } catch (err) {
      console.error('Failed to refresh credit balance:', err);
    } finally {
      setIsLoadingCredits(false);
    }
  }, [currentWorkspace]);

  const value: ProjectContextType = {
    workspaces,
    currentWorkspace,
    projects,
    currentProject,
    creditBalance,
    isLoadingCredits,
    setCurrentProject: handleSetCurrentProject,
    deleteProject: handleDeleteProject,
    refreshProjects: handleRefreshProjects,
    refreshCredits: handleRefreshCredits,
    loading,
    error,
  };

  // Show loading screen while loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};