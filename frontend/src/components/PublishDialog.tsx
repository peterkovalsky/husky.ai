import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Card, CardBody, Divider, Code, Alert, Chip } from '@heroui/react'
import { ApiService, PublishingStatus, type PublishStatusResponse } from '../services/api'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Globe, Calendar, Package } from 'lucide-react'
import { CustomDomainSection } from './CustomDomainSection'

interface PublishDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onSuccess?: () => void
}

export const PublishDialog = ({ isOpen, onOpenChange, projectId, onSuccess }: PublishDialogProps) => {
  const [publishStatus, setPublishStatus] = useState<PublishStatusResponse | null>(null)
  const [isInitiating, setIsInitiating] = useState(false)
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false)
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
    }
  }

  const handlePublish = async () => {
    setIsInitiating(true)

    try {
      await ApiService.publishProject(projectId)

      // Start polling for status updates
      const cleanup = await ApiService.pollPublishStatus(
        projectId,
        (status) => {
          setPublishStatus(status)

          if (status.status === PublishingStatus.PUBLISHED) {
            if (onSuccess) {
              onSuccess()
            }
          }
        },
        (err) => {
          console.error('Publish polling error:', err)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (err) {
      console.error('Failed to initiate publishing:', err)
    } finally {
      setIsInitiating(false)
    }
  }

  const handleUnpublish = async () => {
    setShowUnpublishConfirm(false)
    setIsInitiating(true)

    try {
      await ApiService.unpublishProject(projectId)

      // Start polling for status updates
      const cleanup = await ApiService.pollPublishStatus(
        projectId,
        (status) => {
          setPublishStatus(status)

          if (status.status === PublishingStatus.UNPUBLISHED) {
            if (onSuccess) {
              onSuccess()
            }
          }
        },
        (err) => {
          console.error('Unpublish polling error:', err)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (err) {
      console.error('Failed to initiate unpublishing:', err)
    } finally {
      setIsInitiating(false)
    }
  }

  const handleRetry = async () => {
    await handlePublish()
  }

  const getStatusDisplay = () => {
    if (!publishStatus) return null

    switch (publishStatus.status) {
      case PublishingStatus.UNPUBLISHED:
        return (
          <div className="space-y-4">
            {publishStatus?.subdomain && (
              <Card shadow="none" className="bg-default-50">
                <CardBody className="gap-2 p-3">
                  <div className="text-xs text-default-600">
                    Your project will be published to:
                  </div>
                  <div className="flex items-center gap-2">         
                    <Code size="sm" className="text-xs">
                      https://{publishStatus.subdomain}.{import.meta.env.VITE_PUBLISH_DOMAIN || 'huskystudio.ai'}
                    </Code>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Custom Domain Section */}
            <CustomDomainSection
              projectId={projectId}
              customDomain={publishStatus?.customDomain}
              onUpdate={loadPublishStatus}
            />
          </div>
        )
      case PublishingStatus.PUBLISHING:
        return (
          <Card shadow="none" className="bg-primary-50 border border-primary-200">
            <CardBody className="flex flex-row items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-default-700">Publishing your project...</span>
            </CardBody>
          </Card>
        )
      case PublishingStatus.PUBLISHED:
        return (
          <div className="space-y-4">
            <Card shadow="none" className="bg-default-100">
              <CardBody className="gap-2 p-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-default-600" />
                  <a
                    href={publishStatus.publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline break-all"
                  >
                    {publishStatus.publishedUrl}
                  </a>
                </div>
                {publishStatus?.publishedVersion !== undefined && (
                  <>
                    <Divider className="my-1" />
                    <div className="flex items-center gap-2 text-xs text-default-600">
                      <Package className="h-3.5 w-3.5" />
                      <span>Version {publishStatus.publishedVersion}</span>
                      {publishStatus.currentVersion > publishStatus.publishedVersion && (
                        <Chip color="warning" variant="flat" size="sm">
                          Update available (v{publishStatus.currentVersion})
                        </Chip>
                      )}
                    </div>
                  </>
                )}
                {publishStatus?.publishedAt && (
                  <>
                    <Divider className="my-1" />
                    <div className="flex items-center gap-2 text-xs text-default-600">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        Published {new Date(publishStatus.publishedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })} at {new Date(publishStatus.publishedAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </span>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>

            {/* Custom Domain Section */}
            <CustomDomainSection
              projectId={projectId}
              customDomain={publishStatus?.customDomain}
              onUpdate={loadPublishStatus}
            />
          </div>
        )
      case PublishingStatus.FAILED:
        return (
          <Alert
            color="danger"
            variant="flat"
            title="Publishing failed"
            description={publishStatus.error || "An error occurred while publishing your project. Please try again."}
            classNames={{
              title: "text-sm",
              description: "text-xs"
            }}
          />
        )
      case PublishingStatus.UNPUBLISHING:
        return (
          <Card shadow="none" className="bg-default-50 border border-default-200">
            <CardBody className="flex flex-row items-center justify-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-default-500" />
              <span className="text-sm text-default-700">Unpublishing your project...</span>
            </CardBody>
          </Card>
        )
      default:
        return null
    }
  }

  const canPublish = publishStatus?.status === PublishingStatus.UNPUBLISHED || publishStatus?.status === PublishingStatus.FAILED
  const canRepublish = publishStatus?.status === PublishingStatus.PUBLISHED
  const canUnpublish = publishStatus?.status === PublishingStatus.PUBLISHED
  const isProcessing = publishStatus?.status === PublishingStatus.PUBLISHING || publishStatus?.status === PublishingStatus.UNPUBLISHING

  const getSubtitle = () => {
    if (publishStatus?.status === PublishingStatus.UNPUBLISHED || publishStatus?.status === PublishingStatus.FAILED) {
      return 'Your app will be available to the public via the URL below once published.'
    }

    if (publishStatus?.status === PublishingStatus.PUBLISHED) {
      return 'Republishing will update your live website with the latest changes.'
    }

    return ''
  }

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div className="flex items-center justify-between pr-8">
                  <h3 className="text-lg font-semibold">Publish Website</h3>
                  <Chip
                    color={publishStatus?.status === PublishingStatus.PUBLISHED ? 'success' : 'default'}
                    variant="flat"
                    size="sm"
                  >
                    {publishStatus?.status === PublishingStatus.PUBLISHED ? 'Published' : 'Not Published'}
                  </Chip>
                </div>
                <p className="text-xs font-normal text-default-500">
                  {getSubtitle()}
                </p>
              </ModalHeader>
              <ModalBody className="gap-4 py-4">
                {getStatusDisplay()}
              </ModalBody>
              <ModalFooter className="pt-2 flex justify-between">
                <div>
                  {canUnpublish && (
                    <Button
                      variant="light"
                      color="danger"
                      onPress={() => setShowUnpublishConfirm(true)}
                      isDisabled={isProcessing}
                      size="sm"
                    >
                      Unpublish
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="light"
                    onPress={onClose}
                    isDisabled={isProcessing}
                    size="sm"
                  >
                    Close
                  </Button>
                  {(canPublish || canRepublish) && (
                    <Button
                      color="primary"
                      onPress={publishStatus?.status === PublishingStatus.FAILED ? handleRetry : handlePublish}
                      isLoading={isInitiating}
                      isDisabled={isProcessing}
                      size="sm"
                    >
                      {canRepublish ? 'Republish' : (publishStatus?.status === PublishingStatus.FAILED ? 'Retry' : 'Publish')}
                    </Button>
                  )}
                </div>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Unpublish Confirmation Dialog */}
      <Modal isOpen={showUnpublishConfirm} onOpenChange={setShowUnpublishConfirm} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <h3 className="text-lg font-semibold">Unpublish Website</h3>
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  This will take your website offline and remove it from public access. Your project files will remain safe, and you can republish anytime.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleUnpublish}
                  isLoading={isInitiating}
                  size="sm"
                >
                  Unpublish
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  )
}
