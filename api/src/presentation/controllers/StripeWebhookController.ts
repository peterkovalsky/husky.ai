import { Request, Response } from 'express';
import { IStripeService } from '../../domain/services/IStripeService';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { PurchaseCreditsUseCase } from '../../application/use-cases/billing/PurchaseCreditsUseCase';
import { SubscriptionTier, SubscriptionStatus } from '../../domain/entities/Workspace';

export class StripeWebhookController {
  constructor(
    private stripeService: IStripeService,
    private workspaceRepository: IWorkspaceRepository,
    private purchaseCreditsUseCase: PurchaseCreditsUseCase
  ) {}

  handleWebhook = async (req: Request, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature || typeof signature !== 'string') {
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      // Debug logging
      console.log('[StripeWebhook] Received webhook request');
      console.log('[StripeWebhook] Body type:', typeof req.body);
      console.log('[StripeWebhook] Body is Buffer:', Buffer.isBuffer(req.body));
      console.log('[StripeWebhook] Has signature:', !!signature);
      console.log('[StripeWebhook] Webhook secret configured:', !!process.env.STRIPE_WEBHOOK_SECRET);

      // Construct event from webhook
      const event = await this.stripeService.constructWebhookEvent(
        req.body,
        signature
      );

      console.log(`[StripeWebhook] Received event: ${event.type}`);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object);
          break;

