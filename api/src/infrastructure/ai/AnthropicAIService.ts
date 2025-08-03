import Anthropic from "@anthropic-ai/sdk";
import { IAIService, AIResponse } from '../../domain/services/IAIService';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import fs from "fs";
import path from "path";

export class AnthropicAIService implements IAIService {
  private client: Anthropic;
  private currentFileTree: Record<string, string> = {};
  private readonly reactAppFilesPath: string;
  private buildRepository?: IBuildRepository;
  private projectId?: string;
  private currentPromptId?: string;

  constructor(apiKey?: string, buildRepository?: IBuildRepository) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.buildRepository = buildRepository;
    this.reactAppFilesPath = path.join(__dirname, "../../template-react18-ts.json");
    this.loadInitialFileTree().catch(console.error);
  }

  getCurrentFileTree(): Record<string, string> {
    return this.currentFileTree;
  }

  async setProjectContext(projectId: string): Promise<void> {
    this.projectId = projectId;
    await this.loadInitialFileTree();
  }

  private async loadInitialFileTree(): Promise<void> {
    try {
      // First, check if we have a recent file tree in the database for this project
      if (this.buildRepository && this.projectId) {
        const recentBuild = await this.buildRepository.findLatestByProjectId(this.projectId);
        if (recentBuild && recentBuild.fileTree && typeof recentBuild.fileTree === "object") {
          console.log("Using recent file tree from database for project:", this.projectId);
          this.currentFileTree = recentBuild.fileTree;
          return;
        }
      }

      // Fall back to initial file tree from JSON file
      console.log("Using initial file tree from template-react18-ts.json");
      const fileContent = fs.readFileSync(this.reactAppFilesPath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      this.currentFileTree = typeof parsedContent === "object" && parsedContent !== null ? parsedContent : {};
    } catch (error) {
      console.error("Error loading initial file tree:", error);
      this.currentFileTree = {};
    }
  }

  private formatFileTreeForPrompt(fileTree: Record<string, string>): string {
    return Object.entries(fileTree)
      .map(([path, content]) => {
        return `${path}:\n${content}`;
      })
      .join("\n\n---\n\n");
  }

  private saveToLogFile(filename: string, content: any): void {
    if (!this.currentPromptId) return;

    try {
      const logsDir = path.join(process.cwd(), "logs", this.currentPromptId);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const filePath = path.join(logsDir, filename);
      const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      fs.writeFileSync(filePath, contentStr, "utf8");
      console.log(`Saved log: ${filePath}`);
    } catch (error) {
      console.warn("Failed to save log file:", error instanceof Error ? error.message : "Unknown error");
    }
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

  private async saveFileTreeToDisk(fileTree: Record<string, string>): Promise<string> {
    if (!this.projectId || !this.buildRepository) {
      throw new Error("Project ID and build repository are required for saving files to disk");
    }

    const nextVersion = await this.buildRepository.getNextVersionForProject(this.projectId);
    const appsDir = path.join(__dirname, "../../../apps");
    const appDir = path.join(appsDir, this.projectId, `v${nextVersion}`);

    // Create project and version directories
    fs.mkdirSync(appDir, { recursive: true });

    // Write all files to disk
    for (const [filePath, content] of Object.entries(fileTree)) {
      const fullFilePath = path.join(appDir, filePath);
      const fileDir = path.dirname(fullFilePath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(fullFilePath, content, "utf8");
    }

    console.log("All files written to disk in directory:", appDir);
    return appDir;
  }

  async generateResponse(userRequest: string, promptId?: string): Promise<AIResponse> {
    try {
      console.log("Starting generateResponse...");

      // Set current promptId for logging
      this.currentPromptId = promptId;
      
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

      // Save raw AI response to disk
      this.saveToLogFile("raw_ai_response.txt", content);

      // Extract and validate JSON response
      const rawChanges = JSON.parse(content);

      // Save extractAndValidateJSON result to disk
      this.saveToLogFile("extract_validate_json_result.json", rawChanges);

      // Parse and normalize the changes
      console.log("Parsing and normalizing changes...");
      const changes = this.normalizeChanges(rawChanges);

      // Save normalizeChanges result to disk
      this.saveToLogFile("normalize_changes_result.json", changes);

      // Update file tree in memory
      console.log("Updating file tree in memory...");
      this.currentFileTree = this.updateFileTree(changes);
      this.saveToLogFile("merged_changes.json", this.currentFileTree);

      // Save files to disk and get app directory
      const appDirectory = await this.saveFileTreeToDisk(this.currentFileTree);

      // Save updated file tree to database
      if (this.buildRepository && this.projectId) {
        console.log("Saving updated file tree to database...");
        await this.buildRepository.create({
          fileTree: this.currentFileTree,
          projectId: this.projectId
        });
      }

      const responseData = {
        changes,
        appDirectory,
        fileTree: this.currentFileTree,
        message: `AI processing completed successfully.`,
      };

      return {
        content: JSON.stringify(responseData, (key, value) => {
          if (typeof value === 'string') {
            return value.replace(/[\u0000-\u001f]/g, (match) => {
              return '\\u' + ('0000' + match.charCodeAt(0).toString(16)).slice(-4);
            });
          }
          return value;
        }),
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