import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLayout } from './AuthLayout'
import { Button, Input, Divider } from '@heroui/react'
import { Loader2, Mail, Lock, AlertCircle, ArrowRight, UserPlus } from 'lucide-react'

export const SignIn = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <AuthLayout title="Sign In" subtitle="Welcome back to Husky AI">
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
            placeholder="Email"
            startContent={<Mail className="h-4 w-4 text-default-400" />}
            required
          />

          <div className="space-y-2">
            <Input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              startContent={<Lock className="h-4 w-4 text-default-400" />}
              required
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>
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
              <>
                Sign In
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Divider className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or</span>
            </div>
          </div>

          <Button 
            as={Link}
            to="/signup"
            variant="bordered"
            size="lg"
            className="w-full"
          >
            Create an account
            <UserPlus className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}