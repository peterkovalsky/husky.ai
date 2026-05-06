# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Rules
- **NEVER run `git push` unless the user explicitly asks to push.** Commits are fine, but pushing triggers deployments and must always be a deliberate user decision.

## Dependency Management
- **After editing any `package.json`, regenerate `package-lock.json` in the same change.** Run `npm install` (or `npm install --package-lock-only`) in that directory and stage both files together. The worker Docker image runs `npm ci` over each bundled template's `package.json` during build, and `npm ci` aborts on drift — a missed lockfile in [#107](https://github.com/Husky-Studio/husky.ai/pull/107) broke the worker Cloud Run deploy and required hotfix [#108](https://github.com/Husky-Studio/husky.ai/pull/108). Applies to every `package.json` in this repo (`api/`, `worker/`, `frontend/`, `base/`, `templates/*/`).

## Common Development Commands

### API (Backend) - `/api`
- `npm run dev` - Start development server with nodemon auto-restart
- `npm run dev:debug` - Start with debugging on port 9229
- `npm run build` - TypeScript compilation and copy JSON files to dist/
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Frontend - `/frontend`
- `npm run dev` - Start Vite development server (port 5174)
- `npm run build` - TypeScript build + Vite production build
- `npm run lint` - ESLint code quality check
- `npm run preview` - Preview production build

### Base Template - `/base`
- `npm run dev` - Vite dev server for base React template
- `npm run build` - Build base template
- `npm run lint` - Lint base template code

### React Template - `/templates/react18-ts`
- `npm run dev` - Vite dev server for React 18 TypeScript template
- `npm run build` - Build React template
- `npm run lint` - Lint template code

## Architecture Overview

This is Husky AI, a React app generator with asynchronous processing. The system follows Clean Architecture patterns with clear separation of concerns.

### API Backend Architecture (Clean Architecture)
The API follows Clean Architecture with four distinct layers:

**Domain Layer** (`/src/domain/`)
- Entities: Core business objects (Project, User, Build, Prompt, Workspace)
- Repository Interfaces: Contracts for data access
- Service Interfaces: Contracts for external services (AI, Queue, Storage, Build)

**Application Layer** (`/src/application/`)
- Use Cases: Business logic orchestration (CreateProject, ProcessJob, etc.)
- DTOs: Data transfer objects for API contracts
- Services: Application-specific services (JobProcessor, LegacyJobStatus)

**Infrastructure Layer** (`/src/infrastructure/`)
- Database: Supabase repository implementations (includes AILogRepository for execution tracking)
- AI: Provider-agnostic architecture with Anthropic and OpenAI implementations
  - BaseAIProvider: Common file tree management and response parsing
  - AnthropicProvider: Claude Sonnet/Haiku integration
  - OpenAIProvider: GPT-5.1 integration
  - AIService: Orchestrator with automatic logging to ai_logs table
- Queue: AWS SQS integration
- Storage: AWS S3 integration
- Auth: Supabase authentication

**Presentation Layer** (`/src/presentation/`)
- Controllers: HTTP request handling
- Routes: Express route definitions
- Middleware: Authentication and workspace access control

**Shared** (`/src/shared/`)
- DIContainer: Simple dependency injection container
- AppConfig: Configuration management
- Logger: Logging utilities

### Key Architectural Patterns
- **Dependency Injection**: Custom DIContainer manages service registration and resolution
- **Repository Pattern**: Abstract data access through interfaces
- **Use Case Pattern**: Each business operation is a separate use case class
- **Clean Architecture**: Dependencies point inward, external concerns are in outer layers
- **Fail Fast**: NEVER supply default values for missing required data. If a required value is missing, throw a clear exception immediately. Silent fallbacks mask bugs and create unpredictable behavior.

### AI Provider Architecture
**Provider-agnostic architecture with dual-provider support and automatic execution logging**

The system uses a flexible AI provider architecture that supports multiple AI services with configurable primary (first builds) and fast (iterations) providers.

**Architecture Layers:**
1. **IAIProvider Interface**: Defines contract for AI providers (generateResponse, setProjectContext, etc.)
2. **BaseAIProvider**: Abstract class with common logic (file tree management, JSON parsing, response normalization)
3. **Shared System Prompt**: `prompts/SystemPrompt.ts` - Centralized prompt used by all providers
4. **Provider Implementations**:
   - `AnthropicProvider`: Claude Sonnet 4.5 & Haiku 4.5 integration
   - `OpenAIProvider`: GPT-5.1 & GPT-5.1-chat-latest integration
   - `GeminiProvider`: Gemini 3 Pro & Gemini 2.5 Flash integration
