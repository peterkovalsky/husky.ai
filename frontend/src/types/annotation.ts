export type AnnotationTool = 'pen' | 'arrow' | 'rectangle' | 'eraser'

export interface Point {
  x: number
  y: number
}

export interface Stroke {
  tool: AnnotationTool
  points: Point[]
  color: string
  width: number
}

export const STROKE_WIDTHS = [
  { name: 'Medium', value: 4 },
] as const

export const DEFAULT_COLOR = '#ef4444'
export const DEFAULT_WIDTH = 4
export const ERASER_WIDTH = 20
