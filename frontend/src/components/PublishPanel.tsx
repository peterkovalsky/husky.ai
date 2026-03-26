import { Button, Accordion, AccordionItem, Spinner } from '@heroui/react'
import { ApiService, PublishingStatus, type PublishStatusResponse } from '../services/api'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Globe, ArrowUpRight, AlertTriangle, RefreshCw } from 'lucide-react'
import { CustomDomainSection } from './CustomDomainSection'

interface PublishPanelProps {
  projectId: string
  isVisible: boolean
  onSuccess?: () => void
}

export const PublishPanel = ({ projectId, isVisible, onSuccess }: PublishPanelProps) => {
  const [publishStatus, setPublishStatus] = useState<PublishStatusResponse | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isUnpublishing, setIsUnpublishing] = useState(false)
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false)
  const pollCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (isVisible) {
      loadPublishStatus()
    }
  }, [isVisible, projectId])

  useEffect(() => {
    return () => {
      if (pollCleanupRef.current) {
        pollCleanupRef.current()
        pollCleanupRef.current = null
      }
    }
  }, [])

  const loadPublishStatus = async () => {
    try {
      const status = await ApiService.getPublishStatus(projectId)
      setPublishStatus(status)
    } catch (err) {
      console.error('[PublishPanel] Failed to load publish status:', err)
    }
  }

  const handlePublish = async () => {
    setIsPublishing(true)

    try {
      await ApiService.publishProject(projectId)

      const cleanup = await ApiService.pollPublishStatus(
        projectId,
        (status) => {
          setPublishStatus(status)
          if (status.status === PublishingStatus.PUBLISHED) {
            onSuccess?.()
          }
        },
        (err) => {
          console.error('[PublishPanel] Publish polling error:', err)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (err) {
      console.error('[PublishPanel] Failed to initiate publishing:', err)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setIsUnpublishing(true)

    try {
      await ApiService.unpublishProject(projectId)

      const cleanup = await ApiService.pollPublishStatus(
        projectId,
        (status) => {
          setPublishStatus(status)
          if (status.status === PublishingStatus.UNPUBLISHED) {
            onSuccess?.()
          }
        },
        (err) => {
          console.error('[PublishPanel] Unpublish polling error:', err)
        }
      )

      pollCleanupRef.current = cleanup
    } catch (err) {
      console.error('[PublishPanel] Failed to initiate unpublishing:', err)
    } finally {
      setIsUnpublishing(false)
    }
  }

  const isPublished = publishStatus?.status === PublishingStatus.PUBLISHED
  const isProcessing = publishStatus?.status === PublishingStatus.PUBLISHING || publishStatus?.status === PublishingStatus.UNPUBLISHING
  const hasUpdate = isPublished && publishStatus?.publishedVersion !== undefined && publishStatus.currentVersion > publishStatus.publishedVersion

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-[13px] font-semibold text-default-500 uppercase tracking-wider">Publish</h2>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">

        {/* ── Processing states ── */}
        {publishStatus?.status === PublishingStatus.PUBLISHING && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Spinner size="lg" color="primary" />
            <p className="text-sm text-default-500 font-medium">Publishing...</p>
          </div>
        )}

        {publishStatus?.status === PublishingStatus.UNPUBLISHING && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-default-400" />
            <p className="text-sm text-default-500">Unpublishing...</p>
          </div>
        )}

        {/* ── Failed state ── */}
        {publishStatus?.status === PublishingStatus.FAILED && (
          <div className="rounded-xl bg-danger-50/50 border border-danger-100 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" />
              <span className="text-sm font-medium text-danger">Publishing failed</span>
            </div>
            <p className="text-xs text-danger-600/70 leading-relaxed">
              {publishStatus.error || 'Something went wrong. Please try again.'}
            </p>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              onPress={handlePublish}
              isLoading={isPublishing}
              startContent={!isPublishing ? <RefreshCw className="w-3.5 h-3.5" /> : undefined}
            >
              Retry
            </Button>
          </div>
        )}

        {/* ── Published state ── */}
        {isPublished && (
          <div className="space-y-4">
            {/* Live indicator + URL */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-medium text-emerald-600">Live</span>
                {publishStatus?.publishedAt && (
                  <>
                    <span className="text-default-300">·</span>
                    <span className="text-xs text-default-400">{formatRelativeTime(publishStatus.publishedAt)}</span>
                  </>
                )}
              </div>

              <a
                href={publishStatus.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between rounded-xl border border-default-200 hover:border-primary/30 bg-default-50 hover:bg-primary-50/30 px-3.5 py-3 transition-all duration-150"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-default-400 group-hover:text-primary flex-shrink-0" />
                  <span className="text-sm text-default-700 group-hover:text-primary truncate">
                    {publishStatus.publishedUrl}
                  </span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-default-300 group-hover:text-primary flex-shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </div>

            {/* Pending changes indicator */}
            {hasUpdate && (
              <div className="rounded-xl border border-warning-200 bg-warning-50/50 px-3.5 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-warning-100 flex items-center justify-center">
                      <ArrowUpRight className="w-3 h-3 text-warning-600" />
                    </div>
                    <span className="text-xs font-medium text-warning-700">
                      {publishStatus.currentVersion - publishStatus.publishedVersion!} unpublished {publishStatus.currentVersion - publishStatus.publishedVersion! === 1 ? 'change' : 'changes'}
                    </span>
                  </div>
                </div>
                <Button
                  color="warning"
                  onPress={handlePublish}
                  isLoading={isPublishing}
                  isDisabled={isProcessing}
                  fullWidth
                  radius="lg"
                  className="text-warning-800 font-medium"
                >
                  Publish changes
                </Button>
              </div>
            )}


            {/* Unpublish */}
            {!showUnpublishConfirm ? (
              <Button
                variant="bordered"
                onPress={() => setShowUnpublishConfirm(true)}
                isDisabled={isProcessing}
                fullWidth
                radius="lg"
                className="border-default-300 text-default-500 hover:border-danger hover:text-danger hover:bg-danger-50 transition-colors"
              >
                Unpublish
              </Button>
            ) : (
              <div className="rounded-xl border border-danger-100 bg-danger-50/30 p-3 space-y-2.5">
                <p className="text-xs text-default-600 leading-relaxed">
                  This will take your website offline. You can republish anytime.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => setShowUnpublishConfirm(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    color="danger"
                    onPress={handleUnpublish}
                    isLoading={isUnpublishing}
                    className="flex-1"
                  >
                    Unpublish
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Unpublished state ── */}
        {publishStatus?.status === PublishingStatus.UNPUBLISHED && (
          <div className="space-y-4">
            {/* Preview URL */}
            {publishStatus.subdomain && (
              <div className="rounded-xl border border-dashed border-default-200 bg-default-50/50 px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-default-300 flex-shrink-0" />
                  <span className="text-sm text-default-400 truncate">
                    https://{publishStatus.subdomain}.{publishStatus.publishDomain}
                  </span>
                </div>
              </div>
            )}

            <Button
              color="primary"
              onPress={handlePublish}
              isLoading={isPublishing}
              isDisabled={isProcessing}
              fullWidth
              radius="lg"
              size="lg"
            >
              Publish
            </Button>
          </div>
        )}

        {/* ── Custom Domain — collapsed by default ── */}
        {publishStatus && !isProcessing && (
          <Accordion variant="light" className="-mx-2">
            <AccordionItem
              key="custom-domain"
              aria-label="Custom Domain"
              title={
                <span className="text-xs font-medium text-default-500">Custom domain</span>
              }
              classNames={{
                content: 'px-0 pb-0',
                trigger: 'py-2',
              }}
            >
              <CustomDomainSection
                projectId={projectId}
                customDomain={publishStatus?.customDomain}
                onUpdate={loadPublishStatus}
                compact
              />
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  )
}
