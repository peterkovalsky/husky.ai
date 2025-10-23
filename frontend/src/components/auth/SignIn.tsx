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
    <AuthLayout title="Log In">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <Input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            classNames={{
              input: "bg-transparent placeholder:text-gray-600",
              inputWrapper: "bg-white/30 backdrop-blur-sm border-white/30"
            }}
            required
          />

          <Input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            classNames={{
              input: "bg-transparent placeholder:text-gray-600",
              inputWrapper: "bg-white/30 backdrop-blur-sm border-white/30"
            }}
            required
          />

          <div className="flex items-center justify-between">
            <Checkbox
              size="sm"
              isSelected={rememberMe}
              onValueChange={setRememberMe}
            >
              Remember me
            </Checkbox>
            <Link
              to="/forgot-password"
              className="text-sm text-default-500 hover:text-default-700"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            type="submit"
            isDisabled={loading}
            className="w-full"
            size="lg"
            color="primary"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Log In'
            )}
          </Button>

          <div className="text-center text-sm text-default-500">
            Need to create an account?{' '}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign Up
            </Link>
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}