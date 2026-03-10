/**
 * Parser for fenced block format used in AI file exchange
 *
 * Format:
 * <<<FILE:path/to/file.tsx>>>
 * file content here
 * <<<END>>>
 *
 * <<<DELETE:path/to/delete.tsx>>>
 *
 * Benefits over JSON:
 * - Zero escaping needed - code is written exactly as it should appear
 * - Partial recovery possible from truncated responses
 * - Clear structure prevents prose contamination
 * - Human readable
 */
export class FencedBlockParser {
  private static readonly FILE_PATTERN = /<<<FILE:(.+?)>>>\n([\s\S]*?)\n?<<<END>>>/g;
  private static readonly DELETE_PATTERN = /<<<DELETE:(.+?)>>>/g;

  /**
   * Protected files that cannot be overwritten or deleted by AI
   * These are managed by the build system
   */
  private static readonly PROTECTED_FILES = new Set([
    'src/main.tsx',
    'src/vite-env.d.ts',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'postcss.config.js',
    'eslint.config.js',
  ]);

  /**
   * Check if a file path is protected
   */
  static isProtected(filePath: string): boolean {
    const normalized = filePath.replace(/^\.?\//, ''); // Remove leading ./ or /
    return this.PROTECTED_FILES.has(normalized);
  }

  /**
   * Sanitize AI response by extracting only fenced blocks
   * Strips any thinking/planning text that appears outside file blocks
   * This is a safety net for AI models that leak reasoning into output
   */
  static sanitize(content: string): { sanitized: string; strippedChars: number; hadExtraContent: boolean; orphanEndTags: number } {
    const blocks: string[] = [];
    let totalBlockChars = 0;

    // Extract all FILE blocks (preserving order)
    const fileMatches = [...content.matchAll(this.FILE_PATTERN)];
    for (const match of fileMatches) {
      const block = match[0];
      blocks.push(block);
      totalBlockChars += block.length;
    }

    // Extract all DELETE blocks
    const deleteMatches = [...content.matchAll(this.DELETE_PATTERN)];
    for (const match of deleteMatches) {
      const block = match[0];
      blocks.push(block);
      totalBlockChars += block.length;
    }

    // Count orphan END tags (END tags not matched with FILE blocks)
    const totalEndTags = (content.match(/<<<END>>>/g) || []).length;
    const matchedEndTags = fileMatches.length; // Each FILE match includes its END
    const orphanEndTags = totalEndTags - matchedEndTags;

    // Reconstruct with only the blocks
    const sanitized = blocks.join('\n\n');
    const strippedChars = content.length - totalBlockChars;
    const hadExtraContent = strippedChars > 100; // Allow small whitespace differences

    return {
      sanitized,
      strippedChars,
      hadExtraContent,
      orphanEndTags
    };
  }

  /**
   * Deduplicate files - if same path appears multiple times, keep the last occurrence
   * This handles AI models that output the same file multiple times with revisions
   */
  static deduplicate(content: string): string {
    const fileMap = new Map<string, string>();
    const deleteSet = new Set<string>();

    // Process FILE blocks - later occurrences override earlier ones
    for (const match of content.matchAll(this.FILE_PATTERN)) {
      const filePath = match[1].trim();
      const fullBlock = match[0];
      fileMap.set(filePath, fullBlock);
    }

    // Process DELETE blocks
    for (const match of content.matchAll(this.DELETE_PATTERN)) {
      const filePath = match[1].trim();
      deleteSet.add(filePath);
      // If we have a FILE for this path, the DELETE takes precedence if it comes after
      // For simplicity, we'll keep both - the delete marker will be processed
    }

    // Reconstruct: FILE blocks + DELETE blocks
    const blocks: string[] = [...fileMap.values()];
    for (const deletePath of deleteSet) {
      blocks.push(`<<<DELETE:${deletePath}>>>`);
    }

    return blocks.join('\n\n');
  }

  /**
   * Parse fenced block response into file tree
   * Protected files are automatically filtered out
   */
  static parse(content: string): Record<string, string> {
    const files: Record<string, string> = {};
    const blocked: string[] = [];

    // Extract file blocks
    for (const match of content.matchAll(this.FILE_PATTERN)) {
      const filePath = match[1].trim();
      if (this.isProtected(filePath)) {
        blocked.push(filePath);
        continue;
      }
      const fileContent = match[2];
      files[filePath] = fileContent;
    }

    // Extract delete markers
    for (const match of content.matchAll(this.DELETE_PATTERN)) {
      const filePath = match[1].trim();
      if (this.isProtected(filePath)) {
        blocked.push(filePath);
        continue;
      }
      files[filePath] = '__DELETE__';
    }

    if (blocked.length > 0) {
      console.warn(`[FencedBlockParser] Blocked ${blocked.length} protected file(s): ${blocked.join(', ')}`);
    }

    return files;
  }

  /**
   * Format file tree as fenced blocks for AI input
   */
  static format(fileTree: Record<string, string>): string {
    return Object.entries(fileTree)
      .map(([path, content]) => {
        if (content === '__DELETE__') {
          return `<<<DELETE:${path}>>>`;
        }
        return `<<<FILE:${path}>>>\n${content}\n<<<END>>>`;
      })
      .join('\n\n');
  }

  /**
   * Validate that content contains valid fenced blocks
   */
  static validate(content: string): { valid: boolean; fileCount: number; errors: string[] } {
    const errors: string[] = [];
    let fileCount = 0;

    // Check for unclosed FILE blocks
    const fileStarts = (content.match(/<<<FILE:.+?>>>/g) || []).length;
    const fileEnds = (content.match(/<<<END>>>/g) || []).length;

    if (fileStarts !== fileEnds) {
      errors.push(`Mismatched FILE/END tags: ${fileStarts} FILE tags, ${fileEnds} END tags`);
    }

    // Count valid files
    for (const _ of content.matchAll(this.FILE_PATTERN)) {
      fileCount++;
    }

    // Count deletes
    for (const _ of content.matchAll(this.DELETE_PATTERN)) {
      fileCount++;
    }

    return {
      valid: errors.length === 0 && fileCount > 0,
      fileCount,
      errors
    };
  }

  /**
   * Extract partial results from incomplete response
   * Useful for recovering from truncated AI responses
   * Protected files are automatically filtered out
   */
  static parsePartial(content: string): {
    complete: Record<string, string>;
    incomplete: { path: string; partialContent: string } | null;
  } {
    const complete: Record<string, string> = {};
    let incomplete: { path: string; partialContent: string } | null = null;

    // Get complete blocks (skip protected files)
    for (const match of content.matchAll(this.FILE_PATTERN)) {
      const filePath = match[1].trim();
      if (!this.isProtected(filePath)) {
        complete[filePath] = match[2];
      }
    }

    // Get deletes (skip protected files)
    for (const match of content.matchAll(this.DELETE_PATTERN)) {
      const filePath = match[1].trim();
      if (!this.isProtected(filePath)) {
        complete[filePath] = '__DELETE__';
      }
    }

    // Check for incomplete block at end
    const lastFileStart = content.lastIndexOf('<<<FILE:');
    const lastEnd = content.lastIndexOf('<<<END>>>');

    if (lastFileStart > lastEnd) {
      // There's an unclosed FILE block
      const pathMatch = content.slice(lastFileStart).match(/<<<FILE:(.+?)>>>/);
      if (pathMatch) {
        const afterTag = content.indexOf('>>>', lastFileStart) + 3;
        const partialContent = content.slice(afterTag).trim();
        incomplete = {
          path: pathMatch[1].trim(),
          partialContent
        };
      }
    }

    return { complete, incomplete };
  }

  /**
   * Check if content appears to be in fenced block format
   */
  static isFencedFormat(content: string): boolean {
    return content.includes('<<<FILE:') || content.includes('<<<DELETE:');
  }
}