5. **AIService Orchestrator**: Manages dual-provider selection and automatic logging

**Supported Providers & Models:**
- **Anthropic** (default):
  - `claude-sonnet-4-5-20250929` - Primary model for first builds and complex tasks
  - `claude-haiku-4-5-20251001` - Faster model for iterative builds
- **OpenAI**:
  - `gpt-5.1` - Reasoning model (Sonnet equivalent)
  - `gpt-5.1-chat-latest` - Instant model (Haiku equivalent)
- **Gemini**:
  - `gemini-3-pro-preview` - Latest reasoning model ($2/$12 per million tokens)
  - `gemini-2.5-flash` - Best price-performance ($0.30/$2.50 per million tokens)

**Configuration (Dual-Provider Support):**
```bash
# Primary provider for first builds (sonnet-equivalent, higher quality)
AI_PROVIDER_PRIMARY=gemini          # 'anthropic' | 'openai' | 'gemini'
AI_MODEL_PRIMARY=gemini-3-pro-preview

# Fast provider for iterations (haiku-equivalent, faster/cheaper)
AI_PROVIDER_FAST=anthropic          # 'anthropic' | 'openai' | 'gemini'
AI_MODEL_FAST=claude-haiku-4-5-20251001

# API Keys
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

**Defaults (if env vars not set):**
- Primary: Anthropic Claude Sonnet 4.5
- Fast: Anthropic Claude Haiku 4.5

**Automatic Logging:**
- All AI executions are automatically logged to `ai_logs` table
- Logs include: provider, model, tokens, cost, duration, full prompts/responses
- Dual tracking: `prompts` table (high-level) + `ai_logs` table (detailed execution)
- No code changes needed in use cases - logging happens in AIService orchestrator

**Cost Tracking (per million tokens):**
| Provider | Model | Input | Output |
|----------|-------|-------|--------|
| Anthropic | claude-sonnet-4-5 | $3.00 | $15.00 |
| Anthropic | claude-haiku-4-5 | $1.00 | $5.00 |
| OpenAI | gpt-5.1 | $1.25 | $10.00 |
| Gemini | gemini-3-pro-preview | $2.00 | $12.00 |
| Gemini | gemini-2.5-flash | $0.30 | $2.50 |

**Adding New Providers:**
1. Create new provider class extending `BaseAIProvider`
2. Import `getSystemPrompt()` from `./prompts/SystemPrompt.ts`
3. Add pricing to `CostCalculator.ts`
4. Register in `ContainerSetup.ts`
5. Add provider type to `AppConfig.ts`

### Frontend Architecture
- **React 19** with TypeScript and Vite
- **State Management**: React Context for auth and project state
- **API Integration**: Centralized API service with polling for job status
- **Routing**: React Router for navigation
- **Styling**: Tailwind CSS with HeroUI components
- **UI Components**: HeroUI (https://www.heroui.com)
- **Component Design**: Reusable components with data extracted to constants

### Documentation Strategy
**ALWAYS use context7 MCP tools to fetch the latest API documentation**

When working with any library or framework in this project:
1. Use `mcp__context7__resolve-library-id` to find the correct library ID
2. Use `mcp__context7__get-library-docs` to fetch up-to-date documentation
3. Reference the retrieved docs for accurate API usage, props, and examples

**Key libraries to fetch docs for:**
- HeroUI/NextUI components
- React 19
- Vite
- TypeScript
- Tailwind CSS
- Express
- Supabase (JavaScript client)
- AWS SDK (S3, SQS)
- Anthropic SDK
- OpenAI SDK

### UI Component Standards
**ALWAYS use HeroUI components - fetch latest docs via context7 before implementing**

When building UI features:
- ✅ DO: Use context7 to get latest HeroUI component documentation
- ✅ DO: Use HeroUI components (Button, Card, Modal, Alert, Input, etc.)
- ✅ DO: Reference fetched docs for component APIs and props
- ✅ DO: Use HeroUI's color variants (primary, secondary, success, warning, danger)
- ✅ DO: Leverage built-in HeroUI features (variants, sizes, states)
- ❌ DON'T: Create custom components when HeroUI provides equivalent functionality
- ❌ DON'T: Use custom divs/spans when HeroUI components are available
- ❌ DON'T: Manually style alerts/notifications - use HeroUI Alert component
- ❌ DON'T: Rely on outdated documentation - always fetch fresh docs via context7

**Available HeroUI Components:**
- Layout: Card, CardBody, CardHeader, CardFooter, Divider, Spacer
- Forms: Input, Textarea, Select, Checkbox, Radio, Switch, Slider
- Feedback: Alert, Modal, Popover, Tooltip, Spinner, Progress
- Navigation: Button, Dropdown, Tabs, Breadcrumbs, Pagination
- Data Display: Table, Code, Chip, Badge, Avatar, User
- And 60+ more components

**Example - Preferred Approach:**
```typescript
// GOOD: Using HeroUI components
import { Alert, Card, CardBody, Code } from '@heroui/react'

