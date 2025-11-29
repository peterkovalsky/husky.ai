import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLayout } from './AuthLayout'
import { Button, Input, Checkbox } from '@heroui/react'
import { Loader2, AlertCircle } from 'lucide-react'

export const SignIn = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

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
      navigate('/')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue building amazing apps">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <Input
            type="email"
            id="email"
            name="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            classNames={{
              inputWrapper: [
                'bg-white/50',
                'backdrop-blur-sm',
                'border-white/50',
                'hover:bg-white/70',
                'group-data-[focus=true]:bg-white/70',
                'group-data-[focus=true]:border-husky-400',
              ].join(' '),
            }}
            required
          />

          <Input
            type="password"
            id="password"
            name="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            classNames={{
              inputWrapper: [
                'bg-white/50',
                'backdrop-blur-sm',
                'border-white/50',
                'hover:bg-white/70',
                'group-data-[focus=true]:bg-white/70',
                'group-data-[focus=true]:border-husky-400',
              ].join(' '),
            }}
            required
          />

          <div className="flex items-center justify-between">
            <Checkbox
              size="sm"
              isSelected={rememberMe}
              onValueChange={setRememberMe}
              classNames={{
                label: 'text-default-600',
              }}
            >
              Remember me
            </Checkbox>
            <Link
              to="/forgot-password"
              className="text-sm text-husky-600 hover:text-husky-700 font-medium"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            type="submit"
            isDisabled={loading}
            className="w-full btn-primary"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>

          <div className="text-center text-sm text-default-600">
            Need to create an account?{' '}
            <Link to="/signup" className="text-husky-600 hover:text-husky-700 font-medium">
              Sign Up
            </Link>
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}
