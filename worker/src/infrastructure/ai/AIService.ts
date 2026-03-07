import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { IAIProvider, AIGenerationRequest } from '../../domain/services/IAIProvider';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
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
 * AI execution logs are stored in ai_logs table (via providers)
 */
export class AIService implements IAIService {
  private providers: Map<string, IAIProvider> = new Map();
  private buildRepository: IBuildRepository;
  private aiLogRepository: IAILogRepository;

  // File tree state management
  private currentFileTree: Record<string, string> = {};
  private currentProjectId: string = '';
  private currentBuildId: string = '';

  // Fallback model mappings
  private static readonly FALLBACK_MODELS: Record<string, string> = {
    // Gemini models fallback to Anthropic Sonnet
    'gemini-3-pro-preview': 'claude-sonnet-4-5-20250929',
    'gemini-2.5-pro': 'claude-sonnet-4-5-20250929',
    'gemini-2.5-flash': 'claude-sonnet-4-5-20250929',
    // Anthropic Haiku fallback to Gemini 3
    'claude-haiku-4-5-20251001': 'gemini-3-pro-preview',
  };

  constructor(
    providers: IAIProvider[],
    buildRepository: IBuildRepository,
    aiLogRepository: IAILogRepository
  ) {
    // Register all providers by name
    for (const provider of providers) {
      this.providers.set(provider.getName(), provider);
    }
    this.buildRepository = buildRepository;
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
    buildId: string,
    model: string,
    mediaUrls?: string[],
    annotationMediaUrls?: string[]
  ): Promise<AIResponse> {
    // Get build from database to access project info
    const build = await this.buildRepository.findById(buildId);
    if (!build) {
      throw new Error(`Build not found: ${buildId}`);
    }

    // Try primary model first, then fallback if it fails
    const modelsToTry = [model];
    const fallbackModel = AIService.FALLBACK_MODELS[model];
    if (fallbackModel) {
      modelsToTry.push(fallbackModel);
    }

    let lastError: Error | null = null;

    for (const currentModel of modelsToTry) {
      try {
        const response = await this.tryGenerateWithModel(
          currentModel,
          prompt,
          buildId,
          build,
          mediaUrls,
          annotationMediaUrls,
          currentModel !== model // isFallback
        );
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        // If there's a fallback model available, always try it on any error
        const isLastModel = currentModel === modelsToTry[modelsToTry.length - 1];
        if (!isLastModel) {
          const nextModel = modelsToTry[modelsToTry.indexOf(currentModel) + 1];
          console.warn(`[AIService] ${currentModel} failed: ${errorMessage}`);
          console.log(`[AIService] Falling back to: ${nextModel}`);
          continue;
        }

        // No more fallbacks - throw the error
        throw lastError;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('AI generation failed with no error details');
  }

  /**
   * Attempt to generate response with a specific model
   */
  private async tryGenerateWithModel(
    model: string,
    prompt: string,
    buildId: string,
    build: { userId: string },
    mediaUrls?: string[],
    annotationMediaUrls?: string[],
    isFallback: boolean = false
  ): Promise<AIResponse> {
    // Select provider based on model
    const provider = this.getProviderForModel(model);
    const fallbackLabel = isFallback ? ' (fallback)' : '';
    console.log(`[AIService] Delegating to ${provider.getName()} provider for model: ${model}${fallbackLabel}...`);

    // Build the request with all business logic handled here
    const request: AIGenerationRequest = {
      userPrompt: prompt,
      systemPrompt: getSystemPrompt(),
      fileTreeContent: FileTreeFormatter.formatForPrompt(this.compactForPrompt(this.currentFileTree)),
      mediaUrls,
      annotationMediaUrls,
      model,
      userId: build.userId,
      promptId: buildId, // Use buildId as promptId for AI logging
      projectId: this.currentProjectId,
      buildId: buildId
    };

    // Delegate to provider (provider only handles API communication)
    // Provider automatically logs to ai_logs table
    const providerResponse = await provider.generateResponse(request);

    // Process response and update file tree
    const responseData = JSON.parse(providerResponse.content);

    // Extract __AI_RESPONSE__.md if present
    let aiSummary: string | undefined;
    let aiQuestion: string | undefined;

    if (responseData.changes && responseData.changes['__AI_RESPONSE__.md']) {
      const aiResponseContent = responseData.changes['__AI_RESPONSE__.md'];
      delete responseData.changes['__AI_RESPONSE__.md'];

      // Determine mode: if other code files remain, it's a summary; if empty, it's a question
      const hasCodeFiles = Object.keys(responseData.changes).length > 0;

      if (hasCodeFiles) {
        aiSummary = aiResponseContent;
        console.log(`[AIService] Extracted AI summary: ${aiSummary?.substring(0, 100)}...`);
      } else {
        aiQuestion = aiResponseContent;
        console.log(`[AIService] Extracted AI question (no code files): ${aiQuestion?.substring(0, 100)}...`);
      }
    }

    if (responseData.changes && !aiQuestion) {
      this.currentFileTree = this.updateFileTree(responseData.changes);
      // Update response with merged file tree
      responseData.fileTree = this.currentFileTree;
    }

    // AI metrics are now only logged to ai_logs table (via provider)
    console.log(`[AIService] AI generation completed for build ${buildId} (${providerResponse.model})${fallbackLabel}`);

    // Return AIResponse format
    return {
      content: JSON.stringify(responseData),
      rawContent: providerResponse.rawContent,
      model: providerResponse.model,
      usage: providerResponse.usage,
      aiSummary,
      aiQuestion
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

  /**
   * Compact file tree for AI prompt - replace config files with placeholders
   * AI sees the full file list but only essential content
   * Config files are preserved during merge with full content
   */
  private compactForPrompt(fileTree: Record<string, string>): Record<string, string> {
    // Files to replace with placeholder (AI never modifies these)
    const PLACEHOLDER_FILES: Record<string, string> = {
      'eslint.config.js': '// [ESLint config - do not modify]',
      'vite.config.ts': '// [Vite build config - do not modify]',
      'tsconfig.json': '// [TypeScript config]',
      'tsconfig.app.json': '// [TypeScript config]',
      'tsconfig.node.json': '// [TypeScript config]',
      'postcss.config.js': '// [PostCSS config]',
      'src/vite-env.d.ts': '/// <reference types="vite/client" />',
      // Note: index.html and src/main.tsx kept with full content - users may customize
    };

    const compacted: Record<string, string> = {};

    for (const [path, content] of Object.entries(fileTree)) {
      // Replace config files with placeholder
      if (PLACEHOLDER_FILES[path]) {
        compacted[path] = PLACEHOLDER_FILES[path];
        continue;
      }

      // Keep full content for all other files (package.json, src/*, tailwind.config.js, etc.)
      compacted[path] = content;
    }

    return compacted;
  }
}
