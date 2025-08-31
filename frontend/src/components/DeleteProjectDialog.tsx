import { useState } from 'react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input
} from '@heroui/react'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface DeleteProjectDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  projectId: string
  onConfirm: (projectId: string) => Promise<void>
}

export const DeleteProjectDialog = ({ 
  isOpen, 
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
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="pb-6">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Delete Project
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  This action cannot be undone
                </p>
              </div>
            </ModalHeader>

            <ModalBody className="space-y-6">
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
                <Input
                  label={<span>Type <span className="font-semibold">{projectName}</span> to confirm:</span>}
                  value={confirmName}
                  onValueChange={setConfirmName}
                  placeholder={projectName}
                  autoComplete="off"
                  isDisabled={isDeleting}
                  size="lg"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                </div>
              )}
            </ModalBody>

            <ModalFooter className="gap-3">
              <Button
                variant="bordered"
                onPress={handleCancel}
                isDisabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onPress={handleConfirm}
                isDisabled={!isValid || isDeleting}
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
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}