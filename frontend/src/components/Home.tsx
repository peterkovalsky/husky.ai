import { useProject } from '../contexts/ProjectContext'
import { useAuth } from '../hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu'
import { CreateProjectDialog } from './CreateProjectDialog'
import { DeleteProjectDialog } from './DeleteProjectDialog'
import { Code2, Calendar, FolderOpen, Plus, MoreVertical, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export const Home = () => {
  const { projects, loading, deleteProject } = useProject()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<{ id: string; name: string } | null>(null)

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleDeleteProject = (project: { id: string; name: string }, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent card click
    setSelectedProject(project)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteProject = async (projectId: string) => {
    if (deleteProject) {
      await deleteProject(projectId)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-primary to-primary/80 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-primary-foreground animate-pulse" />
          </div>
          <p className="text-muted-foreground">Loading projects...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <img 
                src="/husky-logo-black-32x32.png" 
                alt="Husky AI Logo" 
                className="w-8 h-8 object-contain"
              />
              <h1 className="text-2xl font-bold">Husky AI</h1>
            </div>
            
            {/* User Menu Dropdown */}
            <div className="hs-dropdown relative inline-flex">
              <button 
                id="hs-dropdown-with-header" 
                type="button" 
                className="hs-dropdown-toggle w-8 h-8 inline-flex justify-center items-center gap-x-2 text-sm font-semibold rounded-full border border-transparent hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                aria-haspopup="menu" 
                aria-expanded="false" 
                aria-label="Dropdown"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </button>

              <div className="hs-dropdown-menu transition-[opacity,margin] duration hs-dropdown-open:opacity-100 opacity-0 hidden min-w-60 bg-popover shadow-md rounded-lg p-2 mt-2 after:h-4 after:absolute after:-top-4 after:start-0 after:w-full before:h-4 before:absolute before:-top-4 before:start-0 before:w-full" 
                   role="menu" 
                   aria-orientation="vertical" 
                   aria-labelledby="hs-dropdown-with-header">
                <div className="py-3 px-5 -m-2 bg-muted rounded-t-lg">
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="text-sm font-medium truncate">
                    {user?.user_metadata?.display_name || user?.email}
                  </p>
                </div>
                <div className="mt-2 py-2 first:pt-0 last:pb-0">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-x-3.5 py-2 px-3 rounded-lg text-sm hover:bg-accent focus:outline-none focus:bg-accent w-full text-left"
                  >
                    <svg className="size-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16,17 21,12 16,7"/>
                      <line x1="21" x2="9" y1="12" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Projects</h2>
            <p className="text-muted-foreground">Select a project to continue building your app</p>
          </div>
          {projects.length > 0 && (
            <CreateProjectDialog 
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </Button>
              }
            />
          )}
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-6">Create your first project to get started</p>
            <CreateProjectDialog 
              trigger={
                <Button size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Project
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 bg-gradient-to-r from-primary to-primary/80 rounded-lg flex items-center justify-center mb-3">
                      <Code2 className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => handleDeleteProject(project, e)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="mr-2 h-4 w-4" />
                      Created {formatDate(project.created_at)}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Last modified {formatDate(project.modified_at)}
                      </span>
                      <Button size="sm" variant="ghost">
                        Open →
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Project Dialog */}
      {selectedProject && (
        <DeleteProjectDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          projectName={selectedProject.name}
          projectId={selectedProject.id}
          onConfirm={confirmDeleteProject}
        />
      )}

      {/* Chat Widget */}
    </div>
  )
}