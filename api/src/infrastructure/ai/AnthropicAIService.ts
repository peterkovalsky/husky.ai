import Anthropic from "@anthropic-ai/sdk";
import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { BuildLogger } from '../../shared/logger/BuildLogger';

export class AnthropicAIService implements IAIService {
  private client: Anthropic;
  private currentFileTree: Record<string, string> = {};
  private buildLogger: BuildLogger;
  private currentProjectId: string = '';
  private currentBuildId: string = '';

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
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


  async generateResponse(userRequest: string, _promptId?: string): Promise<AIResponse> {
    try {
      console.log("Starting generateResponse...");
      
      const systemPrompt = `You are a senior UI/UX developer assistant that creates beautiful, industry-appropriate React applications based on user requests.
You receive:
- The current app's file tree and contents
- The user's request for changes

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

Do NOT include any explanation. Only output the JSON.

Always create beautiful, industry-appropriate designs that users will be impressed by.`;

      console.log("Formatting file tree...");
      const fileTreeContent = this.formatFileTreeForPrompt(this.currentFileTree);

      const prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      console.log("Calling Anthropic API...");
      const response = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      console.log("Anthropic API response received");
      const content = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Log raw AI response immediately after receiving it
      if (this.currentBuildId && this.currentProjectId) {
        this.buildLogger.logAIResponse(this.currentProjectId, this.currentBuildId, content);
      }

      // Extract and validate JSON response
      const rawChanges = JSON.parse(content);

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
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}