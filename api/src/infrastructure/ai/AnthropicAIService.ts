import Anthropic from "@anthropic-ai/sdk";
import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';

export class AnthropicAIService implements IAIService {
  private client: Anthropic;
  private currentFileTree: Record<string, string> = {};
  private buildLogger: BuildLogger;
  private currentProjectId: string = '';
  private currentBuildId: string = '';
  private promptRepository: IPromptRepository;

  constructor(promptRepository: IPromptRepository, apiKey?: string) {
    this.promptRepository = promptRepository;
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      timeout: 20 * 60 * 1000, // 20 minutes timeout for long-running requests
    });
    this.buildLogger = new BuildLogger();
  }

  getCurrentFileTree(): Record<string, string> {
    return this.currentFileTree;
  }

  async setProjectContext(projectId: string, fileTree: Record<string, string>, buildId?: string): Promise<void> {
    this.currentProjectId = projectId;
    this.currentFileTree = fileTree;
    this.currentBuildId = buildId || '';
  }


  private extractJSON(content: string): any {
    try {
      // First try to parse as is
      return JSON.parse(content);
    } catch {
      // If that fails, try to extract JSON from content that might have explanatory text
      // Look for the first occurrence of { and last occurrence of }
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonString = content.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(jsonString);
        } catch {
          // If extraction still fails, throw original error
          throw new Error(`Failed to parse JSON from AI response: ${content.substring(0, 200)}...`);
        }
      }

      throw new Error(`No valid JSON found in AI response: ${content.substring(0, 200)}...`);
    }
  }

  private formatFileTreeForPrompt(fileTree: Record<string, string>): string {
    return Object.entries(fileTree)
      .map(([path, content]) => {
        return `${path}:\n${content}`;
      })
      .join("\n\n---\n\n");
  }


  private normalizeChanges(rawChanges: any): Record<string, string> {
    const normalized: Record<string, string> = {};

    for (const [filePath, content] of Object.entries(rawChanges)) {
      if (content === "__DELETE__") {
        normalized[filePath] = "__DELETE__";
      } else if (typeof content === "string") {
        normalized[filePath] = content;
      } else if (typeof content === "object" && content !== null) {
        // Handle nested object responses
        if ((content as any).__DELETE__ === true) {
          normalized[filePath] = "__DELETE__";
        } else {
          // Convert object to JSON string
          normalized[filePath] = JSON.stringify(content, null, 2);
        }
      } else {
        // Convert other types to string
        normalized[filePath] = String(content);
      }
    }

    return normalized;
  }

  private updateFileTree(changes: Record<string, string>): Record<string, string> {
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


  async generateResponse(userRequest: string, promptId: string): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      console.log("Starting generateResponse...");

      const systemPrompt = `You are a senior UI/UX developer assistant that creates beautiful, industry-appropriate React applications based on user requests.
You receive:
- The current app's file tree and contents
- The user's request for changes
- Web search capability for current information, trends, and best practices

WEB SEARCH USAGE:
Use web search ONLY when the user's prompt explicitly indicates a need for current information or external resources:
- When the prompt contains URLs or links that need to be researched
- When the user asks for "current trends", "latest", "modern", or "up-to-date" information
- When the user references specific companies, competitors, or real-world examples to research
- When the user asks to "look up", "research", or "find examples of" something
- When the user mentions integrating with external APIs or services that need documentation
- When the user asks for industry-specific standards that may have recent updates

DO NOT use web search for:
- Simple UI updates, styling changes, or component modifications
- General React, TypeScript, Tailwind, or DaisyUI implementation (use your existing knowledge)
- Basic feature additions that don't require external research
- Bug fixes or code refactoring
- Standard design patterns you already know

Only use web search when it will provide essential, current information that significantly improves your response quality.

DEVELOPMENT & DESIGN RULES:
The current app is built with React, TypeScript, Tailwind CSS, and DaisyUI - you should continue using these technologies.
When executing user requests, ensure there are no missing imports and create visually stunning, professional designs.
Use appropriate real stock images and photos instead of placeholders.

DESIGN PRINCIPLES:
1. INDUSTRY APPROPRIATENESS: Match the visual design to the industry/domain of the request:
   - Finance/Banking: Clean, trustworthy, professional blues/grays, minimal design
   - Healthcare: Calming blues/greens, accessible, clear typography
   - E-commerce: Vibrant, conversion-focused, clear CTAs
   - SaaS/Tech: Modern, sleek, gradients, contemporary colors
   - Creative/Agency: Bold, artistic, unique layouts, vibrant colors
   - Education: Friendly, approachable, clear hierarchy

2. USE DAISYUI COMPONENTS: Leverage DaisyUI's component library for consistent, beautiful UI:
   - Use semantic component classes (btn, card, modal, navbar, etc.)
   - Apply appropriate DaisyUI themes and color variants
   - Combine with custom Tailwind classes for unique styling

3. VISUAL HIERARCHY & SPACING:
   - Use proper typography scale (text-xs to text-6xl)
   - Implement consistent spacing (gap, padding, margin)
   - Create clear visual hierarchy with font weights and sizes
   - Use appropriate color contrast for accessibility

4. MODERN UI PATTERNS:
   - Implement subtle shadows, gradients, and rounded corners
   - Use hover states and smooth transitions
   - Add loading states and micro-interactions
   - Include proper responsive design (sm:, md:, lg:, xl:)

5. CUSTOM CSS WHEN NEEDED:
   - Add custom CSS in App.css or component-specific styles for:
     * Complex animations or transitions
     * Industry-specific visual effects
     * Custom gradients or patterns
     * Advanced layouts not achievable with Tailwind alone

6. COMPONENT STRUCTURE:
   - Create reusable, well-structured components
   - Use proper semantic HTML elements
   - Implement clean, readable JSX with proper indentation
   - Include proper TypeScript typing

You reply with a single JSON object, where:
- Each key is the relative path of a file that has been ADDED or MODIFIED
- The value is the COMPLETE new contents of the file as a STRING
- If a file should be DELETED, include it with value "__DELETE__"

IMPORTANT FORMAT RULES:
- File contents must be strings, not objects
- For package.json, stringify the entire JSON content
- ESCAPE ALL QUOTES: Use \\" for quotes inside strings
- Example: {"src/App.tsx": "import React from \\"react\\";...", "package.json": "{\\"name\\": \\"app\\", ...}"}
- Do NOT nest objects inside file values
- All quotes inside JSX className attributes must be escaped with backslashes

CRITICAL: Your response must contain ONLY the JSON object, nothing else. No explanations, no commentary, no search descriptions, no reasoning - just the raw JSON object.

Always create beautiful, industry-appropriate designs that users will be impressed by.`;

      console.log("Formatting file tree...");
      const fileTreeContent = this.formatFileTreeForPrompt(this.currentFileTree);

      const prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      console.log("Calling Anthropic API with streaming...");
      const stream = await this.client.messages.stream({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 32768,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 10
          }
        ]
      });

      // Collect all streamed content
      let rawContent = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let model = "";

      console.log("Streaming API response...");
      for await (const chunk of stream) {
        if (chunk.type === 'message_start') {
          model = chunk.message.model;
          inputTokens = chunk.message.usage.input_tokens;
        } else if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          rawContent += chunk.delta.text;
        } else if (chunk.type === 'message_delta') {
          outputTokens = chunk.usage.output_tokens;
        }
      }

      console.log("Anthropic API streaming completed");

      // Calculate duration
      const durationMs = Date.now() - startTime;

      // Save raw AI response to database immediately after receiving it
      try {
        await this.promptRepository.updateRawAiResponse(promptId, rawContent);
        console.log(`Stored raw AI response for prompt ${promptId}`);
      } catch (error) {
        console.warn(`Failed to store raw AI response for prompt ${promptId}:`, error);
        // Don't throw - this is not critical to the main flow
      }

      // Save metrics (tokens and duration) to database
      try {
        await this.promptRepository.updateMetrics(
          promptId,
          inputTokens,
          outputTokens,
          durationMs
        );
        console.log(`Stored metrics for prompt ${promptId}: ${inputTokens} input tokens, ${outputTokens} output tokens, ${durationMs}ms`);
      } catch (error) {
        console.warn(`Failed to store metrics for prompt ${promptId}:`, error);
        // Don't throw - this is not critical to the main flow
      }

      // Log raw AI response immediately after receiving it
      if (this.currentBuildId && this.currentProjectId) {
        this.buildLogger.logAIResponse(this.currentProjectId, this.currentBuildId, rawContent);
      }

      // Extract and validate JSON response
      const rawChanges = this.extractJSON(rawContent);

      // Parse and normalize the changes
      console.log("Parsing and normalizing changes...");
      const changes = this.normalizeChanges(rawChanges);

      // Update file tree in memory
      console.log("Updating file tree in memory...");
      this.currentFileTree = this.updateFileTree(changes);

      const responseData = {
        changes,
        fileTree: this.currentFileTree,
        message: `AI processing completed successfully.`,
      };

      return {
        content: JSON.stringify(responseData),
        rawContent: rawContent,
        model: model,
        usage: {
          inputTokens: inputTokens,
          outputTokens: outputTokens,
        },
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}