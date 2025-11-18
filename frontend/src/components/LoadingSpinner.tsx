interface LoadingSpinnerProps {
  status?: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'COMPLETED' | 'FAILED';
}

export function LoadingSpinner({ status = 'QUEUED' }: LoadingSpinnerProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'QUEUED':
        return {
          text: 'Queued for processing...',
          description: 'Your request is in the queue and will be processed shortly.',
          color: 'text-amber-600',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12,6 12,12 16,14"/>
            </svg>
          )
        };
      case 'PROCESSING':
        return {
          text: 'Processing with AI...',
          description: 'AI is analyzing your prompt and generating the application.',
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.5 0 2.9-.33 4.2-.9"/>
              <path d="M22 12A10 10 0 0 0 12 2"/>
            </svg>
          )
        };
      case 'BUILDING':
        return {
          text: 'Building your application...',
          description: 'Building and deploying your application for preview.',
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          borderColor: 'border-purple-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/>
              <path d="M13 17V9"/>
              <path d="M18 17v-3"/>
              <path d="M8 17v-5"/>
            </svg>
          )
        };
      case 'READY':
        return {
          text: 'Ready!',
          description: 'Your application is ready for preview!',
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          )
        };
      case 'COMPLETED':
        return {
          text: 'Completed!',
          description: 'All builds finished successfully. Your app is fully deployed!',
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-300',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          )
        };
      case 'FAILED':
        return {
          text: 'Failed',
          description: 'An error occurred while processing your request. Please try again.',
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" x2="9" y1="9" y2="15"/>
              <line x1="9" x2="15" y1="9" y2="15"/>
            </svg>
          )
        };
      default:
        return {
          text: 'Loading...',
          description: 'Processing your request...',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
          icon: (
            <svg className="size-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          )
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="text-center max-w-xs mx-auto">
      <div className={`inline-flex items-center justify-center size-16 ${config.bgColor} ${config.borderColor} border-2 rounded-full mb-4`}>
        {status === 'FAILED' || status === 'READY' || status === 'COMPLETED' ? (
          <div className={config.color}>
            {config.icon}
          </div>
        ) : (
          <span className={`animate-spin inline-block size-6 border-[3px] border-current border-t-transparent ${config.color} rounded-full`} role="status" aria-label="loading">
            <span className="sr-only">Loading</span>
          </span>
        )}
      </div>
      
      <div className={`text-lg font-semibold ${config.color} mb-2`}>
        {config.text}
      </div>
      
      <p className="text-sm text-gray-500 leading-relaxed">
        {config.description}
      </p>
    </div>
  );
}