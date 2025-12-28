import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button, Input, Checkbox, Form } from '@heroui/react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { GoogleSignInButton } from './GoogleSignInButton'

export const SignIn = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Get prompt from query string to pass through to new project
  const promptParam = searchParams.get('prompt')

  const toggleVisibility = () => setIsVisible(!isVisible)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    try {
      setError('')
      setLoading(true)
      await signIn(email, password)
      // If we have a prompt param, redirect to home with prompt
      if (promptParam) {
        navigate('/', { state: { initialPrompt: promptParam } })
      } else {
        navigate('/')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      setError('')
      setGoogleLoading(true)
      // Pass prompt param to Google OAuth so it can be preserved through the flow
      await signInWithGoogle(promptParam || undefined)
      // Redirect happens automatically via OAuth flow
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign in with Google')
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
          Log In
          <span aria-label="emoji" className="ml-2" role="img">
            👋
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
            placeholder="Enter your password"
            type={isVisible ? 'text' : 'password'}
            variant="bordered"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex w-full items-center justify-between px-1 py-2">
            <Checkbox
              name="remember"
              size="sm"
              isSelected={rememberMe}
              onValueChange={setRememberMe}
            >
              Remember me
            </Checkbox>
            <Link to="/forgot-password" className="text-sm text-default-500 hover:text-primary">
              Forgot password?
            </Link>
          </div>
          <Button
            className="w-full"
            color="primary"
            type="submit"
            isLoading={loading}
          >
            Log In
          </Button>
        </Form>

        <GoogleSignInButton
          onPress={handleGoogleSignIn}
          loading={googleLoading}
          label="Sign in with Google"
        />

        <p className="text-small text-center text-default-500">
          Need to create an account?{' '}
          <Link to={promptParam ? `/signup?prompt=${encodeURIComponent(promptParam)}` : '/signup'} className="text-primary hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  )
}
