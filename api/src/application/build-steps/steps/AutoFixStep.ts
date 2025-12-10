import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IAIService } from '../../../domain/services/IAIService';
import { FileTreeMerger } from '../../../shared/utils/FileTreeMerger';
import { FileTreeFormatter } from '../../../shared/utils/FileTreeFormatter';
import { loadAppConfig } from '../../../shared/config/AppConfig';

/**
 * AutoFixStep: Attempts to automatically fix build errors using AI
 *
 * Responsibilities:
 * - Read build error from context (set by ProcessJobUseCase)
 * - Construct fix prompt with error details and file tree
 * - Call AI to generate fixes (using Haiku for cost efficiency)
 * - Parse AI response and merge fixed files into file tree
 * - Update context.fileTree with corrected code
 * - Mark auto_fix_attempted in database
 *
 * This step only runs conditionally when PreviewBuildStep fails.
 */
export class AutoFixStep implements IBuildStep {
  readonly stepName = 'Auto-Fix';
  readonly stepStatus = BuildStepStatus.BUILDING_PREVIEW; // Keep same status (happens during build)

  constructor(
    private buildRepository: IBuildRepository,
    private aiService: IAIService
  ) {}

  async execute(context: BuildStepContext): Promise<StepResult> {
    const startTime = Date.now();
    const buildId = context.buildId;

    try {
      console.log(`[${this.stepName}] Attempting to auto-fix build error...`);

      // Get build error from context (set by ProcessJobUseCase)
      const buildError = context.getStepData<string>('buildError');
      if (!buildError) {
        throw new Error('Build error not found in context');
      }

      // Get file tree from context
      if (!context.fileTree) {
        throw new Error('File tree not found in context');
      }

      // Mark that auto-fix was attempted
      await this.buildRepository.update(buildId, {
        autoFixAttempted: true,
        errorOutput: buildError
      });

      console.log(`[${this.stepName}] Build error:`, buildError.substring(0, 500) + '...');
      console.log(`[${this.stepName}] Calling AI to generate fixes...`);

      // Build fix prompt for AI
      const fixPrompt = this.buildFixPrompt(buildError, context.fileTree);

      // Call AI to generate fixes (using primary model for better fix quality)
      const config = loadAppConfig();
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        fixPrompt,
        context.buildId,
        config.ai.primary.model // Use primary model for more reliable fixes
      );
      const aiFixTimeMs = Date.now() - aiStartTime;

      console.log(`[${this.stepName}] AI fix generation completed in ${aiFixTimeMs}ms (Model: ${aiResponse.model})`);

      // Extract fixed files from AI response
      // AIService returns already-parsed JSON in content field with changes
      const fixedFiles = this.extractChangesFromResponse(aiResponse.content);

      if (Object.keys(fixedFiles).length === 0) {
        console.warn(`[${this.stepName}] AI returned no fixes`);
        throw new Error('AI could not generate fixes for this error');
      }

      // Merge fixes into current file tree
      console.log(`[${this.stepName}] Merging ${Object.keys(fixedFiles).length} fixed files...`);
      const mergeResult = FileTreeMerger.merge(context.fileTree, fixedFiles);
      FileTreeMerger.logMergeStats(mergeResult);

      // Update context with fixed file tree
      context.fileTree = mergeResult.mergedFileTree;

      // Update build with fixed file tree
      await this.buildRepository.updateFileTree(buildId, mergeResult.mergedFileTree);

      const duration = Date.now() - startTime;
      console.log(`[${this.stepName}] Auto-fix completed in ${duration}ms - ${mergeResult.modifiedFiles.length} files fixed`);

      return {
        success: true,
        metrics: {
          autoFixTimeMs: duration,
          aiFixTimeMs,
          filesFixed: mergeResult.modifiedFiles.length
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${this.stepName}] Failed after ${duration}ms:`, error);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Build prompt for AI to fix the build error
   * Uses plain text format for file content to avoid JSON escaping issues
   */
  private buildFixPrompt(buildError: string, fileTree: Record<string, string>): string {
    // Extract key file paths for context (limit to reasonable size)
    const filePaths = Object.keys(fileTree);
    const sourceFiles = filePaths.filter(
      path => path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.js')
    );

    // Use plain text format to avoid JSON double-escaping issues with quotes
    const formattedFileTree = FileTreeFormatter.formatForPrompt(fileTree);

    return `A React/TypeScript build failed with the following error:

ERROR OUTPUT:
${buildError}

TASK:
Fix the code to resolve this build error. Analyze the error message carefully and make ONLY the necessary changes to fix the issue.

CURRENT PROJECT FILES (${sourceFiles.length} source files):
${formattedFileTree}

IMPORTANT INSTRUCTIONS:
1. Return ONLY the files that need to be changed to fix the error
2. Do NOT modify files that are not related to the error
3. Preserve all existing functionality - only fix the specific error
4. Do NOT rewrite or reformat code that is working correctly

RESPONSE FORMAT - Use fenced blocks (NO escaping needed):

<<<FILE:path/to/file.tsx>>>
complete fixed file content here
<<<END>>>

<<<DELETE:path/to/old-file.ts>>>

CRITICAL RULES:
- JSX syntax (<Component />) can ONLY be used in .tsx or .jsx files, NEVER in .ts files
- If a .ts file contains JSX, you MUST rename it to .tsx (create new .tsx file AND delete the old .ts file)
- When renaming a file, remember to update all imports that reference it
- Prefer template literals (\`...\`) over escaped quotes for strings containing quotes

Focus on common issues:
- JSX in .ts files (must be .tsx) - FIX BY RENAMING: create .tsx and delete .ts
- TypeScript type errors (missing types, incorrect props, type mismatches)
- Import/export errors (wrong paths, missing imports, circular dependencies)
- Syntax errors (invalid JSX, parsing errors)
- Missing dependencies in package.json

Return your response now using fenced blocks.`;
  }

  /**
   * Extract changes from AIService response
   * AIService returns JSON with already-parsed changes from fenced block format
   */
  private extractChangesFromResponse(content: string): Record<string, string> {
    try {
      const responseData = JSON.parse(content);

      if (!responseData.changes || typeof responseData.changes !== 'object') {
        throw new Error('AI response missing changes object');
      }

      // Filter out __DELETE__ markers - those are for CodeGenerationStep file tree updates
      // For auto-fix, we only care about actual file content changes
      const fixes: Record<string, string> = {};
      for (const [path, content] of Object.entries(responseData.changes)) {
        if (content !== '__DELETE__' && typeof content === 'string') {
          fixes[path] = content;
        }
      }

      console.log(`[AutoFixStep] Extracted ${Object.keys(fixes).length} fixed files from AI response`);
      return fixes;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response as JSON. Content preview: ${content.substring(0, 300)}...`);
      }
      throw error;
    }
  }
}
