import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { AuthLayout } from './AuthLayout'
import { Button, Input } from '@heroui/react'
import { Loader2, AlertCircle } from 'lucide-react'

export const SignUp = () => {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

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
      navigate('/project/new', { replace: true })

    } catch (error) {
      console.error('Signup error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account')
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start building amazing apps with AI">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <Input
            type="text"
            id="displayName"
            name="displayName"
            label="Full Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your full name"
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
            isRequired
          />

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
            isRequired
          />

          <Input
            type="password"
            id="password"
            name="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
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
            isRequired
          />
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
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </Button>

          <div className="text-center text-sm text-default-600">
            Already have an account?{' '}
            <Link to="/signin" className="text-husky-600 hover:text-husky-700 font-medium">
              Sign In
            </Link>
          </div>
        </div>
      </form>
    </AuthLayout>
  )
}
