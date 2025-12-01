import { Progress } from '@heroui/react';
import { useProject } from '../contexts/ProjectContext';

export const CreditBalanceWidget = () => {
  const { creditBalance, isLoadingCredits } = useProject();

  if (isLoadingCredits) {
    return (
      <div className="w-full px-2">
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 rounded-full bg-husky-500 animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!creditBalance) {
    return null;
  }

  const monthlyUsed = creditBalance.monthlyAllocated - creditBalance.monthlyRemaining;
  const monthlyPercentage = (monthlyUsed / creditBalance.monthlyAllocated) * 100;

  // Only show purchased credits section if user has ever purchased credits
  const hasPurchasedCredits = creditBalance.purchasedTotal > 0;
  const purchasedPercentage = hasPurchasedCredits
    ? (creditBalance.purchasedUsed / creditBalance.purchasedTotal) * 100
    : 0;

  return (
    <div className="w-full space-y-2">
      {/* Monthly Credits Usage */}
      <div className="space-y-0.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Credits used</span>
          <span className="text-xs text-gray-500">
            {monthlyUsed}/{creditBalance.monthlyAllocated}
          </span>
        </div>
        <Progress
          size="sm"
          value={monthlyPercentage}
          classNames={{
            indicator: "bg-violet-500",
            track: "bg-violet-100"
          }}
          className="max-w-full h-1"
        />
      </div>

      {/* Purchased Credits Usage - Only show if user has ever purchased credits */}
      {hasPurchasedCredits && (
        <div className="space-y-0.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">Purchased</span>
            <span className="text-xs text-gray-500">
              {creditBalance.purchasedUsed}/{creditBalance.purchasedTotal}
            </span>
          </div>
          <Progress
            size="sm"
            value={purchasedPercentage}
            classNames={{
              indicator: "bg-purple-500",
              track: "bg-purple-100"
            }}
            className="max-w-full h-1"
          />
        </div>
      )}
    </div>
  );
};
