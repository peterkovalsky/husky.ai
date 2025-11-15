import { Progress } from '@heroui/react';
import { useProject } from '../contexts/ProjectContext';

export const CreditBalanceWidget = () => {
  const { creditBalance, isLoadingCredits } = useProject();

  if (isLoadingCredits) {
    return (
      <div className="w-full px-2">
        <div className="flex items-center justify-center py-4">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
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
    <div className="w-full space-y-4 px-2">
      {/* Monthly Credits Usage */}
      <div className="space-y-1.5">
        <span className="text-xs text-default-500">Monthly credits</span>
        <Progress
          size="sm"
          value={monthlyPercentage}
          classNames={{
            indicator: "bg-[#22C55F]",
            track: "bg-[#22C55F]/20"
          }}
          className="max-w-full"
        />
        <div className="text-xs text-default-500">
          {monthlyUsed}/{creditBalance.monthlyAllocated}
        </div>
      </div>

      {/* Purchased Credits Usage - Only show if user has ever purchased credits */}
      {hasPurchasedCredits && (
        <div className="space-y-1.5">
          <span className="text-xs text-default-500">Purchased credits</span>
          <Progress
            size="sm"
            value={purchasedPercentage}
            classNames={{
              indicator: "bg-[#22C55F]",
              track: "bg-[#22C55F]/20"
            }}
            className="max-w-full"
          />
          <div className="text-xs text-default-500">
            {creditBalance.purchasedUsed}/{creditBalance.purchasedTotal}
          </div>
        </div>
      )}
    </div>
  );
};
