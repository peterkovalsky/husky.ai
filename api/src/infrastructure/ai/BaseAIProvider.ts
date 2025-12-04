import { IAIProvider, AIProviderResponse } from '../../domain/services/IAIProvider';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { FileTreeFormatter } from '../../shared/utils/FileTreeFormatter';
import { FencedBlockParser } from '../../shared/utils/FencedBlockParser';

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
   * Extract files from AI response in fenced block format
   * This is the primary parsing method - no JSON fallback needed
   */
  protected extractFiles(content: string): Record<string, string> {
    // Validate fenced block format
    if (!FencedBlockParser.isFencedFormat(content)) {
      throw new Error(`AI response is not in fenced block format. Expected <<<FILE:...>>> blocks. Content preview: ${content.substring(0, 300)}...`);
    }

    const validation = FencedBlockParser.validate(content);

    if (validation.valid) {
      console.log(`[BaseAIProvider] Parsed ${validation.fileCount} files from fenced block format`);
      return FencedBlockParser.parse(content);
    }

    // Try partial recovery if validation failed (e.g., truncated response)
    if (validation.errors.length > 0) {
      console.warn(`[BaseAIProvider] Fenced block validation errors:`, validation.errors);
      const partial = FencedBlockParser.parsePartial(content);

      if (Object.keys(partial.complete).length > 0) {
        console.warn(`[BaseAIProvider] Recovered ${Object.keys(partial.complete).length} complete files from partial response`);
        if (partial.incomplete) {
          console.warn(`[BaseAIProvider] Incomplete file discarded: ${partial.incomplete.path}`);
        }
        return partial.complete;
      }
    }

    throw new Error(`Failed to parse fenced block response. Errors: ${validation.errors.join(', ')}. Content preview: ${content.substring(0, 300)}...`);
  }

  /**
   * Format file tree for inclusion in prompts
   * Uses shared FileTreeFormatter to avoid JSON escaping issues
   */
  protected formatFileTreeForPrompt(fileTree: Record<string, string>): string {
    return FileTreeFormatter.formatForPrompt(fileTree);
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
