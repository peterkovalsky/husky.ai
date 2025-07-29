import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import { Plus, Loader2 } from 'lucide-react'
import { ApiService } from '../services/api'
import { useNavigate } from 'react-router-dom'

interface CreateProjectDialogProps {
  trigger?: React.ReactNode
  onProjectCreated?: (projectId: string) => void
}

export const CreateProjectDialog = ({ trigger, onProjectCreated }: CreateProjectDialogProps) => {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const project = await ApiService.createProject({
        name: name.trim(),
        description: description.trim() || undefined
      })

      // Close dialog and reset form
      setOpen(false)
      setName('')
      setDescription('')
      
      // Navigate to the new project
      navigate(`/project/${project.id}`)
      
      // Optional callback
      onProjectCreated?.(project.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen)
      if (!newOpen) {
        resetForm()
      }
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0">
        <DialogHeader className="px-6 py-6 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 bg-gradient-to-r from-primary to-primary/80 rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary-foreground" />
            </div>
            Create New Project
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          <div className="space-y-3">
            <Label htmlFor="project-name" className="text-sm font-semibold">
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="project-name"
              placeholder="My Awesome App"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
              className="h-11 text-base border-1"
            />
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="project-description" className="text-sm font-semibold">
              Description <span className="text-muted-foreground text-sm font-normal">(optional)</span>
            </Label>
            <Textarea
              id="project-description"
              placeholder="Describe what your app will do..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCreating}
              className="min-h-[110px] resize-none text-base border-1"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-destructive flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-destructive-foreground text-xs font-bold">!</span>
                </div>
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isCreating}
              className="flex-1 h-11"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!name.trim() || isCreating}
              className="flex-1 h-11 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}