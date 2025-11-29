import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Button, Chip, Divider, Input } from '@heroui/react';
import { CreditCard, Check, Zap, Star, TrendingUp, AlertCircle } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';
import { ApiService } from '../services/api';
import type { PurchaseHistoryResponse } from '../services/api';

interface PlanFeature {
  name: string;
  included: boolean;
}

interface Plan {
  tier: 'free' | 'basic' | 'pro';
  name: string;
  price: number;
  credits: number;
  icon: typeof Zap;
  color: 'default' | 'primary' | 'secondary';
  features: PlanFeature[];
}

const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: 0,
    credits: 100,
    icon: Zap,
    color: 'default',
    features: [
      { name: '100 credits per month', included: true },
      { name: 'Up to 3 projects', included: true },
      { name: 'Community support', included: true },
      { name: 'Custom domains', included: false },
      { name: 'Priority support', included: false },
    ],
  },
  {
    tier: 'basic',
    name: 'Basic',
    price: 19,
    credits: 250,
    icon: TrendingUp,
    color: 'primary',
    features: [
      { name: '250 credits per month', included: true },
      { name: 'Up to 10 projects', included: true },
      { name: 'Priority build queue', included: true },
      { name: 'Email support', included: true },
      { name: 'Custom domains', included: false },
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: 49,
    credits: 500,
    icon: Star,
    color: 'secondary',
    features: [
      { name: '500 credits per month', included: true },
      { name: 'Unlimited projects', included: true },
      { name: 'Priority build queue', included: true },
      { name: 'Priority support', included: true },
      { name: 'Custom domains', included: true },
    ],
  },
];

