import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react'
import { ApiService, type PublishStatusResponse } from '../services/api'
import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Loader2, XCircle, Globe, Copy, ExternalLink } from 'lucide-react'

interface PublishDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  projectModifiedAt: string
  onSuccess?: () => void
}

export const PublishDialog = ({ isOpen, onOpenChange, projectId, projectName, projectModifiedAt, onSuccess }: PublishDialogProps) => {
  const [publishStatus, setPublishStatus] = useState<PublishStatusResponse | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isOpen) {
      console.log('[PublishDialog] Dialog opened, loading publish status for project:', projectId)
      // Fetch initial publish status when dialog opens
      loadPublishStatus()
    }

    return () => {
      // Cleanup polling when dialog closes
      if (pollCleanupRef.current) {
        console.log('[PublishDialog] Cleaning up polling')
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }
    }
  }, [isOpen, projectId])

  const loadPublishStatus = async () => {
    try {
      console.log('[PublishDialog] Fetching publish status for project:', projectId)
      const status = await ApiService.getPublishStatus(projectId)
      console.log('[PublishDialog] Publish status loaded:', status)
      setPublishStatus(status)
    } catch (err) {
      console.error('[PublishDialog] Failed to load publish status:', err)
      setError(err instanceof Error ? err.message : 'Failed to load publish status')
    }
  }

  const handlePublish = async () => {
    setIsInitiating(true)
    setError(null)

    try {
      await ApiService.publishProject(projectId)

      // Start polling for status updates
      const cleanup = await ApiService.pollPublishStatus(
        projectId,
        (status) => {
          setPublishStatus(status)

          if (status.status === 'PUBLISHED') {
            if (onSuccess) {
              onSuccess()
            }
          }
        },
        (err) => {
          setError(err.message)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate publishing')
    } finally {
      setIsInitiating(false)
    }
  }

  const handleRetry = async () => {
    setError(null)
    await handlePublish()
  }

  const handleCopyUrl = () => {
    if (publishStatus?.publishedUrl) {
      navigator.clipboard.writeText(publishStatus.publishedUrl)
    }
  }

  const handleOpenUrl = () => {
    if (publishStatus?.publishedUrl) {
      window.open(publishStatus.publishedUrl, '_blank')
    }
  }

  const getStatusDisplay = () => {
    if (!publishStatus) return null

    switch (publishStatus.status) {
      case 'UNPUBLISHED':
        return (
          <div className="text-center text-default-500 my-4">
            This project has not been published yet.
          </div>
        )
      case 'PUBLISHING':
        return (
          <div className="flex items-center justify-center gap-3 my-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-default-700">Publishing your project...</span>
          </div>
        )
      case 'PUBLISHED':
        return (
          <div className="my-6 space-y-4">
            <div className="flex items-center justify-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Project published successfully!</span>
            </div>
            <div className="bg-default-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-default-600">
                <Globe className="h-4 w-4" />
                <span>Published URL:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-default-200 px-3 py-2 rounded text-sm">
                  {publishStatus.publishedUrl}
                </code>
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  onPress={handleCopyUrl}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  isIconOnly
                  size="sm"
                  variant="flat"
                  onPress={handleOpenUrl}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )
      case 'FAILED':
        return (
          <div className="my-6 space-y-3">
            <div className="flex items-center justify-center gap-2 text-danger">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Publishing failed</span>
            </div>
            {publishStatus.error && (
              <div className="bg-danger-50 border border-danger-200 rounded-lg p-3">
                <p className="text-sm text-danger-700">{publishStatus.error}</p>
              </div>
            )}
          </div>
        )
      case 'UNPUBLISHING':
        return (
          <div className="flex items-center justify-center gap-3 my-6">
            <Loader2 className="h-5 w-5 animate-spin text-default-500" />
            <span className="text-default-700">Unpublishing your project...</span>
          </div>
        )
      default:
        return null
    }
  }

  const canPublish = publishStatus?.status === 'UNPUBLISHED' || publishStatus?.status === 'FAILED'
  const isProcessing = publishStatus?.status === 'PUBLISHING' || publishStatus?.status === 'UNPUBLISHING'

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h3 className="text-xl font-semibold">Publish Project</h3>
              <p className="text-sm font-normal text-default-500">{projectName}</p>
            </ModalHeader>
            <ModalBody>
              {publishStatus?.subdomain && (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-4">
                  <div className="text-sm font-medium text-primary-700 mb-1">Your project will be available at:</div>
                  <code className="text-sm text-primary-900">
                    {publishStatus.subdomain}.{import.meta.env.VITE_PUBLISH_DOMAIN || 'huskystudio.ai'}
                  </code>
                </div>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-default-500">Last project update:</span>
                  <span className="text-default-700">{new Date(projectModifiedAt).toLocaleString()}</span>
                </div>
                {publishStatus?.publishedAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-default-500">Last published:</span>
                    <span className="text-default-700">{new Date(publishStatus.publishedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {getStatusDisplay()}

              {error && (
                <div className="bg-danger-50 border border-danger-200 rounded-lg p-3">
                  <p className="text-sm text-danger-700">{error}</p>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="light"
                onPress={onClose}
                isDisabled={isProcessing}
              >
                Close
              </Button>
              {canPublish && (
                <Button
                  color="primary"
                  onPress={publishStatus?.status === 'FAILED' ? handleRetry : handlePublish}
                  isLoading={isInitiating}
                  isDisabled={isProcessing}
                >
                  {publishStatus?.status === 'FAILED' ? 'Retry' : 'Publish'}
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
