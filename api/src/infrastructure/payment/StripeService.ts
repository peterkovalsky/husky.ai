import Stripe from 'stripe';
import { IStripeService } from '../../domain/services/IStripeService';
import { SubscriptionTier } from '../../domain/entities/Workspace';

export class StripeService implements IStripeService {
  private stripe: Stripe;

  // Product price IDs should be configured in Stripe dashboard
  private readonly PRICE_IDS: Record<SubscriptionTier, string> = {
    free: '', // No price for free tier
    basic: process.env.STRIPE_BASIC_PRICE_ID || '',
    pro: process.env.STRIPE_PRO_PRICE_ID || ''
  };

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new Error('Missing Stripe configuration: STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-10-29.clover'
    });
  }

  async createCustomer(workspaceId: string, email: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        workspace_id: workspaceId
      }
    });

    return customer.id;
  }

  async updateCustomerEmail(customerId: string, email: string): Promise<void> {
    await this.stripe.customers.update(customerId, {
      email
    });
  }

  async createSubscription(customerId: string, tier: SubscriptionTier): Promise<string> {
    if (tier === 'free') {
      throw new Error('Cannot create subscription for free tier');
    }

    const priceId = this.PRICE_IDS[tier];
    if (!priceId) {
      throw new Error(`Price ID not configured for tier: ${tier}`);
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent']
    });

    return subscription.id;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(subscriptionId: string, tier: SubscriptionTier): Promise<void> {
    if (tier === 'free') {
      await this.cancelSubscription(subscriptionId);
      return;
    }

    const priceId = this.PRICE_IDS[tier];
    if (!priceId) {
      throw new Error(`Price ID not configured for tier: ${tier}`);
    }

    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

    await this.stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId
      }],
      proration_behavior: 'create_prorations'
    });
  }

  async createPaymentIntent(
    amount: number,
    customerId: string,
    metadata: Record<string, string>
  ): Promise<string> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true
      }
    });

    return paymentIntent.client_secret!;
  }

  async createSubscriptionCheckoutSession(
    customerId: string,
    tier: SubscriptionTier,
    workspaceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    if (tier === 'free') {
      throw new Error('Cannot create checkout session for free tier');
    }

    const priceId = this.PRICE_IDS[tier];
    if (!priceId) {
      throw new Error(`Price ID not configured for tier: ${tier}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        workspace_id: workspaceId,
        tier: tier,
        type: 'subscription'
      },
    });

    return session.url!;
  }

  async createCreditPurchaseCheckoutSession(
    customerId: string,
    credits: number,
    amount: number,
    workspaceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} Credits`,
              description: 'Additional credits for Husky AI',
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        workspace_id: workspaceId,
        credits: credits.toString(),
        type: 'credit_purchase'
      },
      payment_intent_data: {
        metadata: {
          workspace_id: workspaceId,
          credits: credits.toString(),
          type: 'credit_purchase'
        }
      }
    });

    return session.url!;
  }

  async constructWebhookEvent(payload: string | Buffer, signature: string): Promise<any> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('Missing Stripe configuration: STRIPE_WEBHOOK_SECRET is required');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
      return event;
    } catch (error: any) {
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }
}
