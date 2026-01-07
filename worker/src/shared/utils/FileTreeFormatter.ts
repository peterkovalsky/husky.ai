import { FencedBlockParser } from './FencedBlockParser';

/**
 * Utility for formatting file trees for inclusion in AI prompts
 * Uses fenced block format to eliminate all escaping issues
 */
export class FileTreeFormatter {
  /**
   * Format file tree for inclusion in prompts using fenced block format
   *
   * Output format:
   * ```
   * <<<FILE:src/App.tsx>>>
   * import React from 'react';
   * ...
   * <<<END>>>
   *
   * <<<FILE:src/components/Header.tsx>>>
   * ...
   * <<<END>>>
   * ```
   *
   * Benefits:
   * - Zero escaping needed - code appears exactly as written
   * - Clear boundaries prevent parsing issues
   * - Supports partial recovery from truncated responses
   */
  static formatForPrompt(fileTree: Record<string, string>): string {
    return FencedBlockParser.format(fileTree);
  }
}
