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
import { AlertTriangle, Trash2 } from 'lucide-react'

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
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      classNames={{
        base: "bg-white shadow-xl",
        header: "border-b border-gray-100",
        footer: "border-t border-gray-100",
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl status-failed flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-white" />
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold">
                    Delete Project
                  </h2>
                  <p className="text-xs text-default-500 font-normal">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </ModalHeader>

            <ModalBody className="space-y-5 py-4">
              <div className="p-4 rounded-xl bg-danger-50 border border-danger-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-danger flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-danger mb-1">This will permanently delete your project</h4>
                    <p className="text-sm text-danger-600">
                      <strong>{projectName}</strong> and all associated data will be permanently deleted, including app versions and builds.
                      {isPublished && (
                        <> Your website will be unpublished and no longer accessible.</>
                      )}
                      {' '}This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  type="text"
                  label={<span>Type <span className="font-semibold text-danger">{projectName}</span> to confirm:</span>}
                  value={confirmName}
                  onValueChange={setConfirmName}
                  placeholder={projectName}
                  autoComplete="off"
                  isDisabled={isDeleting}
                  variant="bordered"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}
            </ModalBody>

            <ModalFooter className="gap-3 pt-2">
              <Button
                variant="light"
                onPress={handleCancel}
                isDisabled={isDeleting}
                size="sm"
              >
                Cancel
              </Button>
              <Button
                color="danger"
                onPress={handleConfirm}
                isDisabled={!isValid || isDeleting}
                isLoading={isDeleting}
                size="sm"
              >
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}