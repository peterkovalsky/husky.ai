import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { IAIProvider, AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { CostCalculator } from '../../shared/utils/CostCalculator';
import { getSystemPrompt } from './prompts/SystemPrompt';
import { FileTreeFormatter } from '../../shared/utils/FileTreeFormatter';

/**
 * AIService orchestrator
 * Handles all business logic including:
 * - File tree management
 * - Prompt construction
 * - Provider selection
 * - Response processing
 *
 * Delegates only the API communication to providers
 */
export class AIService implements IAIService {
  private providers: Map<string, IAIProvider> = new Map();
  private promptRepository: IPromptRepository;
  private aiLogRepository: IAILogRepository;

  // File tree state management
  private currentFileTree: Record<string, string> = {};
  private currentProjectId: string = '';
  private currentBuildId: string = '';

  constructor(
    providers: IAIProvider[],
    promptRepository: IPromptRepository,
    aiLogRepository: IAILogRepository
  ) {
    // Register all providers by name
    for (const provider of providers) {
      this.providers.set(provider.getName(), provider);
    }
    this.promptRepository = promptRepository;
    this.aiLogRepository = aiLogRepository;
  }

  /**
   * Get the appropriate provider for a given model
   */
  private getProviderForModel(model: string): IAIProvider {
    // Route based on model name prefix
    if (model.startsWith('gemini-')) {
      const provider = this.providers.get('gemini');
      if (provider) return provider;
    } else if (model.startsWith('claude-')) {
      const provider = this.providers.get('anthropic');
      if (provider) return provider;
    } else if (model.startsWith('gpt-')) {
      const provider = this.providers.get('openai');
      if (provider) return provider;
    }

    // Fallback: try to find any provider that supports this model
    for (const provider of this.providers.values()) {
      if (provider.getSupportedModels().includes(model)) {
        return provider;
      }
    }

    throw new Error(`No provider found for model: ${model}. Available providers: ${Array.from(this.providers.keys()).join(', ')}`);
  }

  async generateResponse(
    prompt: string,
    promptId: string,
    model: string,
    mediaUrls?: string[]
  ): Promise<AIResponse> {
    // Select provider based on model
    const provider = this.getProviderForModel(model);
    console.log(`[AIService] Delegating to ${provider.getName()} provider for model: ${model}...`);

    // Get prompt from database to access user_id
    const promptEntity = await this.promptRepository.findById(promptId);
    if (!promptEntity) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    // Build the request with all business logic handled here
    const request: AIGenerationRequest = {
      userPrompt: prompt,
      systemPrompt: getSystemPrompt(),
      fileTreeContent: FileTreeFormatter.formatForPrompt(this.currentFileTree),
      mediaUrls,
      model,
      userId: promptEntity.userId,
      promptId,
      projectId: this.currentProjectId,
      buildId: this.currentBuildId
    };

    // Delegate to provider (provider only handles API communication)
    const providerResponse = await provider.generateResponse(request);

    // Process response and update file tree
    const responseData = JSON.parse(providerResponse.content);
    if (responseData.changes) {
      this.currentFileTree = this.updateFileTree(responseData.changes);
      // Update response with merged file tree
      responseData.fileTree = this.currentFileTree;
    }

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

    // Return AIResponse format for backward compatibility
    return {
      content: JSON.stringify(responseData),
      rawContent: providerResponse.rawContent,
      model: providerResponse.model,
      usage: providerResponse.usage
    };
  }

  async setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void> {
    this.currentProjectId = projectId;
    this.currentFileTree = fileTree;
    this.currentBuildId = buildId || '';
  }

  getCurrentFileTree(): Record<string, string> {
    return this.currentFileTree;
  }

  /**
   * Update the file tree with changes from AI
   */
  private updateFileTree(changes: Record<string, string>): Record<string, string> {
    const newFileTree = { ...this.currentFileTree };

    for (const [filePath, content] of Object.entries(changes)) {
      if (content === "__DELETE__") {
        delete newFileTree[filePath];
      } else {
        newFileTree[filePath] = content;
      }
    }

    return newFileTree;
  }
}
