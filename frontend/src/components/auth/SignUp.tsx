import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../contexts/ToastContext'
import { AuthLayout } from './AuthLayout'
import { Button, Input, Divider } from '@heroui/react'
import { Loader2, User, Mail, Lock, AlertCircle, UserPlus, ArrowRight } from 'lucide-react'

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
      
      // Redirect to dashboard - it will handle the setup check
      navigate('/', { replace: true })
      
    } catch (error) {
      console.error('Signup error:', error)
      setError(error instanceof Error ? error.message : 'Failed to create account')
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign Up" subtitle="Create your Husky AI account">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700">
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
            startContent={<User className="h-4 w-4 text-default-400" />}
            isRequired
          />

          <Input
            type="email"
            id="email"
            name="email"
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            startContent={<Mail className="h-4 w-4 text-default-400" />}
            isRequired
          />

          <Input
            type="password"
            id="password"
            name="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            description="Must be at least 6 characters long"
            startContent={<Lock className="h-4 w-4 text-default-400" />}
            isRequired
          />

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
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <UserPlus className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Divider className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-default-500">Or</span>
            </div>
          </div>

          <Button
            as={Link}
            to="/signin"
            variant="bordered"
            size="lg"
            className="w-full"
          >
            Sign in instead
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}