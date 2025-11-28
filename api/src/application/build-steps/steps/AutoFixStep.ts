import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IAIService } from '../../../domain/services/IAIService';
import { FileTreeMerger } from '../../../shared/utils/FileTreeMerger';
import { FileTreeFormatter } from '../../../shared/utils/FileTreeFormatter';

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
    const buildId = context.requireBuildId();

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

      // Call AI to generate fixes (using Sonnet for better fix quality)
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        fixPrompt,
        context.promptId,
        false // Use Sonnet for more reliable fixes
      );
      const aiFixTimeMs = Date.now() - aiStartTime;

      console.log(`[${this.stepName}] AI fix generation completed in ${aiFixTimeMs}ms (Model: ${aiResponse.model})`);

      // Parse AI response
      const fixedFiles = this.parseAIResponse(aiResponse.content);

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
5. To DELETE a file (e.g., when renaming), set its value to "__DELETE__"
6. Return the response as JSON with file paths as keys and COMPLETE file content as values:
{
  "path/to/file.tsx": "complete fixed file content here",
  "old/file/to/delete.ts": "__DELETE__"
}

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

Return your response now as JSON.`;
  }

  /**
   * Parse AI response to extract fixed files
   * Handles both flat format {"file.tsx": "content"} and wrapped format {"fileTree": {...}}
   */
  private parseAIResponse(aiContent: string): Record<string, string> {
    // Try to extract JSON from the response
    let parsed: any;

    try {
      parsed = JSON.parse(aiContent);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          // Continue to brace extraction
        }
      }

      // Try to extract JSON by finding outermost braces
      if (!parsed) {
        const firstBrace = aiContent.indexOf('{');
        const lastBrace = aiContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(aiContent.slice(firstBrace, lastBrace + 1));
          } catch {
            throw new Error('Failed to parse AI response as JSON');
          }
        }
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI response is not a valid JSON object');
    }

    // Handle wrapped fileTree format (backwards compatibility)
    if (parsed.fileTree && typeof parsed.fileTree === 'object') {
      return parsed.fileTree;
    }

    // Handle flat format: {"file.tsx": "content", ...}
    // Verify it looks like a file tree (keys should be file paths)
    const keys = Object.keys(parsed);
    if (keys.length > 0 && keys.some(key => key.includes('/') || key.includes('.'))) {
      return parsed;
    }

    throw new Error('AI response does not contain valid file tree structure');
  }
}
