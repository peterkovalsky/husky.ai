/**
 * Utility for formatting file trees for inclusion in AI prompts
 * Uses plain text format to avoid JSON escaping issues with quotes in file content
 */
export class FileTreeFormatter {
  /**
   * Format file tree for inclusion in prompts using plain text format
   *
   * Output format:
   * ```
   * src/App.tsx:
   * import React from 'react';
   * ...
   *
   * ---
   *
   * src/components/Header.tsx:
   * ...
   * ```
   *
   * This avoids JSON double-escaping issues with quotes, template literals,
   * and data URIs in file content.
   */
  static formatForPrompt(fileTree: Record<string, string>): string {
    return Object.entries(fileTree)
      .map(([path, content]) => {
        return `${path}:\n${content}`;
      })
      .join("\n\n---\n\n");
  }
}
