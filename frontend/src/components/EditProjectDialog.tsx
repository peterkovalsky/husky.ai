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
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3 text-xl">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
            <Edit className="w-5 h-5 text-primary-foreground" />
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
            variant="bordered"
            size="lg"
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Description (Optional)"
            value={description}
            onValueChange={setDescription}
            isDisabled={isUpdating}
            variant="bordered"
            minRows={4}
          />

          {error && (
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-danger flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-danger-foreground text-xs font-bold">!</span>
                </div>
                <p className="text-sm text-danger font-medium">{error}</p>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            variant="light"
            onPress={onOpenChange}
            isDisabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            onPress={handleSubmit}
            isDisabled={!name.trim() || !hasChanges() || isUpdating}
            isLoading={isUpdating}
            startContent={!isUpdating ? <Edit className="h-4 w-4" /> : undefined}
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