<Alert color="warning" variant="flat" description="Warning message" />
<Card><CardBody><Code>npm install</Code></CardBody></Card>
```

```typescript
// BAD: Custom divs instead of HeroUI components
<div className="bg-warning-50 border border-warning-200 rounded p-3">
  <p className="text-warning-700">Warning message</p>
</div>
```

### Design Consistency Standards
**CRITICAL: Always follow existing design patterns when implementing or updating UI**

**Exception:** If the user explicitly requests a change in design direction (e.g., "make it more minimal", "use a dark theme", "redesign this section"), then deviate from existing patterns as requested.

Before implementing or modifying any UI section or element:
1. **Study existing patterns** - Read related components to understand the current design language
2. **Match styling conventions** - Use the same spacing, colors, typography, and layout patterns
3. **Maintain visual hierarchy** - Follow established heading sizes, padding, and margin patterns
4. **Reuse existing components** - Check if similar UI patterns exist elsewhere and reuse them

**When updating existing UI:**
- ✅ DO: Read the entire file/component first to understand the design context
- ✅ DO: Match the existing color scheme, spacing, and typography
- ✅ DO: Use the same Tailwind classes for similar elements (e.g., if cards use `rounded-xl`, use that)
- ✅ DO: Follow the same responsive breakpoints (e.g., `md:grid-cols-2 lg:grid-cols-3`)
- ✅ DO: Maintain consistent icon sizes, button variants, and interactive states
- ❌ DON'T: Introduce new design patterns without checking existing ones
- ❌ DON'T: Use different spacing/sizing for similar elements
- ❌ DON'T: Mix design styles (e.g., some cards with shadows, others without)

**Example - Before implementing a new feature card:**
```typescript
// FIRST: Check how existing feature cards are styled
// Look at: colors, padding, border-radius, shadows, hover states, icon sizes

// THEN: Match the existing pattern
<Card className="bg-white/10 backdrop-blur-sm border-white/20"> // Match existing card style
  <CardBody className="p-6"> // Match existing padding
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500"> // Match icon container style
      <Icon className="w-6 h-6" /> // Match icon size
    </div>
    <h3 className="text-xl font-semibold mt-4"> // Match heading style
    <p className="text-gray-400 mt-2"> // Match description style
  </CardBody>
</Card>
```

### Component Reusability Standards
**CRITICAL: Always create reusable components and extract data to constants**

When building React components:

**1. Identify Repetition (DRY Principle)**
- ✅ DO: Create a reusable component when you see the same structure 2+ times
- ✅ DO: Extract props interface for type safety
- ✅ DO: Use composition over duplication
- ❌ DON'T: Copy-paste similar JSX structures
- ❌ DON'T: Keep inline data when there are 3+ similar items

**2. Extract Data to Constants**
- ✅ DO: Create separate data files (e.g., `src/data/features.ts`)
- ✅ DO: Define data as typed constants outside components
- ✅ DO: Map over data arrays to render components
- ❌ DON'T: Hardcode data directly in JSX
- ❌ DON'T: Repeat similar objects inline in components

**3. Component Structure Pattern**
```
src/
  components/
    FeatureCard.tsx     # Reusable component
    PricingCard.tsx     # Reusable component
  data/
    features.ts         # Data constants
    pricing.ts          # Data constants
  pages/
    Features.tsx        # Composition (maps data to components)
