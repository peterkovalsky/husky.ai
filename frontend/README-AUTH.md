# Supabase Authentication Setup

This implementation provides complete authentication functionality using Supabase, including sign-in, sign-up, and password reset features.

## Setup Instructions

### 1. Environment Variables
Create a `.env` file in the frontend directory with your Supabase credentials:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Supabase Configuration
Make sure your Supabase project has:
- Authentication enabled
- Email provider configured
- User metadata field `display_name` allowed

### 3. User Registration Flow
- Users can sign up with email, password, and display name
- Display name is stored in Supabase auth user metadata as `display_name`
- Email confirmation may be required depending on your Supabase settings

## Features Implemented

### Authentication Pages
- **Sign In** (`/signin`): Email/password login
- **Sign Up** (`/signup`): Email/password/name registration
- **Forgot Password** (`/forgot-password`): Password reset via email

### Protected Routes
- Main app dashboard requires authentication
- Automatic redirect to sign-in page for unauthenticated users
- Authenticated users are redirected away from auth pages

### Security Features
- Session management and persistence
- Automatic token refresh
- Auth headers included in API requests
- Protected API endpoints support

## Usage

### Authentication Context
The `useAuth` hook provides access to:
- `user`: Current user object
- `session`: Current session
- `loading`: Authentication loading state
- `signIn(email, password)`: Sign in function
- `signUp(email, password, displayName)`: Sign up function
- `signOut()`: Sign out function
- `resetPassword(email)`: Password reset function

### Example Usage
```tsx
import { useAuth } from './hooks/useAuth'

function MyComponent() {
  const { user, signOut } = useAuth()
  
  return (
    <div>
      <p>Welcome, {user?.user_metadata?.display_name}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

## File Structure
```
src/
├── components/
│   ├── auth/
│   │   ├── AuthLayout.tsx      # Shared auth page layout
│   │   ├── SignIn.tsx          # Sign in form
│   │   ├── SignUp.tsx          # Sign up form
│   │   └── ForgotPassword.tsx  # Password reset form
│   ├── Dashboard.tsx           # Main app dashboard
│   └── ProtectedRoute.tsx      # Route protection component
├── contexts/
│   ├── AuthContext.ts          # Auth context definition
│   └── AuthContext.tsx         # Auth provider component
├── hooks/
│   └── useAuth.ts              # Auth hook
├── lib/
│   └── supabase.ts             # Supabase client config
└── services/
    └── api.ts                  # API service with auth headers
```

The implementation follows React best practices and includes proper TypeScript types, error handling, and user feedback.