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
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react'

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
        base: "glass-card border-white/30",
        header: "border-b border-white/20",
        footer: "border-t border-white/20",
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
              <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-200 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl status-failed flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-red-700 mb-1">This will permanently delete your project</h4>
                    <p className="text-sm text-red-600/80">
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
                  label={<span>Type <span className="font-semibold text-red-600">{projectName}</span> to confirm:</span>}
                  value={confirmName}
                  onValueChange={setConfirmName}
                  placeholder={projectName}
                  autoComplete="off"
                  isDisabled={isDeleting}
                  classNames={{
                    inputWrapper: [
                      'bg-white/50',
                      'backdrop-blur-sm',
                      'border-white/50',
                      'hover:bg-white/70',
                      'group-data-[focus=true]:bg-white/70',
                      'group-data-[focus=true]:border-red-400',
                    ].join(' '),
                  }}
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
                className="bg-gradient-failed text-white"
                onPress={handleConfirm}
                isDisabled={!isValid || isDeleting}
                size="sm"
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