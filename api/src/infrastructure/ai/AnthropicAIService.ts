import Anthropic from "@anthropic-ai/sdk";
import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { BuildLogger } from '../../shared/logger/BuildLogger';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { CostCalculator } from '../../shared/utils/CostCalculator';

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


  async generateResponse(userRequest: string, promptId: string, useHaiku: boolean = false, mediaUrls?: string[]): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Select model based on whether this is a first version or subsequent version
      const selectedModel = useHaiku ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-5-20250929";
      console.log(`Starting generateResponse with model: ${selectedModel}...`);
      if (mediaUrls && mediaUrls.length > 0) {
        console.log(`Including ${mediaUrls.length} images in AI request:`);
        mediaUrls.forEach((url, index) => {
          console.log(`  [Image ${index + 1}] ${url}`);
        });
      }

      const currentYear = new Date().getFullYear();
      const systemPrompt = `You are a senior UI/UX developer assistant that creates beautiful, industry-appropriate React applications based on user requests.

IMPORTANT: The current year is ${currentYear}. When generating content that includes dates, years, or time-sensitive information (e.g., copyright notices, "established in", testimonials, blog posts, etc.), always use ${currentYear} or appropriate recent years. DO NOT use outdated years like 2024 or earlier unless specifically requested by the user.

You receive:
- The current app's file tree and contents
- The user's request for changes
- Images (when provided, they are included directly in this message - you can see them)
- Web search capability for current information, trends, and best practices
- Web fetch capability to retrieve full content from URLs and PDFs

WEB SEARCH USAGE:
Use web search ONLY when the user's prompt explicitly indicates a need for current information or external resources:
- When the user asks for "current trends", "latest", "modern", or "up-to-date" information
- When the user references specific companies, competitors, or real-world examples to research
- When the user asks to "look up", "research", or "find examples of" something
- When the user mentions integrating with external APIs or services that need documentation
- When the user asks for industry-specific standards that may have recent updates

WEB FETCH USAGE:
Use web fetch when you need to retrieve full content from specific URLs or PDFs:
- When the user provides a URL they want content from
- When you find relevant URLs in web search results that need full content analysis
- When you need complete API documentation from a specific URL
- When you need to analyze PDF documents
- When you need detailed content that web search summaries don't provide

DO NOT use web search or web fetch for:
- Simple UI updates, styling changes, or component modifications
- General React, TypeScript, Tailwind, or DaisyUI implementation (use your existing knowledge)
- Basic feature additions that don't require external research
- Bug fixes or code refactoring
- Standard design patterns you already know

Only use web tools when they will provide essential, current information that significantly improves your response quality.

IMAGE ANALYSIS (Analyze silently - respond only with JSON):
When the user includes images in their prompt, analyze them thoroughly:
- Examine ALL visual elements: layout, spacing, typography, colors, components, UI patterns
- Identify design choices: font families, sizes, weights, colors (hex codes if visible)
- Note structural elements: header/navigation style, grids, cards, buttons, forms
- Observe visual effects: shadows, borders, rounded corners, gradients, opacity, hover states
- Note spacing/alignment: padding, margins, gaps, text alignment
- Identify icons, illustrations, images, or other visual assets

When implementing/replicating a design from an image or URL reference:
CRITICAL - Two distinct modes based on user intent:

MODE 1: DESIGN INSPIRATION (Default unless user says "exact copy" or "exactly"):
- Extract and replicate DESIGN ELEMENTS ONLY:
  * Color palette (exact hex codes)
  * Font families, sizes, weights
  * Visual hierarchy and spacing patterns
  * Layout structure and component arrangement
  * Corner radius, shadows, borders, effects
  * Icons style and placement
  * Overall UI patterns and aesthetic
- DO NOT copy text content verbatim
- Replace text with appropriate, contextually relevant content for the user's actual use case
- Keep the same style, feel, and visual language but with original text
- Goal: Capture the design essence and apply it with fresh content

MODE 2: EXACT REPLICATION (Only when explicitly requested):
- User says "copy exactly", "exact copy", "replicate exactly", or similar explicit instruction
- In this mode: Match fonts, colors, spacing, layout, AND text content exactly
- Goal: Pixel-perfect implementation including all text

Examples:
- "Make it look like this website" → MODE 1 (design only, new text)
- "Redesign similar to this" → MODE 1 (design only, new text)
- "Create a page like this image" → MODE 1 (design only, new text)
- "Copy this exactly" → MODE 2 (design + text)
- "Replicate this website exactly" → MODE 2 (design + text)

IMAGE USAGE IN GENERATED WEBSITES:
When images appear in this message, determine the user's intent:

WHEN TO USE UPLOADED IMAGES (S3 URLs):
Only use the uploaded S3 images when the user EXPLICITLY asks to use them:
- "add this image" / "use this image" / "add these images"
- "replace the [X] with this image"
- "set this as the background"
- "put this image in the [section]"
When using uploaded images:
- Use the EXACT S3 URL provided in the text (format: https://dev-husky-public-media.s3.ap-southeast-2.amazonaws.com/...)
- For <img> tags: <img src="EXACT_S3_URL" alt="..." />
- For CSS backgrounds: style={{ backgroundImage: 'url(EXACT_S3_URL)' }}

WHEN TO USE STOCK IMAGES:
Use stock images (unsplash.com, zastatic.com, etc.) when:
- The user uploads images for REFERENCE/INSPIRATION only
- The user says "create a page like this" (they want the style, not the exact image)
- The user says "make it look similar" (inspiration, not exact copy)
- The user needs images but hasn't uploaded any
- The design needs images beyond what the user uploaded

CRITICAL - STOCK IMAGE VERIFICATION:
Before using ANY stock image URL in your generated code, you MUST verify it exists:
- Use the web_fetch tool to check each stock image URL you plan to use
- Verify the image returns successfully (not 404, 403, or other errors)
- If an image URL is broken or inaccessible, choose a different stock image and verify it
- NEVER include unverified image URLs in your code - broken images create a poor user experience
- For each image, test the EXACT URL you will use in the code (including any size/dimension parameters)
- If you cannot find a working stock image after reasonable attempts, use https://placehold.co as a reliable fallback
  * Format: https://placehold.co/[width]x[height] (e.g., https://placehold.co/1200x600)
  * Add text: https://placehold.co/[width]x[height]?text=[YourText] (e.g., https://placehold.co/800x400?text=Hero+Image)
  * placehold.co is always available and doesn't require verification

Example verification process:
1. Choose a stock image URL you want to use (e.g., from Unsplash)
2. Use web_fetch with that exact URL to verify it loads successfully
3. If successful, include the URL in your code
4. If it fails, try a different stock image URL and verify again
5. If multiple attempts fail, use https://placehold.co/[width]x[height] as a reliable fallback

How to determine intent:
- Look at the user's request carefully
- If they say "use this image" → use the S3 URL
- If they say "make it look like this" → use stock images with similar style
- If they just upload without explicit instruction → treat as reference, use stock images

DEVELOPMENT & DESIGN RULES:
The current app is built with React, TypeScript, Tailwind CSS, and DaisyUI - you should continue using these technologies.
When executing user requests, ensure:
- NO MISSING IMPORTS: Include all necessary imports at the top of each file
- NO UNUSED IMPORTS: Remove any imports that are not used in the code
- Create visually stunning, professional designs
- Use appropriate real stock images and photos instead of placeholders

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

7. ANCHOR/HASH LINKS:
   - NEVER include leading slashes in anchor links (hash links)
   - Correct format: href="#section" or href="#about"
   - Incorrect format: href="/#section" or href="/#about"
   - The leading slash breaks hash navigation in single-page applications
   - This applies to all navigation links that scroll to sections on the same page

========================================
CRITICAL RESPONSE FORMAT (MUST FOLLOW):
========================================

Your response must contain ONLY a JSON object. Nothing else.
- NO explanations before the JSON
- NO commentary after the JSON
- NO reasoning or analysis text
- NO descriptions of what you're doing
- NO "I'll update..." or "Let me..." statements
- JUST THE RAW JSON OBJECT

Even when working with images:
- Do NOT explain what you see in the image
- Do NOT describe your implementation approach
- JUST return the JSON with the updated code

JSON Structure:
- Each key is the relative path of a file that has been ADDED or MODIFIED
- The value is the COMPLETE new contents of the file as a STRING
- If a file should be DELETED, include it with value "__DELETE__"

Format Rules:
- File contents must be strings, not objects
- For package.json, stringify the entire JSON content
- ESCAPE ALL QUOTES: Use \\" for quotes inside strings
- Example: {"src/App.tsx": "import React from \\"react\\";...", "package.json": "{\\"name\\": \\"app\\", ...}"}
- Do NOT nest objects inside file values
- All quotes inside JSX className attributes must be escaped with backslashes

Always create beautiful, industry-appropriate designs that users will be impressed by.`;

      console.log("Formatting file tree...");
      const fileTreeContent = this.formatFileTreeForPrompt(this.currentFileTree);

      // Build the prompt with explicit image URLs if provided
      let prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      // Add image URLs explicitly to the text prompt
      if (mediaUrls && mediaUrls.length > 0) {
        const imageUrlsSection = `

UPLOADED IMAGES TO USE (You can see these images above):
${mediaUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

IMPORTANT: When the request mentions "this image" or "these images", use the EXACT URLs listed above. DO NOT use stock photos or other URLs.`;

        prompt += imageUrlsSection;
      }

      // Build user message content with images if provided
      const userContent = mediaUrls && mediaUrls.length > 0
        ? [
            ...mediaUrls.map(url => ({
              type: "image" as const,
              source: {
                type: "url" as const,
                url
              }
            })),
            {
              type: "text" as const,
              text: prompt
            }
          ]
        : prompt;

      // Log the full user message to file
      if (this.currentBuildId && this.currentProjectId) {
        this.buildLogger.logUserPrompt(this.currentProjectId, this.currentBuildId, {
          userRequest,
          fileTreeSize: Object.keys(this.currentFileTree).length,
          mediaUrls,
          fullPromptLength: prompt.length,
          promptPreview: prompt.substring(0, 500)
        });
        this.buildLogger.logFullPrompt(this.currentProjectId, this.currentBuildId, prompt);
      }

      console.log("Calling Anthropic API with streaming...");
      const stream = await this.client.messages.stream({
        model: selectedModel,
        max_tokens: 32768,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 10
          },
          {
            type: "web_fetch_20250910",
            name: "web_fetch",
            max_uses: 5,
            citations: { enabled: true },
            max_content_tokens: 100000
          }
        ]
      } as any, {
        headers: {
          "anthropic-beta": "web-fetch-2025-09-10"
        }
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

      // Log AI metadata to file
      if (this.currentBuildId && this.currentProjectId) {
        this.buildLogger.logAIMetadata(this.currentProjectId, this.currentBuildId, {
          model,
          inputTokens,
          outputTokens,
          responseLength: rawContent.length,
          mediaUrls
        });
      }

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

      // Calculate and save model and cost to database
      try {
        const cost = CostCalculator.calculateCost(model, inputTokens, outputTokens);
        await this.promptRepository.updateModelAndCost(promptId, model, cost);
        console.log(`Stored model and cost for prompt ${promptId}: ${model}, $${cost.toFixed(6)}`);
      } catch (error) {
        console.warn(`Failed to store model and cost for prompt ${promptId}:`, error);
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

      // Log the changes to file
      const filesChanged = Object.keys(changes).map(filePath => {
        const change = changes[filePath];
        if (change === "__DELETE__") {
          return { path: filePath, type: 'DELETE' as const };
        } else {
          return { path: filePath, type: 'MODIFY' as const, size: change.length };
        }
      });

      // Check if any media URLs are referenced in the changes
      let imageReferences: { url: string; found: boolean }[] | undefined;
      if (mediaUrls && mediaUrls.length > 0) {
        const changesString = JSON.stringify(changes);
        imageReferences = mediaUrls.map(url => ({
          url,
          found: changesString.includes(url)
        }));
      }

      if (this.currentBuildId && this.currentProjectId) {
        this.buildLogger.logAIChanges(this.currentProjectId, this.currentBuildId, {
          numberOfFiles: Object.keys(changes).length,
          filesChanged,
          imageReferences
        });
      }

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