```

**Example - BAD (Repetitive, Inline Data):**
```typescript
// ❌ DON'T: Repeat similar structures
export default function Features() {
  return (
    <div>
      <div className="card">
        <div className="card-body">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500">
            <ChatIcon />
          </div>
          <h3>Smart Questions</h3>
          <p>Our AI asks intelligent questions...</p>
        </div>
      </div>

      {/* Same structure repeated 5 more times - BAD! */}
      <div className="card">
        <div className="card-body">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500">
            <PaletteIcon />
          </div>
          <h3>Beautiful Design</h3>
          <p>Professional UI components...</p>
        </div>
      </div>
      {/* ... more repetition ... */}
    </div>
  );
}
```

**Example - GOOD (Reusable Component + Data Constants):**

**Step 1: Create data constant** (`src/data/features.ts`)
```typescript
import { ChatIcon, PaletteIcon, BoltIcon } from '../components/SVGIcons';

export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradientFrom: string;
  gradientTo: string;
}

export const FEATURES: Feature[] = [
  {
    icon: <ChatIcon />,
    title: 'Smart Questions',
    description: 'Our AI asks intelligent questions...',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-indigo-500',
  },
  {
    icon: <PaletteIcon />,
    title: 'Beautiful Design',
    description: 'Professional UI components...',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-cyan-500',
  },
  // ... more features
];
```

**Step 2: Create reusable component** (`src/components/FeatureCard.tsx`)
```typescript
import { Feature } from '../data/features';

