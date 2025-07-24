import { useState, useEffect } from 'react'

interface TimerProps {
  isRunning: boolean
  onTimeUpdate?: (time: number) => void
  className?: string
}

export const Timer = ({ isRunning, onTimeUpdate, className = '' }: TimerProps) => {
  const [time, setTime] = useState(0)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (isRunning) {
      setTime(0) // Reset timer when starting
      interval = setInterval(() => {
        setTime(prevTime => {
          const newTime = prevTime + 1
          onTimeUpdate?.(newTime)
          return newTime
        })
      }, 1000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isRunning, onTimeUpdate])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isRunning && time === 0) {
    return null
  }

  return (
    <div className={`inline-flex items-center gap-x-2 ${className}`}>
      <div className="flex items-center gap-x-1.5">
        <div className={`size-2 rounded-full ${isRunning ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`}></div>
        <span className="text-sm font-mono text-gray-600">
          {formatTime(time)}
        </span>
      </div>
      {!isRunning && time > 0 && (
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          completed
        </span>
      )}
    </div>
  )
}