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

### Frontend Architecture
- **React 19** with TypeScript and Vite
- **State Management**: React Context for auth and project state
- **API Integration**: Centralized API service with polling for job status
- **Routing**: React Router for navigation
- **Styling**: Tailwind CSS with Radix UI components

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
- `S3_BUCKET_NAME`, `S3_VERSIONS_BUCKET_NAME` - File storage
- `SQS_QUEUE_URL` - Job queue
- `PORT` (optional, defaults to 3333), `NODE_ENV`

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