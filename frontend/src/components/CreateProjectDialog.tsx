import { useState } from 'react'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Button, Input, Textarea } from '@heroui/react'
import { Plus } from 'lucide-react'
import { ApiService } from '../services/api'
import { useNavigate } from 'react-router-dom'

interface CreateProjectDialogProps {
  onProjectCreated?: (projectId: string) => void
  isFirstProject?: boolean
}

export const CreateProjectDialog = ({ onProjectCreated, isFirstProject }: CreateProjectDialogProps) => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const project = await ApiService.createProject({
        name: name.trim(),
        description: description.trim() || undefined
      })

      // Close dialog and reset form
      onOpenChange()
      setName('')
      setDescription('')
      
      // Navigate to the new project
      navigate(`/project/${project.id}`)
      
      // Optional callback
      onProjectCreated?.(project.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setError(null)
  }

  return (
    <>
      <Button onPress={onOpen} color="primary" size={isFirstProject ? "lg" : "md"}>
        <Plus className="mr-2 h-4 w-4" />
        {isFirstProject ? "Create Your First Project" : "Create Project"}
      </Button>

      <Modal 
        isOpen={isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            resetForm()
          }
          onOpenChange()
        }}
        size="2xl"
        placement="center"
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary-foreground" />
            </div>
            Create New Project
          </ModalHeader>
          
          <ModalBody className="space-y-5">
            <Input
              label="Project Name"
              placeholder="My Awesome App"
              value={name}
              onValueChange={setName}
              isDisabled={isCreating}
              isRequired
              variant="bordered"
              size="lg"
            />
            
            <Textarea
              label="Description"
              placeholder="Describe what your app will do..."
              value={description}
              onValueChange={setDescription}
              isDisabled={isCreating}
              variant="bordered"
              minRows={4}
              description="Optional"
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
              onPress={() => onOpenChange()}
              isDisabled={isCreating}
            >
              Cancel
            </Button>
            <Button 
              color="primary"
              onPress={handleSubmit}
              isDisabled={!name.trim() || isCreating}
              isLoading={isCreating}
              startContent={!isCreating ? <Plus className="h-4 w-4" /> : undefined}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}