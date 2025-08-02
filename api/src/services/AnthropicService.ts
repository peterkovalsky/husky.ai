import Anthropic from "@anthropic-ai/sdk";
import { AIService, AIResponse } from "./AIService";
import { DatabaseService } from "./DatabaseService";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

type FileTree = Record<string, string>;

export class AnthropicService extends AIService {
  private client: Anthropic;
  private currentFileTree: FileTree = {};
  private readonly reactAppFilesPath: string;
  private readonly appsDir: string;
  private readonly execAsync = promisify(exec);
  private databaseService?: DatabaseService;
  private projectId?: string;
  private currentPromptId?: string;
  private copyingPromise: Promise<string> | null = null;

  constructor(
    apiKey?: string,
    databaseService?: DatabaseService,
    projectId?: string
  ) {
    super();
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.databaseService = databaseService;
    this.projectId = projectId;
    this.reactAppFilesPath = path.join(__dirname, "../template-react18-ts.json");
    this.appsDir = path.join(__dirname, "../../../apps");
    this.loadInitialFileTree().catch(console.error);
  }

  getCurrentFileTree(): FileTree {
    return this.currentFileTree;
  }

  async setProjectContext(
    databaseService: DatabaseService,
    projectId: string
  ): Promise<void> {
    this.databaseService = databaseService;
    this.projectId = projectId;
    await this.loadInitialFileTree();
  }

