import { useState, useEffect } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea } from '@heroui/react'
import { Edit } from 'lucide-react'
import { ApiService } from '../services/api'
import { useProject } from '../contexts/ProjectContext'

interface EditProjectDialogProps {
  projectId: string
  currentName: string
  currentDescription?: string
  isOpen: boolean
  onOpenChange: () => void
  onProjectUpdated?: () => void
}

export const EditProjectDialog = ({
  projectId,
  currentName,
  currentDescription,
  isOpen,
  onOpenChange,
  onProjectUpdated
}: EditProjectDialogProps) => {
  const [name, setName] = useState(currentName)
  const [description, setDescription] = useState(currentDescription || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { refreshProjects } = useProject()

  // Update form when props change
  useEffect(() => {
    setName(currentName)
    setDescription(currentDescription || '')
    setError(null)
  }, [currentName, currentDescription, isOpen])

  const validateName = (value: string): string | null => {
    if (!value.trim()) {
      return 'Project name is required'
    }
    if (value.trim().length < 3) {
      return 'Project name must be at least 3 characters'
    }
    if (value.trim().length > 100) {
      return 'Project name must not exceed 100 characters'
    }
    return null
  }

  const handleSubmit = async () => {
    const validationError = validateName(name)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsUpdating(true)
    setError(null)

    try {
      await ApiService.updateProject(projectId, {
        name: name.trim(),
        description: description.trim() || undefined
      })

      // Refresh projects list in context
      await refreshProjects()

      // Close dialog
      onOpenChange()

      // Optional callback
      onProjectUpdated?.()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update project')
    } finally {
      setIsUpdating(false)
    }
  }

  const hasChanges = () => {
    return name.trim() !== currentName || description.trim() !== (currentDescription || '')
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="2xl"
      placement="center"
      classNames={{
        base: "glass-card border-white/30",
        header: "border-b border-white/20",
        footer: "border-t border-white/20",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 text-xl">
          <div className="w-10 h-10 rounded-xl bg-gradient-husky flex items-center justify-center shadow-husky">
            <Edit className="w-5 h-5 text-white" />
          </div>
          Edit Project
        </ModalHeader>

        <ModalBody className="space-y-5">
          <Input
            label="Project Name"
            placeholder="Project Name"
            value={name}
            onValueChange={setName}
            isDisabled={isUpdating}
            isRequired
            size="lg"
            classNames={{
              inputWrapper: [
                'bg-white/50',
                'backdrop-blur-sm',
                'border-white/50',
                'hover:bg-white/70',
                'group-data-[focus=true]:bg-white/70',
                'group-data-[focus=true]:border-husky-400',
              ].join(' '),
            }}
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Description (Optional)"
            value={description}
            onValueChange={setDescription}
            isDisabled={isUpdating}
            minRows={4}
            classNames={{
              inputWrapper: [
                'bg-white/50',
                'backdrop-blur-sm',
                'border-white/50',
                'hover:bg-white/70',
                'group-data-[focus=true]:bg-white/70',
                'group-data-[focus=true]:border-husky-400',
              ].join(' '),
            }}
          />

          {error && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-200 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl status-failed flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <p className="text-sm text-red-700 font-medium pt-1">{error}</p>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            variant="light"
            onPress={onOpenChange}
            isDisabled={isUpdating}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            className="btn-primary"
            onPress={handleSubmit}
            isDisabled={!name.trim() || !hasChanges() || isUpdating}
            isLoading={isUpdating}
            startContent={!isUpdating ? <Edit className="h-4 w-4" /> : undefined}
            size="sm"
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
