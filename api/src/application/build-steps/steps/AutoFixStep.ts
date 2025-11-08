import { IBuildStep, StepResult, BuildStepStatus } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';
import { IAIService } from '../../../domain/services/IAIService';
import { FileTreeMerger } from '../../../shared/utils/FileTreeMerger';

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

      // Call AI to generate fixes (using Haiku for speed and cost)
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        fixPrompt,
        context.promptId,
        true // Use Haiku for fast, cheap fixes
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
   */
  private buildFixPrompt(buildError: string, fileTree: Record<string, string>): string {
    // Extract key file paths for context (limit to reasonable size)
    const filePaths = Object.keys(fileTree);
    const sourceFiles = filePaths.filter(
      path => path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.js')
    );

    return `A React/TypeScript build failed with the following error:

ERROR OUTPUT:
${buildError}

TASK:
Fix the code to resolve this build error. Analyze the error message carefully and make ONLY the necessary changes to fix the issue.

CURRENT PROJECT FILES (${sourceFiles.length} source files):
${JSON.stringify(fileTree, null, 2)}

IMPORTANT INSTRUCTIONS:
1. Return ONLY the files that need to be changed to fix the error
2. Do not modify files that are not related to the error
3. Preserve all existing functionality - only fix the specific error
4. Return the response in this exact JSON format:
{
  "fileTree": {
    "path/to/file.tsx": "fixed file content",
    "another/file.ts": "another fixed file content"
  }
}

Focus on common issues:
- TypeScript type errors (missing types, incorrect props, type mismatches)
- Import/export errors (wrong paths, missing imports, circular dependencies)
- Syntax errors (invalid JSX, parsing errors)
- Missing dependencies in package.json

Return your response now in the JSON format specified above.`;
  }

  /**
   * Parse AI response to extract fixed files
   */
  private parseAIResponse(aiContent: string): Record<string, string> {
    try {
      const parsed = JSON.parse(aiContent);

      if (parsed.fileTree && typeof parsed.fileTree === 'object') {
        return parsed.fileTree;
      }

      throw new Error('No fileTree found in AI response');
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.fileTree && typeof parsed.fileTree === 'object') {
            return parsed.fileTree;
          }
        } catch {
          // Fall through to error
        }
      }

      throw new Error('Failed to parse AI response: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
    }
  }
}
