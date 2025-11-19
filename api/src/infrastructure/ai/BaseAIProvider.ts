import { IAIProvider, AIProviderResponse } from '../../domain/services/IAIProvider';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';

/**
 * Base class for AI providers with common file tree management logic
 */
export abstract class BaseAIProvider implements IAIProvider {
  protected currentFileTree: Record<string, string> = {};
  protected buildLogger: BuildLogger;
  protected currentProjectId: string = '';
  protected currentBuildId: string = '';
  protected aiLogRepository: IAILogRepository;

  constructor(aiLogRepository: IAILogRepository) {
    this.buildLogger = new BuildLogger();
    this.aiLogRepository = aiLogRepository;
  }

  /**
   * Get the current file tree
   */
  getCurrentFileTree(): Record<string, string> {
    return this.currentFileTree;
  }

  /**
   * Set the project context for the AI provider
   */
  async setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void> {
    this.currentProjectId = projectId;
    this.currentFileTree = fileTree;
    this.currentBuildId = buildId || '';
  }

  /**
   * Extract JSON from AI response, handling markdown code blocks and explanatory text
   */
  protected extractJSON(content: string): any {
    // Step 1: Try to parse content as-is
    try {
      return JSON.parse(content);
    } catch {
      // Continue to extraction attempts
    }

    // Step 2: Check for markdown code blocks (```json ... ```)
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Continue to next attempt
      }
    }

    // Step 3: Try to extract JSON by finding { and } braces
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonString = content.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(jsonString);

        // Log warning if we had to extract (model didn't follow instructions)
        if (firstBrace > 0 || lastBrace < content.length - 1) {
          console.warn('[BaseAIProvider] AI response contained prose/markdown. First 200 chars:', content.substring(0, 200));
        }

        return parsed;
      } catch (error) {
        throw new Error(`Failed to parse extracted JSON from AI response. Error: ${error instanceof Error ? error.message : 'Unknown'}. Content preview: ${content.substring(0, 300)}...`);
      }
    }

    // If all attempts fail, throw detailed error
    throw new Error(`No valid JSON found in AI response. Response does not contain {...} structure. Content preview: ${content.substring(0, 300)}...`);
  }

  /**
   * Format file tree for inclusion in prompts
   */
  protected formatFileTreeForPrompt(fileTree: Record<string, string>): string {
    return Object.entries(fileTree)
      .map(([path, content]) => {
        return `${path}:\n${content}`;
      })
      .join("\n\n---\n\n");
  }

  /**
   * Normalize AI response changes to handle different formats
   */
  protected normalizeChanges(rawChanges: any): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(rawChanges)) {
      if (content === "__DELETE__") {
        normalized[filePath] = "__DELETE__";
      } else if (typeof content === "string") {
        normalized[filePath] = content;
      } else if (typeof content === "object" && content !== null) {
        // Handle nested object responses
        if ((content as any).__DELETE__ === true) {
          normalized[filePath] = "__DELETE__";
        } else {
          // Convert object to JSON string
          normalized[filePath] = JSON.stringify(content, null, 2);
        }
      } else {
        // Convert other types to string
        normalized[filePath] = String(content);
      }
    }

    return normalized;
  }

  /**
   * Update the file tree with changes from AI
   */
  protected updateFileTree(changes: Record<string, string>): Record<string, string> {
    const newFileTree = { ...this.currentFileTree };

    for (const [filePath, content] of Object.entries(changes)) {
      if (content === "__DELETE__") {
        // Remove file from tree
        delete newFileTree[filePath];
      } else {
        // Update existing file or add new file
        newFileTree[filePath] = content;
      }
    }

    return newFileTree;
  }

  /**
   * Abstract method to generate AI response - must be implemented by subclasses
   */
  abstract generateResponse(
    userRequest: string,
    promptId: string,
    userId: string,
    useHaiku?: boolean,
    mediaUrls?: string[]
  ): Promise<AIProviderResponse>;

  /**
   * Abstract method to get provider name
   */
  abstract getName(): string;

  /**
   * Abstract method to get supported models
   */
  abstract getSupportedModels(): string[];
}
