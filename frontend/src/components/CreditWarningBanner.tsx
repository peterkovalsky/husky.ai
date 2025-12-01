import { Button } from '@heroui/react';
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
      <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-200 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl status-failed flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-red-700 mb-1">You're out of credits</h4>
            <p className="text-sm text-red-600/80 mb-3">
              You've used all your credits. Upgrade your plan or purchase additional credits to continue building.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-gradient-failed text-white shadow-sm hover:shadow-md transition-shadow"
                onPress={() => navigate('/billing')}
                startContent={<TrendingUp className="w-4 h-4" />}
              >
                Upgrade Plan
              </Button>
              <Button
                size="sm"
                variant="bordered"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onPress={() => navigate('/billing')}
                startContent={<CreditCard className="w-4 h-4" />}
              >
                Buy Credits
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Low credits - warning alert
  return (
    <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-amber-600/10 border border-amber-200 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl status-queued flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-amber-700 mb-1">Low credit balance</h4>
          <p className="text-sm text-amber-600/80 mb-3">
            You have {creditBalance.totalCredits} credits remaining ({Math.round((creditBalance.totalCredits / creditBalance.monthlyAllocated) * 100)}% of your monthly allocation).
            Consider upgrading or purchasing additional credits.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="status-queued text-white shadow-sm hover:shadow-md transition-shadow"
              onPress={() => navigate('/billing')}
              startContent={<TrendingUp className="w-4 h-4" />}
            >
              Upgrade Plan
            </Button>
            <Button
              size="sm"
              variant="bordered"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onPress={() => navigate('/billing')}
              startContent={<CreditCard className="w-4 h-4" />}
            >
              Buy Credits
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
