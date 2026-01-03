import { IAIProvider, AIGenerationRequest, AIProviderResponse } from '../../domain/services/IAIProvider';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { FencedBlockParser } from '../../shared/utils/FencedBlockParser';
import { CostCalculator } from '../../shared/utils/CostCalculator';

/**
 * Base class for AI providers
 * Handles common functionality like logging, response parsing, and cost calculation
 * Subclasses only need to implement the actual API call
 */
export abstract class BaseAIProvider implements IAIProvider {
  protected buildLogger: BuildLogger;
  protected aiLogRepository: IAILogRepository;

  constructor(aiLogRepository: IAILogRepository) {
    this.buildLogger = new BuildLogger();
    this.aiLogRepository = aiLogRepository;
  }

  /**
   * Main entry point - handles logging and delegates to provider-specific implementation
   */
  async generateResponse(request: AIGenerationRequest): Promise<AIProviderResponse> {
    const startTime = Date.now();

    // Validate model
    if (!this.getSupportedModels().includes(request.model)) {
      console.warn(`[${this.getName()}Provider] Model ${request.model} not in supported list, using anyway`);
    }

    console.log(`[${this.getName()}Provider] Starting generateResponse with model: ${request.model}...`);

    if (request.mediaUrls && request.mediaUrls.length > 0) {
      console.log(`[${this.getName()}Provider] Including ${request.mediaUrls.length} images in AI request`);
    }

    // Log the prompt to file
    if (request.buildId && request.projectId) {
      this.buildLogger.logUserPrompt(request.projectId, request.buildId, {
        userRequest: request.userPrompt,
        fileTreeSize: request.fileTreeContent.split('\n').length,
        mediaUrls: request.mediaUrls,
        fullPromptLength: request.userPrompt.length,
        promptPreview: request.userPrompt.substring(0, 500)
      });
    }

    // Call provider-specific implementation
    const response = await this.callAPI(request, startTime);

    // Calculate duration and cost
    const durationMs = Date.now() - startTime;
    const cost = CostCalculator.calculateCost(
      request.model,
      response.usage.inputTokens,
      response.usage.outputTokens
    );

    // Log to ai_logs table
    try {
      await this.aiLogRepository.create({
        provider: this.getName(),
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: cost,
        durationMs: durationMs,
        projectId: request.projectId,
        buildId: request.buildId,
        userId: request.userId,
        prompt: request.userPrompt,
        systemPrompt: request.systemPrompt,
        aiResponse: response.rawContent
      });
      console.log(`[${this.getName()}Provider] Logged AI execution to ai_logs table (model: ${request.model}, cost: $${cost.toFixed(6)})`);
    } catch (error) {
      console.error(`[${this.getName()}Provider] CRITICAL: Failed to log to ai_logs table:`, error);
    }

    // Log AI response to file
    if (request.buildId && request.projectId) {
      this.buildLogger.logAIResponse(request.projectId, request.buildId, response.rawContent);
      this.buildLogger.logAIMetadata(request.projectId, request.buildId, {
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        responseLength: response.rawContent.length,
        mediaUrls: request.mediaUrls
      });
    }

    // Parse fenced block response and build result
    const changes = this.extractFiles(response.rawContent);
    const responseData = {
      changes,
      message: `AI processing completed successfully.`,
    };

    return {
      content: JSON.stringify(responseData),
      rawContent: response.rawContent,
      model: request.model,
      usage: response.usage,
      durationMs,
      systemPrompt: request.systemPrompt
    };
  }

  /**
   * Extract files from AI response in fenced block format
   * Includes sanitization to strip any thinking/planning text outside file blocks
   */
  protected extractFiles(content: string): Record<string, string> {
    if (!FencedBlockParser.isFencedFormat(content)) {
      throw new Error(`AI response is not in fenced block format. Expected <<<FILE:...>>> blocks. Content preview: ${content.substring(0, 300)}...`);
    }

    // Step 1: Sanitize - strip any non-file-block content (thinking, planning, etc.)
    const { sanitized, strippedChars, hadExtraContent, orphanEndTags } = FencedBlockParser.sanitize(content);
    if (hadExtraContent) {
      console.warn(`[${this.getName()}Provider] Stripped ${strippedChars} chars of non-file-block content from AI response`);
    }
    if (orphanEndTags > 0) {
      console.warn(`[${this.getName()}Provider] Found ${orphanEndTags} orphan <<<END>>> tag(s) in AI response`);
    }

    // Step 2: Deduplicate - keep only the last occurrence of each file path
    const deduplicated = FencedBlockParser.deduplicate(sanitized);

    // Step 3: Validate the cleaned content
    const validation = FencedBlockParser.validate(deduplicated);

    if (validation.valid) {
      console.log(`[${this.getName()}Provider] Parsed ${validation.fileCount} files from fenced block format`);
      return FencedBlockParser.parse(deduplicated);
    }

    // Try partial recovery if validation failed
    if (validation.errors.length > 0) {
      console.warn(`[${this.getName()}Provider] Fenced block validation errors:`, validation.errors);
      const partial = FencedBlockParser.parsePartial(deduplicated);

      if (Object.keys(partial.complete).length > 0) {
        console.warn(`[${this.getName()}Provider] Recovered ${Object.keys(partial.complete).length} complete files from partial response`);
        if (partial.incomplete) {
          console.warn(`[${this.getName()}Provider] Incomplete file discarded: ${partial.incomplete.path}`);
        }
        return partial.complete;
      }
    }

    throw new Error(`Failed to parse fenced block response. Errors: ${validation.errors.join(', ')}. Content preview: ${deduplicated.substring(0, 300)}...`);
  }

  /**
   * Provider-specific API call implementation
   * Returns raw response with token usage - base class handles everything else
   */
  protected abstract callAPI(
    request: AIGenerationRequest,
    startTime: number
  ): Promise<{
    rawContent: string;
    usage: { inputTokens: number; outputTokens: number };
  }>;

  abstract getName(): string;
  abstract getSupportedModels(): string[];
}
