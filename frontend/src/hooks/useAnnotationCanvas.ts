import { useRef, useState, useCallback, useEffect } from 'react'
import type { AnnotationTool, Point, Stroke } from '../types/annotation'
import { DEFAULT_COLOR, DEFAULT_WIDTH, ERASER_WIDTH } from '../types/annotation'

interface UseAnnotationCanvasOptions {
  backgroundImage: HTMLImageElement | null
  canvasWidth: number
  canvasHeight: number
}

export const useAnnotationCanvas = ({
  backgroundImage,
  canvasWidth,
  canvasHeight,
}: UseAnnotationCanvasOptions) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<AnnotationTool>('pen')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_WIDTH)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const dpr = window.devicePixelRatio || 1

  // Redraw the full canvas
  const redraw = useCallback(
    (strokesToDraw: Stroke[]) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw background
      if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height)
      }

      // Draw strokes
      strokesToDraw.forEach((stroke) => drawStroke(ctx, stroke))
    },
    [backgroundImage],
  )

  // Redraw when strokes, background, or canvas size changes
  useEffect(() => {
    redraw(strokes)
    // canvasWidth/canvasHeight included to redraw when browser clears canvas on resize
  }, [strokes, redraw, canvasWidth, canvasHeight])

  // Redraw when background image loads
  useEffect(() => {
    if (backgroundImage) {
      redraw(strokes)
    }
  }, [backgroundImage, redraw, strokes])

  const getCanvasPoint = useCallback((e: React.PointerEvent): Point => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr,
    }
  }, [dpr])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(e.pointerId)

      const point = getCanvasPoint(e)
      const effectiveWidth = tool === 'eraser' ? ERASER_WIDTH * dpr : strokeWidth * dpr

      currentStrokeRef.current = {
        tool,
        points: [point],
        color: tool === 'eraser' ? 'eraser' : color,
        width: effectiveWidth,
      }
      setIsDrawing(true)
    },
    [tool, color, strokeWidth, dpr, getCanvasPoint],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing || !currentStrokeRef.current) return
      const point = getCanvasPoint(e)
      currentStrokeRef.current.points.push(point)

      // Live preview: redraw all strokes + current
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height)
      }
      strokes.forEach((s) => drawStroke(ctx, s))
      drawStroke(ctx, currentStrokeRef.current)
    },
    [isDrawing, strokes, backgroundImage, getCanvasPoint],
  )

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !currentStrokeRef.current) return
    setIsDrawing(false)

    // Only add if there was actual movement
    if (currentStrokeRef.current.points.length > 1) {
      const completedStroke = currentStrokeRef.current
      setStrokes((prev) => [...prev, completedStroke])
      setRedoStack([]) // Clear redo on new stroke
    }
    currentStrokeRef.current = null
  }, [isDrawing])

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setRedoStack((redo) => [...redo, last])
      return prev.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      setStrokes((s) => [...s, last])
      return prev.slice(0, -1)
    })
  }, [])

  const clearAll = useCallback(() => {
    setStrokes([])
    setRedoStack([])
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        redo()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const exportAsBlob = useCallback(async (): Promise<Blob> => {
    const canvas = canvasRef.current
    if (!canvas) throw new Error('Canvas not available')

    // Create export canvas at full resolution
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const ctx = exportCanvas.getContext('2d')!
    ctx.drawImage(canvas, 0, 0)

    return new Promise((resolve, reject) => {
      exportCanvas.toBlob(
        (blob) => {
          if (blob) {
            // Compress to JPEG if too large (>5MB)
            if (blob.size > 5 * 1024 * 1024) {
              exportCanvas.toBlob(
                (jpegBlob) => {
                  if (jpegBlob) resolve(jpegBlob)
                  else reject(new Error('Failed to export as JPEG'))
                },
                'image/jpeg',
                0.85,
              )
            } else {
              resolve(blob)
            }
          } else {
            reject(new Error('Failed to export canvas'))
          }
        },
        'image/png',
      )
    })
  }, [])

  return {
    canvasRef,
    tool,
    setTool,
    strokes,
    redoStack,
    isDrawing,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    undo,
    redo,
    clearAll,
    exportAsBlob,
  }
}

// --- Drawing helpers ---

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { tool, points, color, width } = stroke
  if (points.length < 1) return

  ctx.save()

  if (color === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color
    ctx.fillStyle = color
  }
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (tool) {
    case 'pen':
    case 'eraser':
      drawFreehand(ctx, points)
      break
    case 'arrow':
      drawArrow(ctx, points[0], points[points.length - 1], width)
      break
    case 'rectangle':
      drawRectangle(ctx, points[0], points[points.length - 1])
      break
    case 'circle': // Legacy support for any saved strokes
      drawEllipse(ctx, points[0], points[points.length - 1])
      break
  }

  ctx.restore()
}

function drawFreehand(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
}

function drawArrow(ctx: CanvasRenderingContext2D, start: Point, end: Point, lineWidth: number) {
  const headLength = Math.max(lineWidth * 4, 16)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)

  // Shaft
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()

  // Arrowhead
  ctx.beginPath()
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6),
  )
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6),
  )
  ctx.closePath()
  ctx.fill()
}

function drawRectangle(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
  ctx.beginPath()
  ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y)
  ctx.stroke()
}

function drawEllipse(ctx: CanvasRenderingContext2D, start: Point, end: Point) {
  const cx = (start.x + end.x) / 2
  const cy = (start.y + end.y) / 2
  const rx = Math.abs(end.x - start.x) / 2
  const ry = Math.abs(end.y - start.y) / 2
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI)
  ctx.stroke()
}
