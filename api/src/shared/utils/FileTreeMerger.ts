export interface MergeResult {
  mergedFileTree: Record<string, string>;
  addedFiles: string[];
  modifiedFiles: string[];
  preservedFiles: string[];
}

export class FileTreeMerger {
  /**
   * Merges AI response file tree with the current file tree from last successful build
   * @param currentFileTree - File tree from last successful build (or template for new projects)
   * @param aiResponseFileTree - New file tree from AI response
   * @returns Merged file tree with tracking of changes
   */
  static merge(
    currentFileTree: Record<string, string>,
    aiResponseFileTree: Record<string, string>
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