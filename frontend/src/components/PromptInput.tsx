import { useRef, useEffect } from 'react'
import { Button, Textarea } from '@heroui/react'
import { ArrowUp, ImageIcon, Loader2 } from 'lucide-react'
import { ImagePreview, type AttachedImage } from './ImagePreview'

export type { AttachedImage }

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onFileSelect: (files: FileList | null) => void
  onRemoveFile: (fileId: string) => void
  attachedFiles?: AttachedImage[]
  isSubmitting?: boolean
  isDisabled?: boolean
  placeholder?: string
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragging?: boolean
  loadingStatus?: 'QUEUED' | 'PROCESSING' | 'BUILDING' | null
  autoFocus?: boolean
  showLoadingOverlay?: boolean // When false, just disables without showing internal loading UI
}

export const PromptInput = ({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onFileSelect,
  onRemoveFile,
  attachedFiles = [],
  isSubmitting = false,
  isDisabled = false,
  placeholder = 'Type your message...',
  onDragOver,
  onDragLeave,
  onDrop,
  isDragging = false,
  loadingStatus = null,
  autoFocus = false,
  showLoadingOverlay = true,
}: PromptInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus the textarea on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  const handleFileButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Command+Enter or Ctrl+Enter creates a new line
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onChange(value + '\n')
      return
    }

    // Call the original onKeyDown if provided
    if (onKeyDown) {
      onKeyDown(e)
    }
  }

  const getCurrentStep = () => {
    const steps = {
      'QUEUED': 'Analyzing changes',
      'PROCESSING': 'Generating code',
      'BUILDING': 'Building app',
    }

    return loadingStatus ? steps[loadingStatus] : 'Processing your request'
  }

  return (
    <div
      className="relative w-full"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* File Previews Grid */}
      {attachedFiles.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {attachedFiles.map((file) => (
            <ImagePreview key={file.id} file={file} onRemove={onRemoveFile} />
          ))}
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl flex items-center justify-center z-20 pointer-events-none">
          <div className="text-center">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium text-primary">Drop file here</p>
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={onSubmit} className="relative">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf"
          onChange={(e) => onFileSelect(e.target.files)}
          className="hidden"
        />

        {/* Input Container - Hero UI Style */}
        <div className="relative flex flex-col gap-3 px-4 py-3 rounded-2xl bg-content2 border border-divider">
          {/* Loading Overlay - only show if showLoadingOverlay is true */}
          {isSubmitting && showLoadingOverlay && (
            <div className="absolute inset-0 bg-content2/90 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
              <div className="flex items-center gap-3">
                {/* Spinner Icon */}
                <Loader2 className="h-5 w-5 animate-spin text-primary" />

                {/* Current Step Label */}
                <div className="text-sm font-medium text-primary">
                  {getCurrentStep()}
                  <span className="ml-1 animate-pulse">...</span>
                </div>
              </div>
            </div>
          )}

          {/* Textarea */}
          <div className="flex-1 min-h-[32px] prompt-input-no-ring">
            <Textarea
              ref={textareaRef}
              value={value}
              onValueChange={onChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              isDisabled={isDisabled || isSubmitting}
              autoFocus={autoFocus}
              minRows={1}
              maxRows={5}
              variant="flat"
              classNames={{
                base: "w-full",
                inputWrapper: "!bg-transparent !p-0 !border-0 !min-h-0 !rounded-none !outline-none after:!hidden before:!hidden shadow-none ring-0",
                innerWrapper: "!p-0 !border-0 !outline-none",
                input: "!resize-none !bg-transparent !text-sm !px-0 !py-0 !outline-none !ring-0 !border-0 !shadow-none focus:!outline-none focus:!ring-0 focus:!border-0 focus:!shadow-none focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!shadow-none caret-primary"
              }}
            />
          </div>

          {/* Bottom Row - Icons */}
          <div className="flex justify-between items-center">
            {/* Bottom Left - Image Attach and Hint */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="light"
                isIconOnly
                onPress={handleFileButtonClick}
                isDisabled={isDisabled || attachedFiles.length > 0 || isSubmitting}
                title="Attach file (image, video, or PDF)"
                type="button"
              >
                <ImageIcon className="h-5 w-5 opacity-70" />
              </Button>
              <span className="text-xs text-default-400">⌘ + Enter for new line</span>
            </div>

            {/* Bottom Right - Send Button - Circular */}
            <Button
              type="submit"
              isIconOnly
              color="primary"
              isDisabled={!value.trim() || isSubmitting || isDisabled}
              className="rounded-full"
              size="sm"
            >
              {isSubmitting && showLoadingOverlay ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowUp className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
