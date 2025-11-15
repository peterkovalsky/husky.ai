import { useState, useEffect } from 'react';
import { Card, CardBody } from '@heroui/react';
import { useProject } from '../contexts/ProjectContext';
import { ApiService } from '../services/api';
import type { PurchaseHistoryResponse } from '../services/api';

export const TransactionsPage = () => {
  const { currentWorkspace } = useProject();
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPurchaseHistory = async () => {
      if (!currentWorkspace) return;

      try {
        setIsLoading(true);
        const history = await ApiService.getPurchaseHistory(currentWorkspace.id);
        setPurchaseHistory(history);
      } catch (err) {
        console.error('Failed to load purchase history:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPurchaseHistory();
  }, [currentWorkspace]);

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Transactions</h1>
          <p className="text-muted-foreground">View your purchase history</p>
        </div>

        {/* Purchase History */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          </div>
        ) : purchaseHistory && purchaseHistory.purchases.length > 0 ? (
          <Card>
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
          <Card>
            <CardBody className="text-center py-12">
              <p className="text-default-500">No transactions yet</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
};
