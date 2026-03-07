import { Clock, Cpu, Hammer, Check, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  status?: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'COMPLETED' | 'FAILED' | 'NEEDS_RESPONSE';
}

export function LoadingSpinner({ status = 'QUEUED' }: LoadingSpinnerProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'QUEUED':
        return {
          text: 'Queued for processing...',
          description: 'Your request is in the queue and will be processed shortly.',
          gradientClass: 'status-queued',
          textColor: 'text-amber-600',
          icon: <Clock className="w-6 h-6" />,
          isAnimated: true
        };
      case 'PROCESSING':
        return {
          text: 'Processing with AI...',
          description: 'AI is analyzing your prompt and generating the application.',
          gradientClass: 'status-processing',
          textColor: 'text-blue-600',
          icon: <Cpu className="w-6 h-6" />,
          isAnimated: true
        };
      case 'BUILDING':
        return {
          text: 'Building your application...',
          description: 'Building and deploying your application for preview.',
          gradientClass: 'status-building',
          textColor: 'text-husky-600',
          icon: <Hammer className="w-6 h-6" />,
          isAnimated: true
        };
      case 'READY':
        return {
          text: 'Ready!',
          description: 'Your application is ready for preview!',
          gradientClass: 'status-ready',
          textColor: 'text-green-600',
          icon: <Check className="w-6 h-6" />,
          isAnimated: false
        };
      case 'COMPLETED':
        return {
          text: 'Completed!',
          description: 'All builds finished successfully. Your app is fully deployed!',
          gradientClass: 'status-ready',
          textColor: 'text-green-700',
          icon: <CheckCircle className="w-6 h-6" />,
          isAnimated: false
        };
      case 'FAILED':
        return {
          text: 'Failed',
          description: 'An error occurred while processing your request. Please try again.',
          gradientClass: 'status-failed',
          textColor: 'text-red-600',
          icon: <XCircle className="w-6 h-6" />,
          isAnimated: false
        };
      default:
        return {
          text: 'Loading...',
          description: 'Processing your request...',
          gradientClass: 'bg-gradient-to-br from-gray-400 to-gray-500',
          textColor: 'text-gray-600',
          icon: <Loader2 className="w-6 h-6" />,
          isAnimated: true
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="text-center max-w-xs mx-auto">
      {/* Status Icon Circle */}
      <div className={`
        inline-flex items-center justify-center w-16 h-16
        ${config.gradientClass}
        rounded-full mb-4
        text-white
        shadow-lg
        ${config.isAnimated ? 'animate-pulse-husky' : ''}
      `}>
        {config.isAnimated && status !== 'READY' && status !== 'COMPLETED' && status !== 'FAILED' ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          config.icon
        )}
      </div>

      {/* Status Text */}
      <div className={`text-lg font-semibold ${config.textColor} mb-2`}>
        {config.text}
      </div>

      {/* Description */}
      <p className="text-sm text-default-500 leading-relaxed">
        {config.description}
      </p>
    </div>
  );
}
