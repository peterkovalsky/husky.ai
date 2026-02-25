import { Button } from '@heroui/react'
import { Pen, ArrowUpRight, Square, Eraser, Undo2, Redo2, X, Check } from 'lucide-react'
import type { AnnotationTool } from '../../types/annotation'

interface AnnotationToolbarProps {
  tool: AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onCancel: () => void
  onDone: () => void
  isExporting?: boolean
}

const TOOLS: { tool: AnnotationTool; icon: typeof Pen; label: string }[] = [
  { tool: 'pen', icon: Pen, label: 'Pen' },
  { tool: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { tool: 'rectangle', icon: Square, label: 'Rectangle' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser' },
]

export const AnnotationToolbar = ({
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCancel,
  onDone,
  isExporting = false,
}: AnnotationToolbarProps) => {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-content1 border border-divider rounded-xl px-3 py-2 shadow-lg">
      {/* Drawing tools */}
      <div className="flex items-center gap-1">
        {TOOLS.map(({ tool: t, icon: Icon, label }) => (
          <Button
            key={t}
            size="sm"
            variant={tool === t ? 'solid' : 'light'}
            color={tool === t ? 'primary' : 'default'}
            isIconOnly
            onPress={() => onToolChange(t)}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      <div className="w-px h-6 bg-divider" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="light"
          isIconOnly
          isDisabled={!canUndo}
          onPress={onUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="light"
          isIconOnly
          isDisabled={!canRedo}
          onPress={onRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-px h-6 bg-divider" />

      {/* Cancel / Done */}
      <Button
        size="sm"
        variant="light"
        onPress={onCancel}
        startContent={<X className="h-4 w-4" />}
        isDisabled={isExporting}
      >
        Cancel
      </Button>
      <Button
        size="sm"
        color="primary"
        onPress={onDone}
        startContent={<Check className="h-4 w-4" />}
        isLoading={isExporting}
      >
        Done
      </Button>
    </div>
  )
}
