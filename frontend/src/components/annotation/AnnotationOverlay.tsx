import { useState, useEffect, useCallback, useRef } from 'react'
import { useAnnotationCanvas } from '../../hooks/useAnnotationCanvas'
import { AnnotationToolbar } from './AnnotationToolbar'

interface AnnotationOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onComplete: (blob: Blob) => void
  onCancel: () => void
}

const SCREENSHOT_TIMEOUT_MS = 3000

export const AnnotationOverlay = ({ iframeRef, onComplete, onCancel }: AnnotationOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null)
  const [screenshotFailed, setScreenshotFailed] = useState(false)
  const screenshotReceivedRef = useRef(false)
  const [isExporting, setIsExporting] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const dpr = window.devicePixelRatio || 1

  // Measure container on mount and resize
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setCanvasSize({ width: rect.width, height: rect.height })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const {
    canvasRef,
    tool,
    setTool,
    strokes,
    redoStack,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    undo,
    redo,
    exportAsBlob,
  } = useAnnotationCanvas({
    backgroundImage,
    canvasWidth: canvasSize.width * dpr,
    canvasHeight: canvasSize.height * dpr,
  })

  // Request screenshot from iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current
    console.log('[Annotation] iframe ref:', iframe)
    console.log('[Annotation] iframe src:', iframe?.src)
    console.log('[Annotation] iframe contentWindow:', iframe?.contentWindow)

    if (!iframe?.contentWindow) {
      console.warn('[Annotation] No iframe contentWindow - cannot request screenshot')
      setScreenshotFailed(true)
      return
    }

    const handleMessage = (event: MessageEvent) => {
      console.log('[Annotation] Received postMessage:', event.data?.type, 'from origin:', event.origin)

      if (event.data?.type !== 'SCREENSHOT_RESULT') return

      screenshotReceivedRef.current = true
      clearTimeout(fallbackTimeout)

      if (event.data.dataUrl) {
        console.log('[Annotation] Screenshot received, dataUrl length:', event.data.dataUrl.length)
        const img = new Image()
        img.onload = () => {
          console.log('[Annotation] Background image loaded:', img.width, 'x', img.height)
          setBackgroundImage(img)
        }
        img.onerror = () => {
          console.error('[Annotation] Failed to load screenshot image')
          setScreenshotFailed(true)
        }
        img.src = event.data.dataUrl
      } else {
        console.warn('[Annotation] Screenshot result had no dataUrl, error:', event.data.error)
        setScreenshotFailed(true)
      }
    }

    window.addEventListener('message', handleMessage)

    // Send capture request
    try {
      console.log('[Annotation] Sending CAPTURE_SCREENSHOT postMessage to iframe...')
      iframe.contentWindow.postMessage({ type: 'CAPTURE_SCREENSHOT' }, '*')
      console.log('[Annotation] postMessage sent. Waiting for response (timeout:', SCREENSHOT_TIMEOUT_MS, 'ms)')
    } catch (err) {
      console.error('[Annotation] Failed to send postMessage:', err)
      setScreenshotFailed(true)
    }

    // Timeout fallback - use ref to check if screenshot arrived
    const fallbackTimeout = setTimeout(() => {
      if (!screenshotReceivedRef.current) {
        console.warn('[Annotation] Screenshot timeout - no response from iframe after', SCREENSHOT_TIMEOUT_MS, 'ms. The preview may not have the screenshot helper script (needs a rebuild).')
        setScreenshotFailed(true)
      }
    }, SCREENSHOT_TIMEOUT_MS)

    return () => {
      window.removeEventListener('message', handleMessage)
      clearTimeout(fallbackTimeout)
    }
  }, [iframeRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const handleDone = useCallback(async () => {
    setIsExporting(true)
    try {
      const blob = await exportAsBlob()
      onComplete(blob)
    } catch (error) {
      console.error('[AnnotationOverlay] Failed to export:', error)
    } finally {
      setIsExporting(false)
    }
  }, [exportAsBlob, onComplete])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      style={{ cursor: 'crosshair' }}
    >
      {/* Screenshot failed warning */}
      {screenshotFailed && !backgroundImage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-warning-50 border border-warning-200 rounded-lg px-4 py-2 text-sm text-warning-700">
          Could not capture preview. You can still draw annotations.
        </div>
      )}

      {/* Semi-transparent background when no screenshot */}
      {!backgroundImage && (
        <div className="absolute inset-0 bg-white/30 backdrop-blur-sm pointer-events-none" />
      )}

      {/* Canvas */}
      {canvasSize.width > 0 && canvasSize.height > 0 && (
        <canvas
          ref={canvasRef}
          width={canvasSize.width * dpr}
          height={canvasSize.height * dpr}
          style={{
            width: canvasSize.width,
            height: canvasSize.height,
            position: 'absolute',
            top: 0,
            left: 0,
            touchAction: 'none',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      )}

      {/* Toolbar */}
      <AnnotationToolbar
        tool={tool}
        onToolChange={setTool}
        canUndo={strokes.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={undo}
        onRedo={redo}
        onCancel={onCancel}
        onDone={handleDone}
        isExporting={isExporting}
      />
    </div>
  )
}
