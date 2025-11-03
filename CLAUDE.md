# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### API (Backend) - `/api`
- `npm run dev` - Start development server with nodemon auto-restart
- `npm run dev:debug` - Start with debugging on port 9229
- `npm run build` - TypeScript compilation and copy JSON files to dist/
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Frontend - `/frontend`
- `npm run dev` - Start Vite development server (port 5173)
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
- Database: Supabase repository implementations
- AI: Anthropic AI service integration
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

### Frontend Architecture
- **React 19** with TypeScript and Vite
- **State Management**: React Context for auth and project state
- **API Integration**: Centralized API service with polling for job status
- **Routing**: React Router for navigation
- **Styling**: Tailwind CSS with HeroUI components
- **UI Components**: HeroUI (https://www.heroui.com)

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

### Required Environment Variables (API)
All variables are required for startup:
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` - Database access
- `ANTHROPIC_API_KEY` - AI service
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - AWS services
- `S3_BUCKET_NAME` - Preview bucket (dev-husky-app-previews)
- `S3_PROJECTS_BUCKET_NAME` - Projects/versions bucket (dev-husky-projects)
- `SQS_QUEUE_URL` - Job queue
- `PORT` (optional, defaults to 3333), `NODE_ENV`

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
- Key tables: projects, builds, prompts, users, workspaces
- Recent migrations added version tracking and project descriptions

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