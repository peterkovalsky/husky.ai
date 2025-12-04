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
  private static readonly FILE_PATTERN = /<<<FILE:(.+?)>>>\n([\s\S]*?)\n<<<END>>>/g;
  private static readonly DELETE_PATTERN = /<<<DELETE:(.+?)>>>/g;

  /**
   * Parse fenced block response into file tree
   */
  static parse(content: string): Record<string, string> {
    const files: Record<string, string> = {};

    // Extract file blocks
    for (const match of content.matchAll(this.FILE_PATTERN)) {
      const filePath = match[1].trim();
      const fileContent = match[2];
      files[filePath] = fileContent;
    }

    // Extract delete markers
    for (const match of content.matchAll(this.DELETE_PATTERN)) {
      const filePath = match[1].trim();
      files[filePath] = '__DELETE__';
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
   */
  static parsePartial(content: string): {
    complete: Record<string, string>;
    incomplete: { path: string; partialContent: string } | null;
  } {
    const complete: Record<string, string> = {};
    let incomplete: { path: string; partialContent: string } | null = null;

    // Get complete blocks
    for (const match of content.matchAll(this.FILE_PATTERN)) {
      complete[match[1].trim()] = match[2];
    }

    // Get deletes
    for (const match of content.matchAll(this.DELETE_PATTERN)) {
      complete[match[1].trim()] = '__DELETE__';
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