export const BillingPage = () => {
  const { currentWorkspace, creditBalance, refreshCredits } = useProject();
  const [creditAmount, setCreditAmount] = useState('50');
  const [upgradingTier, setUpgradingTier] = useState<'basic' | 'pro' | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryResponse | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Handle Stripe Checkout redirect results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const canceled = params.get('canceled');

    if (success === 'true') {
      // Success! Payment completed
      // Refresh credit balance
      refreshCredits();

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled === 'true') {
      setError('Payment was canceled. You can try again when ready.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshCredits]);

  // Load purchase history
  useEffect(() => {
    const loadPurchaseHistory = async () => {
      if (!currentWorkspace) return;

      try {
        setIsLoadingHistory(true);
        const history = await ApiService.getPurchaseHistory(currentWorkspace.id);
        setPurchaseHistory(history);
      } catch (err) {
        console.error('Failed to load purchase history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadPurchaseHistory();
  }, [currentWorkspace]);

  const handleUpgrade = async (tier: 'basic' | 'pro') => {
    if (!currentWorkspace) return;

    setUpgradingTier(tier);
    setError(null);

    try {
      const currentTier = creditBalance?.tier || 'free';

      // Build success and cancel URLs
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/billing?success=true&type=subscription&tier=${tier}`;
      const cancelUrl = `${baseUrl}/billing?canceled=true`;

      let result;
      if (currentTier === 'free') {
        // Subscribe to new plan
        result = await ApiService.subscribe(currentWorkspace.id, tier, successUrl, cancelUrl);
      } else {
        // Upgrade existing plan
        result = await ApiService.upgradeSubscription(currentWorkspace.id, tier, successUrl, cancelUrl);
      }

      // If checkout URL is returned, redirect to Stripe Checkout
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        // Legacy flow: subscription created directly
        await refreshCredits();
        alert(`Successfully upgraded to ${tier} plan!`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade plan');
      setUpgradingTier(null);
    }
    // Note: Don't reset loading state if redirecting to Stripe
  };

  const handlePurchaseCredits = async () => {
    if (!currentWorkspace) return;

    const credits = parseInt(creditAmount, 10);
    if (isNaN(credits) || credits < 1) {
      setError('Please enter a valid number of credits');
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      // Build success and cancel URLs
      const baseUrl = window.location.origin;
      const successUrl = `${baseUrl}/billing?success=true&type=credits&credits=${credits}`;
      const cancelUrl = `${baseUrl}/billing?canceled=true`;

      const response = await ApiService.purchaseCredits(
        currentWorkspace.id,
        credits,
        successUrl,
        cancelUrl
      );

      // If checkout URL is returned, redirect to Stripe Checkout
      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else if (response.clientSecret) {
        // Legacy flow: use Stripe Elements (not implemented yet)
        alert(`Payment Intent created. ClientSecret: ${response.clientSecret.substring(0, 20)}...`);
        setIsPurchasing(false);
      } else {
        alert(`Purchase initiated! Amount: $${response.amount.toFixed(2)} for ${response.credits} credits`);
        await refreshCredits();
        setCreditAmount('50');
        setIsPurchasing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purchase credits');
      setIsPurchasing(false);
    }
    // Note: Don't reset loading state if redirecting to Stripe
  };

  const currentTier = (creditBalance?.tier || 'free') as 'free' | 'basic' | 'pro';

  // Helper function to determine tier order
  const getTierOrder = (tier: 'free' | 'basic' | 'pro'): number => {
    const order = { free: 0, basic: 1, pro: 2 };
    return order[tier];
  };

  const isDowngrade = (planTier: 'free' | 'basic' | 'pro'): boolean => {
    return getTierOrder(planTier) < getTierOrder(currentTier);
  };

  const isUpgrade = (planTier: 'free' | 'basic' | 'pro'): boolean => {
    return getTierOrder(planTier) > getTierOrder(currentTier);
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Billing</h1>
          <p className="text-muted-foreground">Manage your plan, credits, and view transactions</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 border border-danger-200 bg-danger-50 text-danger-700 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {/* Plan Comparison */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Subscription Plans</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <Card key={plan.tier} className={currentTier === plan.tier ? 'border-2 border-primary' : ''}>
                <CardHeader className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2">
                    <plan.icon className="w-6 h-6 text-primary" />
                    <p className="text-lg font-semibold">{plan.name}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">${plan.price}</span>
                    <span className="text-sm text-default-500">/month</span>
                  </div>
                  <p className="text-sm text-default-600">{plan.credits} credits/month</p>
                </CardHeader>
                <Divider />
                <CardBody className="gap-4">
                  <div className="space-y-2">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-2">
                        {feature.included ? (
                          <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        ) : (
                          <div className="w-4 h-4 flex-shrink-0 mt-0.5"></div>
                        )}
                        <span className={`text-sm ${feature.included ? 'text-default-700' : 'text-default-400'}`}>
                          {feature.name}
                        </span>
                      </div>
                    ))}
                  </div>

                  {currentTier === plan.tier ? (
                    <Chip color="success" variant="flat" className="w-full justify-center">
                      Current Plan
                    </Chip>
                  ) : isDowngrade(plan.tier) ? (
                    <Button
                      variant="bordered"
                      color="warning"
                      onPress={() => {
                        if (plan.tier === 'free') {
                          // Cancel subscription to downgrade to free
                          if (confirm('Are you sure you want to cancel your subscription and downgrade to the free plan?')) {
                            ApiService.cancelSubscription(currentWorkspace!.id)
                              .then(() => {
                                refreshCredits();
                                alert('Subscription cancelled. You will be downgraded to the free plan at the end of your billing period.');
                              })
                              .catch((err) => setError(err instanceof Error ? err.message : 'Failed to cancel subscription'));
                          }
                        } else {
                          // Downgrade to a paid tier
                          handleUpgrade(plan.tier as 'basic' | 'pro');
                        }
                      }}
                      isLoading={upgradingTier === plan.tier}
                      className="w-full"
                    >
                      Downgrade
                    </Button>
                  ) : isUpgrade(plan.tier) ? (
                    <Button
                      color={plan.color}
                      onPress={() => handleUpgrade(plan.tier as 'basic' | 'pro')}
                      isLoading={upgradingTier === plan.tier}
                      className="w-full"
                    >
                      {currentTier === 'free' ? 'Subscribe' : 'Upgrade'}
                    </Button>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        </div>

        {/* Purchase Credits */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Purchase Additional Credits</h2>
          <Card className="max-w-2xl">
            <CardBody className="gap-4">
              <div className="flex gap-4 items-end">
                <Input
                  type="number"
                  label="Number of credits"
                  placeholder="50"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  min="1"
                  className="flex-1"
                />
                <div className="text-right">
                  <p className="text-xs text-default-500">Total Cost</p>
                  <p className="text-2xl font-bold">
                    ${(parseFloat(creditAmount) * 0.1 || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <Button
                color="primary"
                onPress={handlePurchaseCredits}
                isLoading={isPurchasing}
                startContent={<CreditCard className="w-4 h-4" />}
              >
                Purchase Credits
              </Button>
            </CardBody>
          </Card>
        </div>

        {/* Transaction History */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Transaction History</h2>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : purchaseHistory && purchaseHistory.purchases.length > 0 ? (
            <Card className="max-w-2xl">
              <CardBody>
                <div className="space-y-2">
                  {purchaseHistory.purchases.map((purchase) => (
                    <div key={purchase.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div>
                        <p className="font-medium">{purchase.credits} credits</p>
                        <p className="text-xs text-default-500">
                          {new Date(purchase.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <p className="font-semibold">${purchase.amount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card className="max-w-2xl">
              <CardBody className="text-center py-12">
                <p className="text-default-500">No transactions yet</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
