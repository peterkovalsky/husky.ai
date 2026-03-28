import { ProjectTemplate } from '../../domain/entities/Project';

export interface MergeResult {
  mergedFileTree: Record<string, string>;
  addedFiles: string[];
  modifiedFiles: string[];
  preservedFiles: string[];
}

// Files that should never be deleted by AI (per template)
const REACT_PROTECTED_FILES = [
  'eslint.config.js',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'src/vite-env.d.ts',
];

const ASTRO_PROTECTED_FILES = [
  'astro.config.mjs',
  'tsconfig.json',
];

function getProtectedFiles(template: ProjectTemplate): string[] {
  return template === 'astro-website' ? ASTRO_PROTECTED_FILES : REACT_PROTECTED_FILES;
}

export class FileTreeMerger {
  /**
   * Merges AI response file tree with the current file tree from last successful build
   * @param currentFileTree - File tree from last successful build (or template for new projects)
   * @param aiResponseFileTree - New file tree from AI response
   * @param template - Project template type (determines protected files)
   * @returns Merged file tree with tracking of changes
   */
  static merge(
    currentFileTree: Record<string, string>,
    aiResponseFileTree: Record<string, string>,
    template: ProjectTemplate = 'react18-ts'
  ): MergeResult {
    const mergedFileTree: Record<string, string> = { ...currentFileTree };
    const addedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const preservedFiles: string[] = [];

    // Track which files from current tree are preserved
    for (const filePath of Object.keys(currentFileTree)) {
      if (!(filePath in aiResponseFileTree)) {
        preservedFiles.push(filePath);
      }
    }

    // Apply changes from AI response
    for (const [filePath, content] of Object.entries(aiResponseFileTree)) {
      // Handle file deletion (content === '__DELETE__')
      if (content === '__DELETE__') {
        // Prevent deletion of protected files
        const protectedFiles = getProtectedFiles(template);
        if (protectedFiles.includes(filePath)) {
          console.warn(`[FileTreeMerger] Blocked deletion of protected file: ${filePath}`);
          continue;
        }
        delete mergedFileTree[filePath];
        continue;
      }

      // Special handling for package.json - merge dependencies instead of replace
      if (filePath === 'package.json' && filePath in currentFileTree) {
        const mergedPackageJson = this.mergePackageJson(currentFileTree[filePath], content);
        if (mergedPackageJson !== currentFileTree[filePath]) {
          mergedFileTree[filePath] = mergedPackageJson;
          modifiedFiles.push(filePath);
        }
        continue;
      }

      if (filePath in currentFileTree) {
        // File exists in current tree - check if content changed
        if (currentFileTree[filePath] !== content) {
          mergedFileTree[filePath] = content;
          modifiedFiles.push(filePath);
        }
        // If content is same, it's already in mergedFileTree from spread
      } else {
        // New file from AI response
        mergedFileTree[filePath] = content;
        addedFiles.push(filePath);
      }
    }

    return {
      mergedFileTree,
      addedFiles,
      modifiedFiles,
      preservedFiles
    };
  }

  /**
   * Merge package.json: AI controls dependencies, template controls devDependencies
   * - Preserves: name, version, scripts, devDependencies (from template)
   * - Replaces: dependencies entirely from AI (can add, remove, upgrade, downgrade)
   */
  private static mergePackageJson(currentContent: string, aiContent: string): string {
    try {
      const current = JSON.parse(currentContent);
      const ai = JSON.parse(aiContent);

      // Start with current package.json (preserves name, version, scripts)
      const merged = { ...current };

      // Replace dependencies entirely with AI's version
      // AI controls what runtime packages the app needs
      if (ai.dependencies) {
        merged.dependencies = { ...ai.dependencies };
      }

      // Keep devDependencies from template (build tools should stay stable)
      // Don't let AI modify these
      merged.devDependencies = { ...current.devDependencies };

      return JSON.stringify(merged, null, 2);
    } catch (error) {
      console.warn('[FileTreeMerger] Failed to merge package.json, using AI version:', error);
      return aiContent;
    }
  }

  /**
   * Logs merge statistics for debugging
   */
  static logMergeStats(result: MergeResult): void {
    console.log(`File merge completed:
      - Added: ${result.addedFiles.length} files
      - Modified: ${result.modifiedFiles.length} files  
      - Preserved: ${result.preservedFiles.length} files
      - Total: ${Object.keys(result.mergedFileTree).length} files`);

    if (result.addedFiles.length > 0) {
      console.log(`Added files: ${result.addedFiles.join(', ')}`);
    }
    if (result.modifiedFiles.length > 0) {
      console.log(`Modified files: ${result.modifiedFiles.join(', ')}`);
    }
  }
}