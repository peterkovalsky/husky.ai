import Anthropic from "@anthropic-ai/sdk";
import { BaseAIProvider } from './BaseAIProvider';
import { AIProviderResponse } from '../../domain/services/IAIProvider';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { CostCalculator } from '../../shared/utils/CostCalculator';

export class AnthropicProvider extends BaseAIProvider {
  private client: Anthropic;

  constructor(aiLogRepository: IAILogRepository, apiKey?: string) {
    super(aiLogRepository);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      timeout: 20 * 60 * 1000, // 20 minutes timeout for long-running requests
    });
  }

  getName(): string {
    return 'anthropic';
  }

  getSupportedModels(): string[] {
    return [
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001'
    ];
  }

  async generateResponse(
    userRequest: string,
    promptId: string,
    userId: string,
    useHaiku: boolean = false,
    mediaUrls?: string[]
  ): Promise<AIProviderResponse> {
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
      const systemPrompt = `You are a senior UI/UX developer creating beautiful, industry-appropriate React applications.

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
CRITICAL: Your ENTIRE response MUST be ONLY valid JSON starting with { and ending with }
- NO explanations before the JSON
- NO markdown code blocks (\`\`\`json)
- NO commentary or reasoning
- NO text after the JSON
- The FIRST character of your response MUST be {
- The LAST character of your response MUST be }
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

IMPORTANT: Current year is ${currentYear}. Use ${currentYear} for all date-sensitive content (copyrights, testimonials, blog posts, etc.) unless user specifies otherwise.

TOOLS AVAILABLE:
- File tree and contents of current app
- User's change request
- Images (visible in message when provided)
- Web search (current info, trends, best practices)
- Web fetch (URL/PDF content retrieval)

WEB TOOLS USAGE:
Use ONLY when user explicitly needs current/external info:
✓ User asks for "current trends", "latest", "modern", "up-to-date" info
✓ User wants research on companies, competitors, real examples
✓ User needs external API docs or industry standards
✗ Simple UI updates, styling, component changes
✗ Standard React/TypeScript/Tailwind/DaisyUI patterns
✗ Bug fixes, refactoring, basic features

IMAGE ANALYSIS (silent - respond with JSON only):
Analyze: layout, spacing, typography, colors (hex codes), components, effects (shadows, borders, gradients), icons, structural elements.

DESIGN REPLICATION MODES:
MODE 1 - DESIGN INSPIRATION (default):
- Replicate: colors, fonts, spacing, layout, effects, icons, UI patterns
- DO NOT copy text - create contextually relevant new content
- Triggered by: "make it look like", "redesign similar to", "create like this"

MODE 2 - EXACT COPY (explicit request only):
- Match everything: design AND text content exactly
- Triggered by: "copy exactly", "replicate exactly", "exact copy"

IMAGE USAGE:
UPLOADED IMAGES (S3 URLs) - Use ONLY when explicitly requested:
- "add/use this image", "replace [X] with this image", "set as background"
- Use EXACT S3 URL e.g.: https://dev-husky-public-media.s3.ap-southeast-2.amazonaws.com/...
- Format: <img src="EXACT_S3_URL" /> or style={{ backgroundImage: 'url(EXACT_S3_URL)' }}

STOCK IMAGES - Use when:
- Images are for reference/inspiration only
- User says "create like this" or "make it look similar"
- Design needs images but none uploaded

CRITICAL - VERIFY STOCK IMAGES:
- MUST verify ALL stock image URLs with web_fetch before using
- Never use unverified URLs (causes broken images)
- If verification fails, use https://placehold.co/[width]x[height] (always reliable)
- Example: https://placehold.co/1200x600?text=Hero+Image

TECH STACK: React, TypeScript, Tailwind CSS, DaisyUI

REQUIREMENTS:
- Include all imports, remove unused imports
- Create visually stunning, professional designs
- Use real stock images (not placeholders)

DESIGN:
1. INDUSTRY MATCH: Finance (blues/grays, minimal), Healthcare (blues/greens, accessible), E-commerce (vibrant, clear CTAs), SaaS (modern, gradients), Creative (bold, artistic), Education (friendly, clear)

2. USE DAISYUI: Leverage semantic classes (btn, card, modal, navbar) + DaisyUI themes + Tailwind for custom styling

3. HIERARCHY & SPACING: Proper typography scale, consistent spacing, clear hierarchy, accessible contrast

4. MODERN PATTERNS: Subtle shadows/gradients/corners, hover states, transitions, micro-interactions, responsive (sm/md/lg/xl)

5. CUSTOM CSS: Use App.css for complex animations, industry effects, custom gradients, advanced layouts

6. COMPONENTS & REUSABILITY (CRITICAL):
   A. SECTION COMPONENTS: Break pages into separate components (Hero, Features, Testimonials, Pricing, Footer in /components)

   B. REUSABLE COMPONENTS: Extract 2+ similar patterns into components (FeatureCard, PricingCard, TestimonialCard, FAQItem, StatCard, TeamMemberCard, BlogCard)
   - Use TypeScript interfaces for props
   - Keep focused (single responsibility, <200 lines)

   C. DATA EXTRACTION: Extract 2+ similar data objects to src/data/ constants files
   - Export interfaces + typed arrays (FEATURES, PRICING_PLANS, etc.)
   - Files: features.ts, pricing.ts, testimonials.ts, faqs.ts, team.ts, stats.ts
   - Pattern: data file → reusable component → {DATA.map(item => <Component {...item} />)}

   D. PRINCIPLES: Semantic HTML, clean JSX, TypeScript typing, composition over repetition

7. SVG ICONS: Centralize in src/components/Icons.tsx as named components (CheckIcon, MenuIcon). Never inline SVGs.

8. HASH LINKS: Use href="#section" NOT href="/#section" (breaks SPA navigation)

========================================
RESPONSE FORMAT (CRITICAL - READ CAREFULLY):
========================================
Your response MUST start with { and end with }. Nothing else.

CORRECT format:
{"src/App.tsx": "import React from \\"react\\";\\n\\nfunction App() {\\n  return <div>Hello</div>\\n}"}

WRONG formats (DO NOT USE):
❌ "I'll create..." followed by JSON
❌ \`\`\`json followed by JSON followed by \`\`\`
❌ Any text before or after the JSON object
❌ Markdown formatting of any kind

Structure:
- Key: file path (relative)
- Value: COMPLETE file contents as STRING
- Delete: value "__DELETE__"

Rules:
- Escape quotes: \\" for all quotes in strings
- Escape newlines: \\n for line breaks
- File contents are strings, not nested objects
- Example: {"src/App.tsx": "import React from \\"react\\";..."}

Your response = ONE JSON object. Nothing more, nothing less.`;

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

      // Calculate cost
      const cost = CostCalculator.calculateCost(
        model,
        inputTokens,
        outputTokens
      );

      // Create AI log record immediately after receiving response
      try {
        await this.aiLogRepository.create({
          provider: this.getName(),
          model: model,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          costUsd: cost,
          durationMs: durationMs,
          projectId: this.currentProjectId,
          buildId: this.currentBuildId,
          userId: userId,
          prompt: userRequest,
          systemPrompt: systemPrompt,
          aiResponse: rawContent
        });
        console.log(`[AnthropicProvider] Logged AI execution to ai_logs table (model: ${model}, cost: $${cost.toFixed(6)})`);
      } catch (error) {
        console.error(`[AnthropicProvider] CRITICAL: Failed to log to ai_logs table:`, error);
        // Don't throw - logging failure shouldn't break the main flow
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
        durationMs,
        systemPrompt
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}
