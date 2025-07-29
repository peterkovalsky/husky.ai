import { useState, useEffect } from 'react'
import { Code2, Sparkles, Wand2, Rocket } from 'lucide-react'

interface LoadingStage {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const stages: LoadingStage[] = [
  {
    id: 'analyzing',
    label: 'Analyzing Your Idea',
    icon: Sparkles,
    description: 'Understanding your requirements and planning the architecture'
  },
  {
    id: 'generating',
    label: 'Generating Code',
    icon: Code2,
    description: 'Creating beautiful, production-ready React components'
  },
  {
    id: 'designing',
    label: 'Crafting the Design',
    icon: Wand2,
    description: 'Applying industry-appropriate styling and user experience'
  },
  {
    id: 'building',
    label: 'Building Your App',
    icon: Rocket,
    description: 'Compiling and optimizing for the best performance'
  }
]

interface NewProjectLoadingProps {
  currentStage?: string
  className?: string
}

export const NewProjectLoading = ({ currentStage = 'analyzing', className = '' }: NewProjectLoadingProps) => {
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [dots, setDots] = useState('')

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // Update active stage based on prop
  useEffect(() => {
    const stageIndex = stages.findIndex(stage => stage.id === currentStage)
    if (stageIndex !== -1) {
      setActiveStageIndex(stageIndex)
    }
  }, [currentStage])

  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      {/* Main Animation */}
      <div className="relative mb-8">
        {/* Outer rotating ring */}
        <div className="w-32 h-32 rounded-full border-4 border-primary/20 animate-spin">
          <div className="absolute top-0 left-1/2 w-2 h-2 bg-primary rounded-full transform -translate-x-1/2 -translate-y-1"></div>
        </div>
        
        {/* Inner pulsing circle */}
        <div className="absolute inset-4 bg-gradient-to-r from-primary to-primary/80 rounded-full flex items-center justify-center animate-pulse">
          <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center">
            {React.createElement(stages[activeStageIndex].icon, {
              className: "w-8 h-8 text-primary animate-bounce"
            })}
          </div>
        </div>
        
        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-2 right-2 w-1 h-1 bg-primary/60 rounded-full animate-ping"></div>
          <div className="absolute top-8 left-0 w-1 h-1 bg-primary/40 rounded-full animate-ping animation-delay-300"></div>
          <div className="absolute bottom-4 right-8 w-1 h-1 bg-primary/50 rounded-full animate-ping animation-delay-700"></div>
          <div className="absolute bottom-0 left-6 w-1 h-1 bg-primary/30 rounded-full animate-ping animation-delay-1000"></div>
        </div>
      </div>

      {/* Current Stage */}
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
          {stages[activeStageIndex].label}{dots}
        </h3>
        <p className="text-muted-foreground max-w-md">
          {stages[activeStageIndex].description}
        </p>
      </div>

      {/* Progress Stages */}
      <div className="flex items-center gap-4 mb-8">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500
              ${index <= activeStageIndex 
                ? 'bg-primary text-primary-foreground scale-110' 
                : 'bg-muted text-muted-foreground'
              }
            `}>
              {React.createElement(stage.icon, {
                className: "w-5 h-5"
              })}
            </div>
            {index < stages.length - 1 && (
              <div className={`
                w-8 h-0.5 mx-2 transition-colors duration-500
                ${index < activeStageIndex ? 'bg-primary' : 'bg-muted'}
              `} />
            )}
          </div>
        ))}
      </div>

      {/* Fun Facts or Tips */}
      <div className="text-center max-w-lg">
        <div className="bg-muted/50 rounded-lg p-4 border border-muted">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">💡 Did you know?</span> We're using the latest React 19, TypeScript, and Tailwind CSS to build your app with modern best practices and industry-standard patterns.
          </p>
        </div>
      </div>
    </div>
  )
}