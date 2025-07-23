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
    this.reactAppFilesPath = path.join(__dirname, "../react-app-files.json");
    this.appsDir = path.join(__dirname, "../apps");
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
          typeof recentFileTree.file_tree === 'object'
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
      console.log("Using initial file tree from react-app-files.json");
      const fileContent = fs.readFileSync(this.reactAppFilesPath, "utf8");
      const parsedContent = JSON.parse(fileContent);
      this.currentFileTree = typeof parsedContent === 'object' && parsedContent !== null ? parsedContent : {};
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

  private saveFileTreeToDisk(fileTree: FileTree): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const appDir = path.join(this.appsDir, `app-${timestamp}`);

    // Create apps directory if it doesn't exist
    if (!fs.existsSync(this.appsDir)) {
      fs.mkdirSync(this.appsDir, { recursive: true });
    }

    // Create app directory
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

    return appDir;
  }

  private async runBuild(
    appDir: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDir, "package.json");
      let buildCommand = "npm run build";

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
            buildCommand = "npx vite build";
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

      // Check if package-lock.json exists, use npm ci if it does, otherwise npm install
      const packageLockPath = path.join(appDir, "package-lock.json");
      const installCommand = fs.existsSync(packageLockPath)
        ? "npm ci --silent --no-audit --no-fund"
        : "npm install --silent --no-audit --no-fund";

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
      const systemPrompt = `You are a senior developer assistant that modifies React apps based on user requests.
You receive:
- The current app's file tree and contents. 
- The user's request for changes.

DEVELOPMENT RULES:
The current app is built with React, TypeScript and Tailwind - you should continue using these.
When executing user request, make sure there are no missing imports.

You reply with a single JSON object, where:
- Each key is the relative path of a file that has been ADDED or MODIFIED.
- The value is the COMPLETE new contents of the file as a STRING.
- If a file should be DELETED, include it with value "__DELETE__".

IMPORTANT FORMAT RULES:
- File contents must be strings, not objects
- For package.json, stringify the entire JSON content
- ESCAPE ALL QUOTES: Use \\" for quotes inside strings
- Example: {"src/App.tsx": "import React from \\"react\\";...", "package.json": "{\\"name\\": \\"app\\", ...}"}
- Do NOT nest objects inside file values
- All quotes inside JSX className attributes must be escaped with backslashes

Do NOT include any explanation. Only output the JSON.

Always include the minimum necessary files that reflect the requested change.`;

      console.log("Formatting file tree...");
      const fileTreeContent = this.formatFileTreeForPrompt(
        this.currentFileTree
      );

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

      // Save updated file tree to database
      if (this.databaseService && this.projectId) {
        console.log("Saving updated file tree to database...");
        await this.databaseService.saveFileTree(this.currentFileTree, this.projectId);
      }

      // Save to disk
      console.log("Saving files to disk...");
      const appDir = this.saveFileTreeToDisk(this.currentFileTree);

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
        content: JSON.stringify(responseData),
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

  async generateStreamingResponse(
    userRequest: string,
    promptId?: string
  ): Promise<AIResponse> {
    try {
      console.log("Starting generateStreamingResponse...");

      // Set current promptId for logging
      this.currentPromptId = promptId;
      const systemPrompt = `You are a senior developer assistant that modifies React apps based on user requests.
You receive:
- The current app's file tree and contents.
- The user's request for changes.

You reply with a single JSON object, where:
- Each key is the relative path of a file that has been ADDED or MODIFIED.
- The value is the COMPLETE new contents of the file as a STRING.
- If a file should be DELETED, include it with value "__DELETE__".

IMPORTANT FORMAT RULES:
- File contents must be strings, not objects
- For package.json, stringify the entire JSON content
- ESCAPE ALL QUOTES: Use \\" for quotes inside strings
- Example: {"src/App.tsx": "import React from \\"react\\";...", "package.json": "{\\"name\\": \\"app\\", ...}"}
- Do NOT nest objects inside file values
- All quotes inside JSX className attributes must be escaped with backslashes

Do NOT include any explanation. Only output the JSON.

Always include the minimum necessary files that reflect the requested change.`;

      console.log("Formatting file tree...");
      const fileTreeContent = this.formatFileTreeForPrompt(
        this.currentFileTree
      );

      const prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      console.log("Calling Anthropic streaming API...");

      const stream = await this.client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: true,
      });

      let fullContent = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      let model = "claude-3-haiku-20240307";

      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          fullContent += chunk.delta.text;
        } else if (chunk.type === "message_start" && chunk.message.usage) {
          usage.input_tokens = chunk.message.usage.input_tokens;
          model = chunk.message.model;
        } else if (chunk.type === "message_delta" && chunk.usage) {
          usage.output_tokens = chunk.usage.output_tokens;
        }
      }

      console.log("Anthropic streaming API response received");

      // Save raw AI response to disk
      this.saveToLogFile("raw_ai_response.txt", fullContent);

      // Extract and validate JSON response
      const rawChanges = JSON.parse(fullContent);

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

      // Save updated file tree to database
      if (this.databaseService && this.projectId) {
        console.log("Saving updated file tree to database...");
        await this.databaseService.saveFileTree(this.currentFileTree, this.projectId);
      }

      // Save to disk
      console.log("Saving files to disk...");
      const appDir = this.saveFileTreeToDisk(this.currentFileTree);

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
        content: JSON.stringify(responseData),
        model,
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(
        `Anthropic streaming API error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