  private async loadInitialFileTree(): Promise<void> {
    try {
      // First, check if we have a recent file tree in the database for this project
      if (this.databaseService && this.projectId) {
        const recentFileTree =
          await this.databaseService.getLatestFileTreeByProjectId(
            this.projectId
          );
        if (
          recentFileTree &&
          recentFileTree.file_tree &&
          typeof recentFileTree.file_tree === "object"
        ) {
          console.log(
            "Using recent file tree from database for project:",
            this.projectId
          );
          this.currentFileTree = recentFileTree.file_tree;
          return;
        }
      }

      // Fall back to initial file tree from JSON file
      console.log("Using initial file tree from template-react18-ts.json");
      const fileContent = fs.readFileSync(this.reactAppFilesPath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      this.currentFileTree =
        typeof parsedContent === "object" && parsedContent !== null
          ? parsedContent
          : {};
    } catch (error) {
      console.error("Error loading initial file tree:", error);
      this.currentFileTree = {};
    }
  }

  private formatFileTreeForPrompt(fileTree: FileTree): string {
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
      const contentStr =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      fs.writeFileSync(filePath, contentStr, "utf8");
      console.log(`Saved log: ${filePath}`);
    } catch (error) {
      console.warn(
        "Failed to save log file:",
        error instanceof Error ? error.message : "Unknown error"
      );
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

  private async startCopyingNodeModules(): Promise<string> {
    if (!this.projectId) {
      throw new Error("Project ID is required for copying node_modules");
    }

    // Get the next version number for this project
    const nextVersion = await this.databaseService!.getNextVersionForProject(this.projectId);
    const appDir = path.join(this.appsDir, this.projectId, `v${nextVersion}`);

    return new Promise((resolve, reject) => {
      try {
        // Create project and version directories if they don't exist
        fs.mkdirSync(appDir, { recursive: true });

        let sourceDir: string;
        let sourceDescription: string;

        if (nextVersion === 1) {
          // First version: copy from template
          sourceDir = path.join(__dirname, "../../../templates/react18-ts");
          sourceDescription = "template";
        } else {
          // Subsequent versions: copy from previous version
          const previousVersion = nextVersion - 1;
          sourceDir = path.join(this.appsDir, this.projectId!, `v${previousVersion}`);
          sourceDescription = `previous version (v${previousVersion})`;
        }

        const sourceNodeModules = path.join(sourceDir, "node_modules");
        const sourcePackageLock = path.join(sourceDir, "package-lock.json");
        const targetNodeModules = path.join(appDir, "node_modules");
        const targetPackageLock = path.join(appDir, "package-lock.json");

        // Check what needs to be copied
        const hasNodeModules = fs.existsSync(sourceNodeModules);
        const hasPackageLock = fs.existsSync(sourcePackageLock);

        if (hasNodeModules || hasPackageLock) {
          console.log(
            `Starting parallel copy of node_modules and package-lock.json from ${sourceDescription}...`
          );

          // Use async copying to not block the AI call
          setImmediate(() => {
            try {
              // Copy node_modules if it exists
              if (hasNodeModules) {
                fs.cpSync(sourceNodeModules, targetNodeModules, {
                  recursive: true,
                  force: true,
                });
                console.log("Successfully copied node_modules");
              }

              // Copy package-lock.json if it exists
              if (hasPackageLock) {
                fs.copyFileSync(sourcePackageLock, targetPackageLock);
                console.log("Successfully copied package-lock.json");
              }

              console.log(
                "Successfully completed copying dependencies in parallel"
              );
              resolve(appDir);
            } catch (copyError) {
              console.warn(
                "Failed to copy dependencies:",
                copyError instanceof Error ? copyError.message : "Unknown error"
              );
              resolve(appDir); // Still resolve with appDir even if copying fails
            }
          });
        } else {
          resolve(appDir);
        }
      } catch (error) {
        console.warn(
          "Failed to setup parallel copying:",
          error instanceof Error ? error.message : "Unknown error"
        );
        resolve(appDir); // Still resolve with appDir even if setup fails
      }
    });
  }

  private updateFileTree(changes: Record<string, string>): FileTree {
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

  private async saveFileTreeToDisk(fileTree: FileTree): Promise<string> {
    let appDir: string;

    // Wait for the parallel copying to complete if it was started
    if (this.copyingPromise) {
      console.log("Waiting for parallel node_modules copy to complete...");
      appDir = await this.copyingPromise;
      this.copyingPromise = null; // Clear the promise
      console.log("Parallel copy completed, using prepared directory:", appDir);
    } else {
      // Fallback: create directory structure if no parallel copying was started
      if (!this.projectId) {
        throw new Error("Project ID is required for saving files to disk");
      }

      const nextVersion = await this.databaseService!.getNextVersionForProject(this.projectId);
      appDir = path.join(this.appsDir, this.projectId, `v${nextVersion}`);

      // Create project and version directories
      fs.mkdirSync(appDir, { recursive: true });
    }

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

  private async runBuild(
    appDir: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDir, "package.json");
      let buildCommand = `VITE_BASE_PATH=/projects/${this.projectId}/ npm run build`;

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          // Check if vite is available, prefer vite build over npm run build
          if (
            packageJson.devDependencies?.vite ||
            packageJson.dependencies?.vite
          ) {
            buildCommand = `VITE_BASE_PATH=/projects/${this.projectId}/ npx vite build`;
          } else {
            buildCommand = `VITE_BASE_PATH=/projects/${this.projectId}/ npm run build`;
          }
        } catch (error) {
          console.warn(
            "Failed to parse package.json, using default build command:",
            error instanceof Error ? error.message : "Unknown error"
          );
        }
      }

      // Install dependencies first with timeout and optimizations
      console.log("Installing dependencies...");
      
      const installCommand = "npm install --silent --no-audit --no-fund";

      console.log(`Running: ${installCommand}`);
      await this.execAsync(installCommand, {
        cwd: appDir,
        timeout: 180000, // 3 minutes timeout
        killSignal: "SIGTERM",
      });

      console.log("Dependencies installed successfully");

      // Run build command with timeout
      console.log("Running build...");
      const { stdout, stderr } = await this.execAsync(buildCommand, {
        cwd: appDir,
        timeout: 120000, // 2 minutes timeout
        killSignal: "SIGTERM",
      });

      console.log("Build completed successfully");

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
      };
    } catch (error: any) {
      console.error("Build process error:", error);

      if (error.code === "TIMEOUT" || error.killed) {
        return {
          success: false,
          output: error.stdout || "",
          error: "Build process timed out or was interrupted",
        };
      }

      return {
        success: false,
        output: error.stdout || "",
        error: error.stderr || error.message,
      };
    }
  }

  async generateResponse(
    userRequest: string,
    promptId?: string
  ): Promise<AIResponse> {
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
      const fileTreeContent = this.formatFileTreeForPrompt(
        this.currentFileTree
      );

      const prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      // Start copying node_modules in parallel before AI call
      console.log("Starting parallel node_modules copy...");
      this.copyingPromise = this.startCopyingNodeModules();

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

      // Save updated file tree to database
      if (this.databaseService && this.projectId) {
        console.log("Saving updated file tree to database...");
        await this.databaseService.saveFileTree(
          this.currentFileTree,
          this.projectId
        );
      }

      // Save to disk
      console.log("Saving files to disk...");
      const appDir = await this.saveFileTreeToDisk(this.currentFileTree);

      // Run build process and wait for completion
      console.log("Starting build process...");
      const buildResult = await this.runBuild(appDir);
      console.log("Build process completed");

      const responseData = {
        changes,
        appDirectory: appDir,
        buildResult,
        message: `App updated successfully. Files saved to: ${appDir}. Build ${
          buildResult.success ? "succeeded" : "failed"
        }.`,
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
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(
        `Anthropic API error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
