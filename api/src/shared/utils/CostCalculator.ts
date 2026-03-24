/**
 * Cost Calculator for AI API usage
 * Based on pricing from:
 * - Claude: https://docs.claude.com/en/docs/about-claude/models/overview
 * - OpenAI: https://openai.com/api/pricing/
 * Prices are per million tokens
 */

interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4.6
  'claude-sonnet-4-6': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
  },
  // Claude Sonnet 4.5
  'claude-sonnet-4-5-20250929': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
  },
  // Claude Haiku 4.5
  'claude-haiku-4-5-20251001': {
    inputPricePerMillion: 1.00,
    outputPricePerMillion: 5.00,
  },
  // Claude Opus 4.1
  'claude-opus-4-1-20250805': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
  },
  // Legacy Models
  'claude-sonnet-4-20250514': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
  },
  'claude-3-7-sonnet-20250219': {
    inputPricePerMillion: 3.00,
    outputPricePerMillion: 15.00,
  },
  'claude-opus-4-20250514': {
    inputPricePerMillion: 15.00,
    outputPricePerMillion: 75.00,
  },
  'claude-3-5-haiku-20241022': {
    inputPricePerMillion: 0.80,
    outputPricePerMillion: 4.00,
  },
  // OpenAI GPT-5.1 Models
  'gpt-5.1': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },
  'gpt-5.1-chat-latest': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },
  // Google Gemini Models
  // Gemini 3.1 Pro Preview - Latest reasoning model
  'gemini-3.1-pro-preview': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 12.00,
  },
  // Gemini 3 Flash Preview - Fast frontier model
  'gemini-3-flash-preview': {
    inputPricePerMillion: 0.50,
    outputPricePerMillion: 3.00,
  },
  // Gemini 3 Pro Preview (deprecated March 9, 2026)
  'gemini-3-pro-preview': {
    inputPricePerMillion: 2.00,
    outputPricePerMillion: 12.00,
  },
  // Gemini 2.5 Pro - State-of-the-art thinking model
  'gemini-2.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 10.00,
  },
  // Gemini 2.5 Flash - Best price-performance
  'gemini-2.5-flash': {
    inputPricePerMillion: 0.30,
    outputPricePerMillion: 2.50,
  },
  // Gemini 2.5 Flash-Lite - Fastest/cheapest
  'gemini-2.5-flash-lite': {
    inputPricePerMillion: 0.10,
    outputPricePerMillion: 0.40,
  },
};

export class CostCalculator {
  /**
   * Calculate the cost in USD for an API request
   * @param model - The model ID used (e.g., 'claude-sonnet-4-6')
   * @param inputTokens - Number of input tokens
   * @param outputTokens - Number of output tokens
   * @returns Cost in USD, or 0 if model pricing is unknown
   */
  static calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model];

    if (!pricing) {
      console.warn(`Unknown model pricing for: ${model}. Cost calculation will return 0.`);
      return 0;
    }

    // Calculate cost: (tokens / 1,000,000) * price per million
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    return parseFloat(totalCost.toFixed(6)); // Round to 6 decimal places
  }

  /**
   * Get the pricing information for a specific model
   * @param model - The model ID
   * @returns Pricing information or null if not found
   */
  static getModelPricing(model: string): ModelPricing | null {
    return MODEL_PRICING[model] || null;
  }

  /**
   * Get all supported models
   * @returns Array of supported model IDs
   */
  static getSupportedModels(): string[] {
    return Object.keys(MODEL_PRICING);
  }
}
