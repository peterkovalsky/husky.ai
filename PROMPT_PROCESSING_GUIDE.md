# Husky AI Prompt Processing Guide

A comprehensive, easy-to-understand guide on how user prompts are transformed into live React applications.

---

## Overview

When a user submits a prompt like "Create a landing page for a coffee shop," Husky AI processes it through a sophisticated pipeline that generates, builds, and deploys a complete React application. Here's exactly how it works:

---

## The Complete Flow

### **Phase 1: User Submits Prompt**
📍 *Location: Frontend → API*

1. **User enters prompt** in the frontend interface
2. **Frontend sends request** to `/api/projects/:projectId/prompts` endpoint
3. **API creates prompt record** in database with status `QUEUED`
4. **Job message is created** with:
   - `promptId` - Unique identifier for this request
   - `prompt` - The actual user text
   - `projectId` - Which project this belongs to
   - `userId` - Who made the request
5. **Job is queued to AWS SQS** for asynchronous processing
6. **API immediately responds** to frontend with prompt details (doesn't wait for processing)

**Key Files:**
- `api/src/presentation/controllers/PromptController.ts` - Handles HTTP request
- `api/src/infrastructure/queue/SQSQueueService.ts` - Sends to queue

---

### **Phase 2: Job Picked Up by Background Processor**
📍 *Location: ProcessJobUseCase*
📄 *File: `api/src/application/use-cases/ProcessJobUseCase.ts:51`*

1. **Background worker polls SQS queue** for new jobs
2. **Receives job message** with prompt details
3. **Validates prompt exists** in database
4. **Checks for duplicates** - if prompt already has a build, skip it
5. **Creates new build record** in database with status `PROCESSING`
6. **Links prompt to build** by updating `buildId` in prompt record

**Key Point:** Each prompt creates a new versioned build (v1, v2, v3, etc.)

---

### **Phase 3: Load Project Context**
📍 *Location: ProcessJobUseCase*
📄 *File: `api/src/application/use-cases/ProcessJobUseCase.ts:98-107`*

1. **Loads existing file tree** for the project:
   - **First tries:** Latest successful build's file tree from database
   - **Fallback:** Template file tree from `template-react18-ts.json`
2. **Sets AI service context** with current file tree and build ID
3. **Gathers conversation history** - retrieves all previous prompts for this project to give AI context

**Why This Matters:** The AI sees the current state of the app, not just the new request. This enables iterative development.

---

### **Phase 4: AI Generation**
📍 *Location: AnthropicAIService*
📄 *File: `api/src/infrastructure/ai/AnthropicAIService.ts:109`*

#### 4.1 **Prepare AI Request**
1. **Formats current file tree** into readable text format
2. **Combines with user prompt**
3. **Includes system instructions** that tell AI:
   - Use React, TypeScript, Tailwind CSS, DaisyUI
   - Create industry-appropriate designs
   - Use web search only when needed (for current trends, external APIs, etc.)
   - Return ONLY a JSON object with file changes

#### 4.2 **Call Anthropic API**
```javascript
// Sends to Claude Sonnet 4.5 with streaming
model: "claude-sonnet-4-5-20250929"
max_tokens: 32768
tools: [web_search] // Up to 10 searches allowed
```

#### 4.3 **Receive & Process Response**
1. **Streams response** from Anthropic API
2. **Collects raw content** piece by piece
3. **Tracks token usage** (input and output tokens)
4. **Saves raw AI response** to database immediately
5. **Extracts JSON** from response
6. **Normalizes file changes**:
   - Regular files → stored as strings
   - Files marked `"__DELETE__"` → flagged for deletion
7. **Returns structured response** with changes and updated file tree

**AI Response Format:**
```json
{
  "src/App.tsx": "import React from \"react\"...",
  "src/components/Hero.tsx": "export const Hero = () => {...}",
  "package.json": "{\"name\": \"app\", ...}",
  "oldFile.tsx": "__DELETE__"
}
```

---

### **Phase 5: File Tree Merging**
📍 *Location: ProcessJobUseCase*
📄 *File: `api/src/application/use-cases/ProcessJobUseCase.ts:123-136`*

1. **Merges AI changes** with current file tree using `FileTreeMerger`
2. **Merge logic:**
   - **New files** → Added to tree
   - **Modified files** → Updated with new content
   - **Deleted files** → Removed from tree
   - **Unchanged files** → Kept as-is
3. **Logs merge statistics** (files added, modified, deleted)
4. **Updates build record** in database with merged file tree

**Result:** Complete file tree representing the new app version

---

### **Phase 6: Save to Disk**
📍 *Location: BuildService*
📄 *File: `api/src/infrastructure/build/BuildService.ts:17`*

1. **Creates versioned directory**: `/apps/{projectId}/v{version}/`
2. **Writes all files** from merged file tree to disk
3. **Each file path** becomes actual file on disk:
   - `src/App.tsx` → `/apps/{projectId}/v{version}/src/App.tsx`
   - `package.json` → `/apps/{projectId}/v{version}/package.json`
4. **Copies `package-lock.json`** from previous build or template
5. **Starts parallel copy** of `node_modules` from previous build (optimization)

**Why Versioning?** Each iteration creates a new directory, preserving all previous versions.

---

### **Phase 7: Build the App**
📍 *Location: BuildService*
📄 *File: `api/src/infrastructure/build/BuildService.ts:118`*

#### 7.1 **Update Build Status**
- Changes status from `PROCESSING` to `BUILDING` in database

#### 7.2 **Install Dependencies**
```bash
cd /apps/{projectId}/v{version}
npm install --silent --no-audit --no-fund
```
- Waits for node_modules copy to complete (if running)
- Installs or updates npm packages
- Tracks `dependencyInstallTimeMs`

#### 7.3 **Run Production Build**
```bash
npm run build
# which runs: vite build
```
- Sets `VITE_BASE_PATH=/projects/{projectId}/` for correct routing
- Builds React app to `/dist` folder
- Tracks `buildTimeMs`
- Captures build output and errors

**Build Output:** `/apps/{projectId}/v{version}/dist/` contains production-ready static files

---

### **Phase 8: Deploy to S3**
📍 *Location: S3StorageService*
📄 *File: `api/src/infrastructure/storage/S3StorageService.ts`*

#### 8.1 **Upload Production Build**
1. **Reads `/dist` folder** from build directory
2. **Uploads all files** to S3 main bucket:
   - Path: `projects/{projectId}/*`
   - Sets proper MIME types (text/html, text/css, etc.)
   - Makes files publicly accessible
3. **Tracks upload time** in `s3UploadTimeMs`
4. **Generates preview URL**: `https://{bucket}.s3.amazonaws.com/projects/{projectId}/index.html`

#### 8.2 **Upload Version History** (Parallel)
Two additional uploads to versions bucket:
1. **Source code**: `/v{version}/source/` - all source files
2. **Production build**: `/v{version}/production/` - dist folder

**Tracks**: `versionSourceUploadTimeMs`, `versionProductionUploadTimeMs`

---

### **Phase 9: Finalize & Update Status**
📍 *Location: ProcessJobUseCase*
📄 *File: `api/src/application/use-cases/ProcessJobUseCase.ts:189-260`*

1. **Calculates total time** from job start
2. **Updates build metrics** in database:
   ```javascript
   {
     aiGenerationTimeMs: 45000,
     dependencyInstallTimeMs: 12000,
     buildTimeMs: 8000,
     s3UploadTimeMs: 3000,
     totalTimeMs: 68000
   }
   ```
3. **Updates project preview URL** (only if not already set)
4. **Updates build status** to `READY`
5. **Updates token usage** (input/output tokens from AI)
6. **Logs completion** with preview URL

**If Any Error Occurs:**
- Status set to `FAILED`
- Error details logged
- Metrics still saved for analysis

---

## Status Progression

Throughout the process, the build status updates:

```
QUEUED → PROCESSING → BUILDING → READY
   ↓          ↓           ↓          ↓
Queue    AI Gen     npm build   Done!
         + Merge    + S3 upload
```

Or on error:
```
QUEUED → PROCESSING → FAILED
```

---

## Key Optimizations

### **1. Parallel Node Modules Copy**
- While AI is generating, copies `node_modules` from previous build
- Speeds up `npm install` significantly
- Falls back to fresh install if copy fails

### **2. Streaming AI Response**
- Processes Claude's response as it arrives
- Saves raw response immediately to database
- No waiting for complete response before proceeding

### **3. File Tree Merging**
- Only sends changed files in AI response
- Merges with existing tree to preserve unchanged files
- Reduces AI response size and processing time

### **4. Async Job Processing**
- User gets immediate response
- Processing happens in background
- Frontend polls for status updates

---

## Database Schema

Key tables involved:

**projects**
- `id`, `name`, `description`, `preview_url`, `workspace_id`

**prompts**
- `id`, `prompt`, `project_id`, `user_id`, `build_id`, `raw_ai_response`
- `input_tokens`, `output_tokens`, `duration_ms`

**builds**
- `id`, `project_id`, `version`, `status`, `file_tree`
- `ai_generation_time_ms`, `build_time_ms`, `s3_upload_time_ms`, `total_time_ms`

---

## Error Handling

At each phase, errors are caught and:
1. **Status updated** to `FAILED`
2. **Metrics saved** (even partial ones)
3. **Error logged** for debugging
4. **Job re-thrown** to trigger retry mechanism (if configured)

---

## Example Timeline

For a typical "Create a landing page" prompt:

| Time | Phase | Activity |
|------|-------|----------|
| 0s | Phase 1 | User submits → API queues job |
| 1s | Phase 2 | Background worker picks up job |
| 2s | Phase 3 | Loads existing file tree |
| 2-45s | Phase 4 | Claude generates React components |
| 46s | Phase 5 | Merges file changes |
| 47s | Phase 6 | Writes 25 files to disk |
| 48-60s | Phase 7 | npm install + build |
| 61-64s | Phase 8 | Uploads to S3 |
| 65s | Phase 9 | Updates status to READY ✓ |

**Total: ~65 seconds** from prompt to live preview URL!

---

## Architecture Patterns Used

✅ **Clean Architecture** - Domain, Application, Infrastructure, Presentation layers
✅ **Repository Pattern** - Abstract database access
✅ **Use Case Pattern** - Each business operation is isolated
✅ **Dependency Injection** - Services injected via DIContainer
✅ **Queue-Based Processing** - Asynchronous job handling
✅ **Versioning** - Every build is preserved

---

This guide covers the complete journey from user prompt to deployed React application. Each phase is critical to delivering a fast, reliable, and high-quality AI-powered development experience.
