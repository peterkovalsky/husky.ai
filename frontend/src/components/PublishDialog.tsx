import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Card, CardBody, Divider, Code, Chip } from '@heroui/react'
import { ApiService, PublishingStatus, type PublishStatusResponse } from '../services/api'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Globe, Calendar, Package, Rocket } from 'lucide-react'
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
              <Card shadow="none" className="bg-gray-50 border border-gray-200">
                <CardBody className="gap-2 p-4">
                  <div className="text-xs text-default-600">
                    Your project will be published to:
                  </div>
                  <div className="flex items-center gap-2">
                    <Code size="sm" className="text-xs bg-husky-50 text-husky-700">
                      https://{publishStatus.subdomain}.{publishStatus.publishDomain}
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
              publishedVersion={publishStatus?.publishedVersion}
            />
          </div>
        )
      case PublishingStatus.PUBLISHING:
        return (
          <Card shadow="none" className="bg-gradient-to-r from-husky-50 to-cyan-50 border border-husky-200">
            <CardBody className="flex flex-row items-center justify-center gap-3 py-6">
              <div className="w-10 h-10 rounded-full status-processing flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
              <span className="text-sm text-default-700 font-medium">Publishing your project...</span>
            </CardBody>
          </Card>
        )
      case PublishingStatus.PUBLISHED:
        return (
          <div className="space-y-4">
            <Card shadow="none" className="bg-success-50 border border-success-200">
              <CardBody className="gap-3 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg status-ready flex items-center justify-center">
                    <Globe className="h-4 w-4 text-white" />
                  </div>
                  <a
                    href={publishStatus.publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-husky-600 hover:text-husky-700 font-medium hover:underline break-all"
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
                        <Chip className="status-queued text-white border-0" size="sm">
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
              publishedVersion={publishStatus?.publishedVersion}
            />
          </div>
        )
      case PublishingStatus.FAILED:
        return (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl status-failed flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="font-semibold text-red-700 mb-1">Publishing failed</h4>
                <p className="text-sm text-red-600/80">
                  {publishStatus.error || "An error occurred while publishing your project. Please try again."}
                </p>
              </div>
            </div>
          </div>
        )
      case PublishingStatus.UNPUBLISHING:
        return (
          <Card shadow="none" className="bg-default-50 border border-default-200">
            <CardBody className="flex flex-row items-center justify-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-default-500" />
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
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="md"
        classNames={{
          base: "bg-white shadow-xl",
          header: "border-b border-gray-100",
          footer: "border-t border-gray-100",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">
                <div className="flex items-center justify-between pr-8">
                  <div className="flex items-center gap-3">
                    <Rocket className="w-6 h-6 text-husky-500" />
                    <h3 className="text-lg font-semibold">Publish Website</h3>
                  </div>
                  <Chip
                    className={publishStatus?.status === PublishingStatus.PUBLISHED ? 'status-ready text-white border-0' : 'bg-default-100'}
                    size="sm"
                  >
                    {publishStatus?.status === PublishingStatus.PUBLISHED ? 'Published' : 'Not Published'}
                  </Chip>
                </div>
                <p className="text-xs font-normal text-default-500 pl-13">
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
      <Modal
        isOpen={showUnpublishConfirm}
        onOpenChange={setShowUnpublishConfirm}
        size="sm"
        classNames={{
          base: "bg-white shadow-xl",
        }}
      >
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
