import Anthropic from '@anthropic-ai/sdk';
import { AIService, AIResponse } from './AIService';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

interface FileTreeItem {
  path: string;
  content: string;
}

export class AnthropicService extends AIService {
  private client: Anthropic;
  private currentFileTree: FileTreeItem[] = [];
  private readonly reactAppFilesPath: string;
  private readonly appsDir: string;
  private readonly execAsync = promisify(exec);

  constructor(apiKey?: string) {
    super();
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.reactAppFilesPath = path.join(__dirname, '../react-app-files.json');
    this.appsDir = path.join(__dirname, '../apps');
    this.loadInitialFileTree();
  }

  private loadInitialFileTree(): void {
    try {
      const fileContent = fs.readFileSync(this.reactAppFilesPath, 'utf8');
      this.currentFileTree = JSON.parse(fileContent);
    } catch (error) {
      console.error('Error loading initial file tree:', error);
      this.currentFileTree = [];
    }
  }

  private formatFileTreeForPrompt(fileTree: FileTreeItem[]): string {
    return fileTree.map(file => {
      return `${file.path}:\n${file.content}`;
    }).join('\n\n---\n\n');
  }

  private extractAndValidateJSON(str: string): { isValid: boolean; json: any; cleanedStr: string } {
    try {
      // First try to parse as-is
      const parsed = JSON.parse(str);
      return { isValid: true, json: parsed, cleanedStr: str };
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = str.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        try {
          const parsed = JSON.parse(jsonStr);
          return { isValid: true, json: parsed, cleanedStr: jsonStr };
        } catch {
          // Try to fix common JSON issues
          try {
            // Attempt to fix unescaped quotes by using a more robust approach
            jsonStr = this.fixMalformedJSON(jsonStr);
            const parsed = JSON.parse(jsonStr);
            return { isValid: true, json: parsed, cleanedStr: jsonStr };
          } catch {
            // If that fails, try to find the first { and last }
            const firstBrace = str.indexOf('{');
            const lastBrace = str.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              const extractedStr = str.substring(firstBrace, lastBrace + 1);
              try {
                const fixedStr = this.fixMalformedJSON(extractedStr);
                const parsed = JSON.parse(fixedStr);
                return { isValid: true, json: parsed, cleanedStr: fixedStr };
              } catch {
                return { isValid: false, json: null, cleanedStr: str };
              }
            }
          }
        }
      }
      return { isValid: false, json: null, cleanedStr: str };
    }
  }

  private fixMalformedJSON(jsonStr: string): string {
    // Simple fix for common JSON issues
    try {
      // Use a more robust approach: treat the JSON as a template and re-parse each property
      const regex = /"([^"]+)"\s*:\s*"([\s\S]*?)"/g;
      const properties: { [key: string]: string } = {};
      let match;
      
      while ((match = regex.exec(jsonStr)) !== null) {
        const key = match[1];
        const value = match[2];
        // Store the raw value, we'll properly escape it when rebuilding
        properties[key] = value;
      }
      
      // Rebuild the JSON with proper escaping
      const rebuiltJson = JSON.stringify(properties, null, 2);
      return rebuiltJson;
    } catch {
      // If our fix attempt fails, return original
      return jsonStr;
    }
  }

  private normalizeChanges(rawChanges: any): Record<string, string> {
    const normalized: Record<string, string> = {};
    
    for (const [filePath, content] of Object.entries(rawChanges)) {
      if (content === '__DELETE__') {
        normalized[filePath] = '__DELETE__';
      } else if (typeof content === 'string') {
        normalized[filePath] = content;
      } else if (typeof content === 'object' && content !== null) {
        // Handle nested object responses
        if ((content as any).__DELETE__ === true) {
          normalized[filePath] = '__DELETE__';
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

  private updateFileTree(changes: Record<string, string>): FileTreeItem[] {
    const newFileTree = [...this.currentFileTree];
    
    for (const [filePath, content] of Object.entries(changes)) {
      if (content === '__DELETE__') {
        // Remove file from tree
        const index = newFileTree.findIndex(file => file.path === filePath);
        if (index !== -1) {
          newFileTree.splice(index, 1);
        }
      } else {
        // Update existing file or add new file
        const existingIndex = newFileTree.findIndex(file => file.path === filePath);
        if (existingIndex !== -1) {
          newFileTree[existingIndex].content = content;
        } else {
          newFileTree.push({ path: filePath, content });
        }
      }
    }
    
    return newFileTree;
  }

  private saveFileTreeToDisk(fileTree: FileTreeItem[]): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const appDir = path.join(this.appsDir, `app-${timestamp}`);
    
    // Create apps directory if it doesn't exist
    if (!fs.existsSync(this.appsDir)) {
      fs.mkdirSync(this.appsDir, { recursive: true });
    }
    
    // Create app directory
    fs.mkdirSync(appDir, { recursive: true });
    
    // Write all files to disk
    for (const file of fileTree) {
      const filePath = path.join(appDir, file.path);
      const fileDir = path.dirname(filePath);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      
      // Write file
      fs.writeFileSync(filePath, file.content, 'utf8');
    }
    
    return appDir;
  }

  private async runBuild(appDir: string): Promise<{ success: boolean; output: string; error?: string }> {
    try {
      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDir, 'package.json');
      let buildCommand = 'npm run build';
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        // Check if vite is available, prefer vite build over npm run build
        if (packageJson.devDependencies?.vite || packageJson.dependencies?.vite) {
          buildCommand = 'npx vite build';
        }
      }
      
      // Install dependencies first with timeout and optimizations
      console.log('Installing dependencies...');
      
      // Check if package-lock.json exists, use npm ci if it does, otherwise npm install
      const packageLockPath = path.join(appDir, 'package-lock.json');
      const installCommand = fs.existsSync(packageLockPath) 
        ? 'npm ci --silent --no-audit --no-fund'
        : 'npm install --silent --no-audit --no-fund';
      
      console.log(`Running: ${installCommand}`);
      await this.execAsync(installCommand, { 
        cwd: appDir,
        timeout: 180000, // 3 minutes timeout
        killSignal: 'SIGTERM'
      });
      
      console.log('Dependencies installed successfully');
      
      // Run build command with timeout
      console.log('Running build...');
      const { stdout, stderr } = await this.execAsync(buildCommand, { 
        cwd: appDir,
        timeout: 120000, // 2 minutes timeout
        killSignal: 'SIGTERM'
      });
      
      console.log('Build completed successfully');
      
      return {
        success: true,
        output: stdout,
        error: stderr || undefined
      };
    } catch (error: any) {
      console.error('Build process error:', error);
      
      if (error.code === 'TIMEOUT' || error.killed) {
        return {
          success: false,
          output: error.stdout || '',
          error: 'Build process timed out or was interrupted'
        };
      }
      
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message
      };
    }
  }

  async generateResponse(userRequest: string): Promise<AIResponse> {
    try {
      console.log('Starting generateResponse...');
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

      console.log('Formatting file tree...');
      const fileTreeContent = this.formatFileTreeForPrompt(this.currentFileTree);
      
      const prompt = `Current app:
${fileTreeContent}

Request:
${userRequest}`;

      console.log('Calling Anthropic API...');
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      console.log('Anthropic API response received');
      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      // Extract and validate JSON response
      const jsonResult = this.extractAndValidateJSON(content);
      
      if (!jsonResult.isValid) {
        console.error('AI response is not valid JSON:', content);
        throw new Error(`AI response is not valid JSON. Response: ${content.substring(0, 200)}...`);
      }

      // Parse and normalize the changes
      console.log('Parsing and normalizing changes...');
      const rawChanges = jsonResult.json;
      const changes = this.normalizeChanges(rawChanges);
      
      // Update file tree in memory
      console.log('Updating file tree in memory...');
      this.currentFileTree = this.updateFileTree(changes);
      
      // Save to disk
      console.log('Saving files to disk...');
      const appDir = this.saveFileTreeToDisk(this.currentFileTree);

      // Run build process and wait for completion
      console.log('Starting build process...');
      const buildResult = await this.runBuild(appDir);
      console.log('Build process completed');

      const responseData = {
        changes,
        appDirectory: appDir,
        buildResult,
        message: `App updated successfully. Files saved to: ${appDir}. Build ${buildResult.success ? 'succeeded' : 'failed'}.`
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
      throw new Error(`Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}