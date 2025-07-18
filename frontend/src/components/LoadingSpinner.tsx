interface LoadingSpinnerProps {
  status?: 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY';
}

export function LoadingSpinner({ status = 'QUEUED' }: LoadingSpinnerProps) {
  const getStatusText = () => {
    switch (status) {
      case 'QUEUED':
        return 'Queued for processing...';
      case 'PROCESSING':
        return 'Processing with AI...';
      case 'BUILDING':
        return 'Building your application...';
      case 'READY':
        return 'Ready!';
      default:
        return 'Loading...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'QUEUED':
        return 'text-yellow-600';
      case 'PROCESSING':
        return 'text-blue-600';
      case 'BUILDING':
        return 'text-purple-600';
      case 'READY':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-blue-500 rounded-full opacity-20 animate-pulse"></div>
        </div>
      </div>
      <div className={`text-lg font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </div>
      <div className="text-sm text-gray-500 max-w-md text-center">
        {status === 'QUEUED' && 'Your request is in the queue and will be processed shortly.'}
        {status === 'PROCESSING' && 'AI is analyzing your prompt and generating the application.'}
        {status === 'BUILDING' && 'Building and deploying your application for preview.'}
        {status === 'READY' && 'Your application is ready for preview!'}
      </div>
    </div>
  );
}