export default function FeatureCard({
  icon,
  title,
  description,
  gradientFrom,
  gradientTo
}: Feature) {
  return (
    <div className="card bg-white shadow-xl">
      <div className="card-body">
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradientFrom} ${gradientTo} flex items-center justify-center mb-4`}>
          {icon}
        </div>
        <h3 className="card-title text-2xl mb-2">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}
```

**Step 3: Use composition** (`src/pages/Features.tsx`)
```typescript
import FeatureCard from '../components/FeatureCard';
import { FEATURES } from '../data/features';

export default function Features() {
  return (
    <section>
      <h2>Features</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {FEATURES.map((feature, index) => (
          <FeatureCard key={index} {...feature} />
        ))}
      </div>
    </section>
  );
}
```

**Benefits:**
- **Maintainability**: Change card design once, updates everywhere
- **Type Safety**: TypeScript interfaces ensure consistency
- **Readability**: Clear separation of data and presentation
- **Performance**: Smaller bundle size, better tree-shaking
- **AI Efficiency**: Reduces token usage by 40-50% when regenerating
- **Testing**: Easy to test reusable components in isolation

**When to Extract:**
- 2+ identical or very similar components → Create reusable component
- 3+ data objects with same structure → Extract to constants file
- Inline styling repeated → Move to reusable component or Tailwind classes
- Complex prop drilling → Consider data file + spread operator

### Project Structure
Generated apps are stored in project directories:
- `/projects/{project-id}/web/` - Working directory for each project
- Templates in `/templates/` provide base structure for generated apps

### Job Processing Flow
1. User submits prompt → API creates job in database
2. Job queued to AWS SQS
3. Background processor picks up job
4. AI generates React app code using Anthropic
5. App built and deployed to S3 with preview URL
6. Status updated throughout process (QUEUED → PROCESSING → BUILDING → READY)

## Environment Setup

### GCP CLI Authentication
**Use the service account for gcloud CLI operations**

A dedicated service account `claude-code-dev@husky-ai-prod.iam.gserviceaccount.com` is configured for Claude Code to use when running gcloud commands.

**Activate the service account:**
```bash
gcloud auth activate-service-account --key-file=/Users/peter/git/HuskyStudio/husky.ai/husky.ai/.gcp-claude-code-prod.json
```

**Permissions granted:**
| Role | Purpose |
|------|---------|
| `roles/run.developer` | Deploy Cloud Run services |
| `roles/secretmanager.admin` | Create/manage secrets |
| `roles/artifactregistry.writer` | Push Docker images |
| `roles/cloudtasks.admin` | Manage Cloud Tasks queues |
| `roles/iam.serviceAccountUser` | Act as service accounts for deployments |
| `roles/logging.viewer` | View logs for debugging |

**Key file location:** `.gcp-claude-code-prod.json` (gitignored)

### Required Environment Variables (API)
All variables are required for startup:
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` - Database access
- **AI Provider Configuration:**
  - `AI_PROVIDER` - Provider selection: 'anthropic' | 'openai' (default: 'anthropic')
  - `ANTHROPIC_API_KEY` - Required if AI_PROVIDER=anthropic
  - `OPENAI_API_KEY` - Required if AI_PROVIDER=openai
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS services
- `S3_BUCKET_NAME` - Preview bucket (dev-husky-app-previews)
- `S3_PROJECTS_BUCKET_NAME` - Projects/versions bucket (dev-husky-projects)
- `SQS_QUEUE_URL` - Job queue
- `PORT` (optional, defaults to 3333; set to 3433 in local dev to avoid conflicts), `NODE_ENV`

### S3 Bucket Structure
The system uses two S3 buckets:

**Preview Bucket** (`S3_BUCKET_NAME`): For live app previews
```
dev-husky-app-previews/
  projects/
    <project_id>/
      index.html
      assets/
```

**Projects Bucket** (`S3_PROJECTS_BUCKET_NAME`): For versioned source code and builds
```
<project_id>/web/v<version_number>/<"source" | "build">
```

Example:
```
dev-husky-projects/
  abc123/
    web/
      v1/
        source/         # Full source code (excludes dist, node_modules)
        build/          # Production build
      v2/
        source/
        build/
```

### Supabase Configuration
**Email Confirmation:** Email confirmation is disabled in the Supabase project settings
- Users can sign up and immediately access the app without email verification
- No "Email not confirmed" errors during signup
- This allows the seamless signup → dashboard → project setup flow

### Development Workflow
1. Start API: `cd api && npm run dev`
2. Start Frontend: `cd frontend && npm run dev`
3. Frontend proxies `/api/*` requests to backend (configured in vite.config.ts)

## Database Schema
- PostgreSQL via Supabase
- Migrations in `/database/migrations/`
- Key tables: projects, builds, prompts, users, workspaces, ai_logs
- **AI Logging:** All AI executions (code generation, auto-fix) are logged to `ai_logs` table
- Recent migrations added version tracking, project descriptions, and comprehensive AI execution logging

### RLS (Row Level Security) Standards
**CRITICAL: Never create tables with public access policies**

When creating new tables:
- ✅ DO: Always enable RLS on new tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- ✅ DO: Restrict read access to authenticated users (`TO authenticated`)
- ✅ DO: Use user-specific policies where appropriate (`USING (user_id = auth.uid())`)
- ❌ DON'T: Create policies with `USING (true)` without `TO authenticated`
- ❌ DON'T: Allow anonymous/public access to any table data

**Example - Correct RLS policy:**
```sql
-- Enable RLS
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- Allow only logged-in users to read
CREATE POLICY "Allow authenticated read" ON my_table
  FOR SELECT
  TO authenticated
  USING (true);

-- Or restrict to user's own data
CREATE POLICY "Users read own data" ON my_table
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

### Database Troubleshooting
**ALWAYS use Supabase MCP tools for database operations, troubleshooting, and checking data**

When you need to inspect, troubleshoot, or fix database issues:
- ✅ DO: Use `mcp__supabase__execute_sql` for querying and checking data
- ✅ DO: Use `mcp__supabase__list_tables` to explore the database schema
- ✅ DO: Use `mcp__supabase__apply_migration` for DDL changes (schema modifications)
- ✅ DO: Use `mcp__supabase__get_advisors` to check for security/performance issues
- ❌ DON'T: Write custom scripts to query the database unless absolutely necessary
- ❌ DON'T: Hardcode database credentials in scripts

**Common database operations:**
```sql
-- Check workspace credits
SELECT id, name, credits_purchased, credits_total_purchased
FROM workspaces WHERE id = 'workspace-id';

-- View recent prompts
SELECT id, prompt, status, created_at
FROM prompts
ORDER BY created_at DESC LIMIT 10;

-- Check credit purchase history
SELECT workspace_id, credits_purchased, amount_paid, created_at
FROM credit_purchases
WHERE workspace_id = 'workspace-id'
ORDER BY created_at;
```

**Example - Using MCP for troubleshooting:**
```typescript
// User reports incorrect credit balance
// ✅ GOOD: Use Supabase MCP to investigate
mcp__supabase__execute_sql({
  query: "SELECT credits_purchased, credits_total_purchased FROM workspaces WHERE id = 'workspace-id'"
})

// ❌ BAD: Writing a custom TypeScript script to query
// Don't create src/scripts/check-credits.ts - use MCP instead
```

## Testing
- API uses Jest with TypeScript support
- Test files: `/api/tests/`
- Example: `AnthropicService.test.ts` tests AI service integration

## Key Services Integration
- **Anthropic Claude**: AI-powered React app generation
- **AWS SQS**: Asynchronous job processing queue
- **AWS S3**: Static file hosting for generated apps
- **Supabase**: Database, authentication, and real-time features

## Generated App Structure
Each generated app includes:
- Vite + React + TypeScript setup
- Tailwind CSS for styling
- ESLint configuration
- Standard build/dev/preview scripts
- Component-based architecture with pages and components folders

## Problem-Solving Approach
**CRITICAL: Always choose robust, proven solutions over quick hacks**

When fixing bugs or implementing features:
- ✅ DO: Investigate and understand the root cause before writing any fix
- ✅ DO: Choose well-understood, proven approaches even if they take longer
- ✅ DO: Add diagnostic logging when the root cause is unclear, rather than guessing
- ✅ DO: Verify your fix actually addresses the confirmed cause, not a hypothetical one
- ❌ DON'T: Add defensive code that masks the real problem without understanding it
- ❌ DON'T: Apply quick hacks or workarounds as the first response
- ❌ DON'T: Treat symptoms instead of root causes

**Hacks as last resort:** If a proper fix is blocked (e.g., third-party bug, time-critical production issue), a hack is acceptable ONLY if you:
1. Clearly tell the user it's a hacky/temporary solution
2. Explain why a proper fix isn't possible right now
3. Add a `// HACK:` comment in the code explaining the workaround and linking to context

## Code Quality Standards

### Error Handling
**CRITICAL: Never use default/fallback values for missing required parameters**

When implementing features or fixing bugs:
- ✅ DO: Throw clear, descriptive exceptions when required data is missing
- ✅ DO: Validate inputs early and fail fast
- ✅ DO: Make required parameters non-optional in function signatures
- ❌ DON'T: Use first available item as fallback (e.g., `projects[0]` when projectId is missing)
- ❌ DON'T: Silently substitute default values for missing required data
- ❌ DON'T: Use fallback logic that masks bugs

**Example - BAD:**
```typescript
// BAD: Silent fallback masks bugs
if (!projectId) {
  const projects = await getProjects();
  projectId = projects[0].id; // Wrong! Uses wrong project
}
```

**Example - GOOD:**
```typescript
// GOOD: Fail fast with clear error
if (!projectId) {
  throw new Error('projectId is required');
}
```

This principle prevents bugs like:
- Building/deploying to wrong projects
- Updating wrong database records
- Accessing wrong user data
- Unpredictable behavior in production

### Environment Variables
**CRITICAL: Never use inline fallback values for environment variables**

Environment variables should be validated at startup, not with inline fallbacks that mask configuration issues.

- ✅ DO: Validate required env vars at app startup and fail immediately if missing
- ✅ DO: Use a central config module that throws on missing required values
- ❌ DON'T: Use inline fallbacks like `process.env.VAR || 'default'` or `import.meta.env.VAR || 'fallback'`
- ❌ DON'T: Hardcode fallback values that could silently use wrong configuration

**Example - BAD:**
```typescript
// BAD: Silent fallback masks missing configuration
const domain = import.meta.env.VITE_PUBLISH_DOMAIN || 'huskystudio.ai';
const apiUrl = process.env.API_URL || 'http://localhost:3333';
```

**Example - GOOD:**
```typescript
// GOOD: Validate at startup in config module
const domain = import.meta.env.VITE_PUBLISH_DOMAIN;
if (!domain) {
  throw new Error('VITE_PUBLISH_DOMAIN environment variable is required');
}

// Or use a validated config object
import { config } from '@/config';
const domain = config.publishDomain; // Already validated at startup
```

**Exception:** Fallbacks are acceptable only for truly optional features (e.g., analytics, feature flags) where the app should still function without them.