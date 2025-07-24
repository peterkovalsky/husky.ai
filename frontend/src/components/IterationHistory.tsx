import { useState, useEffect } from 'react'
import { ApiService, type Prompt } from '../services/api'
import { LoadingSpinner } from './LoadingSpinner'

interface IterationHistoryProps {
  projectId: string
  currentPromptId?: string
  onSelectIteration?: (prompt: Prompt) => void
  className?: string
}

export const IterationHistory = ({ 
  projectId, 
  currentPromptId, 
  onSelectIteration,
  className = '' 
}: IterationHistoryProps) => {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await ApiService.getPrompts(projectId)
        // Sort by creation date, newest first
        const sortedPrompts = response.prompts.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setPrompts(sortedPrompts)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load iterations')
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      loadPrompts()
    }
  }, [projectId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY': return 'bg-green-100 text-green-800'
      case 'FAILED': return 'bg-red-100 text-red-800'
      case 'PROCESSING': return 'bg-blue-100 text-blue-800'
      case 'BUILDING': return 'bg-yellow-100 text-yellow-800'
      case 'QUEUED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'READY': 
        return (
          <svg className="size-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )
      case 'FAILED':
        return (
          <svg className="size-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <div className="size-1.5 rounded-full bg-current"></div>
        )
    }
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const truncatePrompt = (prompt: string, maxLength: number = 60) => {
    if (prompt.length <= maxLength) return prompt
    return prompt.substring(0, maxLength) + '...'
  }

  if (loading) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-center py-4">
          <LoadingSpinner status="PROCESSING" />
          <span className="ml-2 text-sm text-gray-500">Loading iterations...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="text-center py-4">
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      </div>
    )
  }

  if (prompts.length === 0) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="text-center py-4">
          <div className="text-gray-500 text-sm">No iterations yet</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            Iterations ({prompts.length})
          </h3>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg 
              className={`size-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Iterations List */}
      <div className={`${isExpanded ? 'max-h-96 overflow-y-auto' : 'max-h-48 overflow-y-auto'}`}>
        <div className="divide-y divide-gray-100">
          {prompts.map((prompt, index) => (
            <div
              key={prompt.id}
              className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                currentPromptId === prompt.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
              onClick={() => onSelectIteration?.(prompt)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <span className={`inline-flex items-center gap-x-1 py-1 px-2 rounded-full text-xs font-medium ${getStatusColor(prompt.status)}`}>
                    {getStatusIcon(prompt.status)}
                    {prompt.status.toLowerCase()}
                  </span>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-900">
                      #{index + 1}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(prompt.created_at)}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {isExpanded ? prompt.prompt : truncatePrompt(prompt.prompt)}
                  </p>
                </div>
                
                {currentPromptId === prompt.id && (
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center gap-x-1 py-1 px-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      current
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}