# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Note:** See the parent `/CLAUDE.md` for monorepo-wide standards (UI component standards, component reusability patterns, error handling principles).

## Development Commands

```bash
npm run dev      # Start Vite dev server (port 5173)
npm run build    # TypeScript build + Vite production build
npm run lint     # ESLint code quality check
npm run preview  # Preview production build
```

## Architecture Overview

React 19 SPA for the Husky AI app generator. Communicates with the backend API at `/api/*`.

### Provider Stack (main.tsx)
Providers wrap the app in this order (outermost to innermost):
```
ErrorBoundary → BrowserRouter → AuthProvider → ToastProvider → HeroUIProvider → PostHogProvider → App
```

### State Management
- **AuthContext**: User session from Supabase, auth methods (signIn, signUp, signOut, resetPassword)
- **ProjectContext**: Workspaces, projects, current selections, credit balance
- **ToastContext**: Global toast notifications

### Key Services
- **ApiService** (`src/services/api.ts`): All backend API calls with auth headers. Includes job status polling.
- **errorTracking** (`src/services/errorTracking.ts`): PostHog integration for error capture
- **supabase** (`src/lib/supabase.ts`): Supabase client for auth

### Routing Structure (App.tsx)
| Path | Component | Auth Required |
|------|-----------|---------------|
| `/signin`, `/signup`, `/forgot-password` | Auth pages | No |
| `/` | NewProjectPage (home) | Yes |
| `/projects` | Home (projects list) | Yes |
| `/project/:project_id` | ProjectPage | Yes |
| `/billing` | BillingPage | Yes |

Protected routes use `ProtectedRoute` wrapper and include `ProjectProvider`.

### Job Status Flow
Jobs progress through statuses: `QUEUED → PROCESSING → BUILDING → READY` (or `FAILED`).
ApiService.pollJobStatus polls every 10 seconds until job reaches final state.

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=                        # Optional, defaults to '' (relative URLs, proxied by Vite in dev)
VITE_PUBLIC_POSTHOG_KEY=your-posthog-key  # Optional, analytics
VITE_PUBLIC_POSTHOG_HOST=https://app.posthog.com  # Optional
```

## Path Aliases

Use `@/` to import from `src/`:
```typescript
import { ApiService } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
```

## Key Patterns

### API Calls
All API calls go through ApiService which handles auth headers automatically:
```typescript
const { projects } = await ApiService.getProjects(workspaceId)
const status = await ApiService.getJobStatus(jobId)
```

### Error Tracking
Use errorTracking service to capture errors with context:
```typescript
import { errorTracking } from '@/services/errorTracking'

// API errors are captured automatically by ApiService
// For manual capture:
errorTracking.captureUserActionError(error, 'delete_project', { projectId })
```

### Hooks
- `useAuth()`: Access auth state and methods
- `useProject()`: Access workspace/project state
- `useLocalStorage(key, defaultValue)`: Persistent local state
- `useMediaUpload()`: Handle file uploads to S3