        default:
          console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[StripeWebhook] Error processing webhook:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        error: 'Webhook processing failed',
        details: errorMessage
      });
    }
  };

  private async handleCheckoutSessionCompleted(session: any) {
    const metadata = session.metadata;
    const type = metadata?.type;
    const workspaceId = metadata?.workspace_id;

    if (!workspaceId) {
      console.error('[StripeWebhook] No workspace_id in checkout session metadata');
      return;
    }

    console.log(`[StripeWebhook] Checkout session completed for workspace ${workspaceId}, type: ${type}`);

    if (type === 'subscription') {
      // Subscription checkout completed
      const tier = metadata.tier as SubscriptionTier;
      const subscriptionId = session.subscription;

      if (!subscriptionId) {
        console.error('[StripeWebhook] No subscription ID in checkout session');
        return;
      }

      // Update workspace with new subscription
      // The subscription status will be handled by customer.subscription.created/updated events
      console.log(`[StripeWebhook] Subscription checkout completed: ${tier} for workspace ${workspaceId}`);
    } else if (type === 'credit_purchase') {
      // Credit purchase checkout completed
      const credits = parseInt(metadata.credits, 10);
      const amount = session.amount_total / 100; // Convert from cents
      const paymentIntentId = session.payment_intent;

      console.log(`[StripeWebhook] Processing credit purchase:`, {
        credits,
        amount,
        paymentIntentId,
        workspaceId,
        metadata
      });

      if (!credits || !paymentIntentId) {
        console.error('[StripeWebhook] Missing credits or payment_intent in checkout session', {
          credits,
          paymentIntentId,
          metadata
        });
        return;
      }

      // Add purchased credits to workspace
      try {
        await this.purchaseCreditsUseCase.confirmPurchase(
          paymentIntentId,
          workspaceId,
          credits,
          amount
        );
        console.log(`[StripeWebhook] ✅ Credit purchase completed: ${credits} credits for workspace ${workspaceId}`);
      } catch (error) {
        console.error('[StripeWebhook] ❌ Error confirming credit purchase:', error);
        throw error;
      }
    }
  }

  private async handleSubscriptionUpdated(subscription: any) {
    const workspaceId = subscription.metadata?.workspace_id;
    if (!workspaceId) {
      console.error('[StripeWebhook] No workspace_id in subscription metadata');
      return;
    }

    const tier = this.getTierFromPriceId(subscription.items.data[0].price.id);
    const status = this.mapStripeStatus(subscription.status);

    await this.workspaceRepository.updateSubscription(
      workspaceId,
      tier,
      status,
      subscription.id
    );

    // Update billing period
    const start = new Date(subscription.current_period_start * 1000);
    const end = new Date(subscription.current_period_end * 1000);
    await this.workspaceRepository.updateBillingPeriod(workspaceId, start, end);

    console.log(`[StripeWebhook] Updated subscription for workspace ${workspaceId}: ${tier} (${status})`);
  }

  private async handleSubscriptionDeleted(subscription: any) {
    const workspaceId = subscription.metadata?.workspace_id;
    if (!workspaceId) {
      console.error('[StripeWebhook] No workspace_id in subscription metadata');
      return;
    }

    // Downgrade to free tier
    await this.workspaceRepository.updateSubscription(
      workspaceId,
      'free',
      'canceled',
      undefined
    );

    console.log(`[StripeWebhook] Subscription canceled for workspace ${workspaceId}`);
  }

  private async handleInvoicePaymentSucceeded(invoice: any) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const workspaceId = invoice.metadata?.workspace_id;
    if (!workspaceId) {
      console.error('[StripeWebhook] No workspace_id in invoice metadata');
      return;
    }

    // Reset monthly credits on successful payment
    await this.workspaceRepository.resetMonthlyCredits(workspaceId);

    console.log(`[StripeWebhook] Invoice paid for workspace ${workspaceId}, credits reset`);
  }

  private async handlePaymentIntentSucceeded(paymentIntent: any) {
    const metadata = paymentIntent.metadata;

    console.log('[StripeWebhook] Payment intent succeeded:', {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata
    });

    // Check if this is a credit purchase
    if (metadata?.type === 'credit_purchase') {
      const workspaceId = metadata.workspace_id;
      const credits = parseInt(metadata.credits, 10);
      const amount = paymentIntent.amount / 100; // Convert from cents

      console.log(`[StripeWebhook] Processing payment intent credit purchase:`, {
        workspaceId,
        credits,
        amount,
        paymentIntentId: paymentIntent.id
      });

      if (!workspaceId || !credits) {
        console.error('[StripeWebhook] Missing workspace_id or credits in payment intent metadata', {
          workspaceId,
          credits,
          metadata
        });
        return;
      }

      // Add purchased credits to workspace
      try {
        await this.purchaseCreditsUseCase.confirmPurchase(
          paymentIntent.id,
          workspaceId,
          credits,
          amount
        );
        console.log(`[StripeWebhook] ✅ Credit purchase completed via payment intent: ${credits} credits for workspace ${workspaceId}`);
      } catch (error) {
        console.error('[StripeWebhook] ❌ Error confirming credit purchase via payment intent:', error);
        throw error;
      }
    } else {
      console.log('[StripeWebhook] Payment intent succeeded but not a credit purchase (metadata.type:', metadata?.type, ')');
    }
  }

  private async handleInvoicePaymentFailed(invoice: any) {
    const workspaceId = invoice.metadata?.workspace_id;
    if (!workspaceId) {
      console.error('[StripeWebhook] No workspace_id in invoice metadata');
      return;
    }

    // Update subscription status to past_due
    await this.workspaceRepository.updateSubscription(
      workspaceId,
      'free', // Keep current tier
      'past_due',
      invoice.subscription
    );

    console.log(`[StripeWebhook] Payment failed for workspace ${workspaceId}, status set to past_due`);
  }

  private getTierFromPriceId(priceId: string): SubscriptionTier {
    const basicPriceId = process.env.STRIPE_BASIC_PRICE_ID;
    const proPriceId = process.env.STRIPE_PRO_PRICE_ID;

    if (priceId === basicPriceId) return 'basic';
    if (priceId === proPriceId) return 'pro';

    return 'free';
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'active': 'active',
      'past_due': 'past_due',
      'canceled': 'canceled',
      'unpaid': 'past_due',
      'trialing': 'trialing'
    };

    return statusMap[stripeStatus] || 'canceled';
  }
}
