import { Alert } from '@heroui/react';
import { AlertTriangle, TrendingUp, CreditCard } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import { useNavigate } from 'react-router-dom';

interface CreditWarningBannerProps {
  /**
   * When to show the banner
   * 'always' - Show whenever credits are low or out
   * 'low-only' - Only show when low (not out)
   * 'out-only' - Only show when completely out
   */
  showWhen?: 'always' | 'low-only' | 'out-only';
}

export const CreditWarningBanner = ({ showWhen = 'always' }: CreditWarningBannerProps) => {
  const { creditBalance, isLoadingCredits } = useProject();
  const navigate = useNavigate();

  // Don't show while loading
  if (isLoadingCredits || !creditBalance) {
    return null;
  }

  // Determine if we should show based on showWhen prop
  const shouldShow = () => {
    if (showWhen === 'always') {
      return creditBalance.isLow || creditBalance.isOut;
    } else if (showWhen === 'low-only') {
      return creditBalance.isLow && !creditBalance.isOut;
    } else if (showWhen === 'out-only') {
      return creditBalance.isOut;
    }
    return false;
  };

  if (!shouldShow()) {
    return null;
  }

  // Out of credits - critical alert
  if (creditBalance.isOut) {
    return (
      <Alert
        color="danger"
        variant="flat"
        className="mb-4"
        startContent={<AlertTriangle className="w-5 h-5" />}
        title="You're out of credits"
        description={
          <div className="flex flex-col gap-2">
            <p>
              You've used all your credits. Upgrade your plan or purchase additional credits to continue building.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => navigate('/billing')}
                className="px-3 py-1.5 bg-danger-600 hover:bg-danger-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <TrendingUp className="w-4 h-4" />
                Upgrade Plan
              </button>
              <button
                onClick={() => navigate('/billing')}
                className="px-3 py-1.5 bg-danger-600/10 hover:bg-danger-600/20 text-danger-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                Buy Credits
              </button>
            </div>
          </div>
        }
      />
    );
  }

  // Low credits - warning alert
  return (
    <Alert
      color="warning"
      variant="flat"
      className="mb-4"
      startContent={<AlertTriangle className="w-5 h-5" />}
      title="Low credit balance"
      description={
        <div className="flex flex-col gap-2">
          <p>
            You have {creditBalance.totalCredits} credits remaining ({Math.round((creditBalance.totalCredits / creditBalance.monthlyAllocated) * 100)}% of your monthly allocation).
            Consider upgrading or purchasing additional credits.
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => navigate('/billing')}
              className="px-3 py-1.5 bg-warning-600 hover:bg-warning-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-4 h-4" />
              Upgrade Plan
            </button>
            <button
              onClick={() => navigate('/billing')}
              className="px-3 py-1.5 bg-warning-600/10 hover:bg-warning-600/20 text-warning-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <CreditCard className="w-4 h-4" />
              Buy Credits
            </button>
          </div>
        </div>
      }
    />
  );
};
