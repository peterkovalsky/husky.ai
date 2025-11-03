import { useState } from 'react'
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Alert
} from '@heroui/react'
import { Loader2 } from 'lucide-react'

interface DeleteProjectDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  projectName: string
  projectId: string
  publishedStatus?: string
  onConfirm: (projectId: string) => Promise<void>
}

export const DeleteProjectDialog = ({
  isOpen,
  onOpenChange,
  projectName,
  projectId,
  publishedStatus,
  onConfirm
}: DeleteProjectDialogProps) => {
  const [confirmName, setConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = confirmName === projectName
  const isPublished = publishedStatus === 'PUBLISHED'
  
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
              <Alert
                color="danger"
                variant="flat"
                title="This will permanently delete your project"
                description={
                  <>
                    <strong>{projectName}</strong> and all associated data will be permanently deleted, including app versions and builds.
                    {isPublished && (
                      <> Your website will be unpublished and no longer accessible.</>
                    )}
                    {' '}This action cannot be undone.
                  </>
                }
              />

              <div className="space-y-3">
                <Input
                  type="text"
                  label={<span>Type <span className="font-semibold">{projectName}</span> to confirm:</span>}
                  value={confirmName}
                  onValueChange={setConfirmName}
                  placeholder={projectName}
                  variant="bordered"
                  autoComplete="off"
                  isDisabled={isDeleting}
                />
              </div>

              {error && (
                <Alert
                  color="danger"
                  variant="bordered"
                  title="Error"
                  description={error}
                />
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