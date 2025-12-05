import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Form } from '@heroui/react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

export const SignUp = () => {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()

  // Get prompt from query string to pass through to new project
  const promptParam = searchParams.get('prompt')

  const toggleVisibility = () => setIsVisible(!isVisible)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!displayName || !email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    try {
      setError('')
      setLoading(true)

      // Create account in Supabase and log user in
      await signUp(email, password, displayName)

      // Show success toast
      showToast({
        type: 'success',
        title: 'Welcome to Husky AI!',
        message: 'Your account has been created successfully.',
        duration: 3000
      })

      // Redirect new users directly to create their first project
      // Pass along prompt if provided
      navigate('/project/new', {
        replace: true,
        state: promptParam ? { initialPrompt: promptParam } : undefined
      })

    } catch (error) {
      console.error('Signup error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account')
      setLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    try {
      setError('')
      setGoogleLoading(true)
      // Pass prompt param to Google OAuth so it can be preserved through the flow
      await signInWithGoogle(promptParam || undefined)
      // Redirect happens automatically via OAuth flow
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign up with Google')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-large px-8 pt-6 pb-10">
        <div className="flex items-center gap-3 mb-2">
          <img
            src="/husky-logo.png"
            alt="Husky AI Logo"
            className="w-10 h-10 object-contain"
          />
          <span className="text-xl font-semibold text-foreground">Husky AI</span>
        </div>

        <p className="pb-2 text-left text-3xl font-semibold">
          Create Account
          <span aria-label="emoji" className="ml-2" role="img">
            ✨
          </span>
        </p>

        {error && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <Form className="flex flex-col gap-4" validationBehavior="native" onSubmit={handleSubmit}>
          <Input
            isRequired
            label="Full Name"
            labelPlacement="outside"
            name="displayName"
            placeholder="Enter your full name"
            type="text"
            variant="bordered"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            isRequired
            label="Email"
            labelPlacement="outside"
            name="email"
            placeholder="Enter your email"
            type="email"
            variant="bordered"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            isRequired
            endContent={
              <button type="button" onClick={toggleVisibility} className="focus:outline-none">
                {isVisible ? (
                  <EyeOff className="text-default-400 pointer-events-none text-xl" />
                ) : (
                  <Eye className="text-default-400 pointer-events-none text-xl" />
                )}
              </button>
            }
            label="Password"
            labelPlacement="outside"
            name="password"
            placeholder="Min. 6 characters"
            type={isVisible ? 'text' : 'password'}
            variant="bordered"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            className="w-full mt-2"
            color="primary"
            type="submit"
            isLoading={loading}
          >
            Create Account
          </Button>
        </Form>

        <GoogleSignInButton
          onPress={handleGoogleSignUp}
          loading={googleLoading}
          label="Sign up with Google"
        />

        <p className="text-small text-center text-default-500">
          Already have an account?{' '}
          <Link to={promptParam ? `/signin?prompt=${encodeURIComponent(promptParam)}` : '/signin'} className="text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
