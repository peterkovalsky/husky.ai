import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { IAIProvider } from '../../domain/services/IAIProvider';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { CostCalculator } from '../../shared/utils/CostCalculator';

/**
 * AIService orchestrator that manages providers and handles automatic logging
 * This maintains backward compatibility with IAIService while delegating to providers
 */
export class AIService implements IAIService {
  private provider: IAIProvider;
  private promptRepository: IPromptRepository;
  private aiLogRepository: IAILogRepository;

  constructor(
    provider: IAIProvider,
    promptRepository: IPromptRepository,
    aiLogRepository: IAILogRepository
  ) {
    this.provider = provider;
    this.promptRepository = promptRepository;
    this.aiLogRepository = aiLogRepository;
  }

  async generateResponse(
    prompt: string,
    promptId: string,
    useHaiku?: boolean,
    mediaUrls?: string[]
  ): Promise<AIResponse> {
    console.log(`[AIService] Delegating to ${this.provider.getName()} provider...`);

    // Get prompt from database to access user_id (needed for provider logging)
    const promptEntity = await this.promptRepository.findById(promptId);
    if (!promptEntity) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    // Delegate to the selected provider (provider will handle AI log creation)
    const providerResponse = await this.provider.generateResponse(
      prompt,
      promptId,
      promptEntity.userId,
      useHaiku,
      mediaUrls
    );

    // Calculate cost for backward compatibility with prompts table
    const cost = CostCalculator.calculateCost(
      providerResponse.model,
      providerResponse.usage.inputTokens,
      providerResponse.usage.outputTokens
    );

    // === BACKWARD COMPATIBILITY: Update prompts table ===
    try {
      await this.promptRepository.updateRawAiResponse(promptId, providerResponse.rawContent);
      console.log(`[AIService] Stored raw AI response to prompts table for prompt ${promptId}`);
    } catch (error) {
      console.warn(`[AIService] Failed to store raw AI response to prompts table:`, error);
    }

    try {
      await this.promptRepository.updateMetrics(
        promptId,
        providerResponse.usage.inputTokens,
        providerResponse.usage.outputTokens,
        providerResponse.durationMs
      );
      console.log(`[AIService] Stored metrics to prompts table for prompt ${promptId}`);
    } catch (error) {
      console.warn(`[AIService] Failed to store metrics to prompts table:`, error);
    }

    try {
      await this.promptRepository.updateModelAndCost(promptId, providerResponse.model, cost);
      console.log(`[AIService] Stored model and cost to prompts table for prompt ${promptId}`);
    } catch (error) {
      console.warn(`[AIService] Failed to store model and cost to prompts table:`, error);
    }

    // NOTE: AI log creation is now handled directly in the provider after receiving response

    // Return AIResponse format for backward compatibility
    return {
      content: providerResponse.content,
      rawContent: providerResponse.rawContent,
      model: providerResponse.model,
      usage: providerResponse.usage
    };
  }

  async setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void> {
    return this.provider.setProjectContext(projectId, fileTree, buildId);
  }

  getCurrentFileTree(): Record<string, string> {
    return this.provider.getCurrentFileTree();
  }
}
