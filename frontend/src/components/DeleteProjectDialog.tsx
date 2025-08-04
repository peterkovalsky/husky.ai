import { useState } from 'react'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from './ui/alert'

interface DeleteProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  projectId: string
  onConfirm: (projectId: string) => Promise<void>
}

export const DeleteProjectDialog = ({ 
  open, 
  onOpenChange, 
  projectName, 
  projectId, 
  onConfirm 
}: DeleteProjectDialogProps) => {
  const [confirmName, setConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = confirmName === projectName
  
  const handleConfirm = async () => {
    if (!isValid) return

    setIsDeleting(true)
    setError(null)

    try {
      await onConfirm(projectId)
      onOpenChange(false)
      setConfirmName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
    setConfirmName('')
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pb-6">
          <div className="space-y-1">
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Delete Project
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              This action cannot be undone
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                  This will permanently delete
                </p>
                <p className="text-sm text-red-800 dark:text-red-200">
                  <span className="font-semibold text-red-900 dark:text-red-100">{projectName}</span>
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  and all associated data, including app versions, previews, and prompts. This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="confirm-name" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Type <span className="font-semibold">{projectName}</span> to confirm:
            </Label>
            <Input
              id="confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={projectName}
              autoComplete="off"
              disabled={isDeleting}
              className="text-base py-3"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="pt-6 gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isDeleting}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isDeleting}
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}