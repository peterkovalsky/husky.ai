import * as React from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface DialogContextType {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextType | undefined>(undefined)

const useDialog = () => {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog")
  }
  return context
}

interface DialogProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const Dialog = ({ children, open = false, onOpenChange }: DialogProps) => {
  return (
    <DialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => {}) }}>
      {children}
    </DialogContext.Provider>
  )
}

interface DialogTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

const DialogTrigger = ({ children, asChild = false }: DialogTriggerProps) => {
  const { onOpenChange } = useDialog()
  
  const handleClick = () => {
    onOpenChange(true)
  }

  if (asChild) {
    const childElement = children as React.ReactElement<any>
    return React.cloneElement(childElement, {
      ...(childElement.props || {}),
      onClick: handleClick
    })
  }

  return (
    <button onClick={handleClick}>
      {children}
    </button>
  )
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
}

const DialogContent = ({ children, className }: DialogContentProps) => {
  const { open, onOpenChange } = useDialog()
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false)
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={() => onOpenChange(false)}
      />
      
      {/* Dialog */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-50 w-full max-w-lg mx-4 bg-background rounded-xl shadow-2xl border border-border/50",
          "animate-in fade-in-0 zoom-in-95 duration-300 ease-out",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-2 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  )
}

interface DialogHeaderProps {
  children: React.ReactNode
  className?: string
}

const DialogHeader = ({ children, className }: DialogHeaderProps) => {
  return (
    <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left p-6 pb-0", className)}>
      {children}
    </div>
  )
}

interface DialogTitleProps {
  children: React.ReactNode
  className?: string
}

const DialogTitle = ({ children, className }: DialogTitleProps) => {
  return (
    <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)}>
      {children}
    </h2>
  )
}

interface DialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

const DialogDescription = ({ children, className }: DialogDescriptionProps) => {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  )
}

interface DialogFooterProps {
  children: React.ReactNode
  className?: string
}

const DialogFooter = ({ children, className }: DialogFooterProps) => {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0", className)}>
      {children}
    </div>
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}