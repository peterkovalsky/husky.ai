import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Button, Input, Form } from '@heroui/react'
import { AlertCircle, Mail, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react'

export const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const { resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError('Please enter your email address')
      return
    }

    try {
      setError('')
      setLoading(true)
      await resetPassword(email)
      setSuccess(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
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
            Check Your Email
            <span aria-label="emoji" className="ml-2" role="img">
              📧
            </span>
          </p>

          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-success-50 border border-success-200">
            <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-success-600" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-success-800 mb-1">Email Sent!</h3>
              <p className="text-sm text-success-700">
                We've sent password reset instructions to<br/>
                <span className="font-medium">{email}</span>
              </p>
            </div>
          </div>

          <p className="text-xs text-center text-default-500">
            Didn't receive the email? Check your spam folder or try again.
          </p>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              color="primary"
              onPress={() => {
                setSuccess(false)
                setEmail('')
              }}
              startContent={<RefreshCw className="w-4 h-4" />}
            >
              Try Again
            </Button>

            <Button
              as={Link}
              to="/signin"
              className="w-full"
              variant="bordered"
              startContent={<ArrowLeft className="w-4 h-4" />}
            >
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    )
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
          Reset Password
          <span aria-label="emoji" className="ml-2" role="img">
            🔑
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
            description="We'll send password reset instructions to this email"
          />
          <Button
            className="w-full mt-2"
            color="primary"
            type="submit"
            isLoading={loading}
            startContent={!loading ? <Mail className="w-4 h-4" /> : undefined}
          >
            Send Reset Instructions
          </Button>
        </Form>

        <Button
          as={Link}
          to="/signin"
          className="w-full"
          variant="light"
          startContent={<ArrowLeft className="w-4 h-4" />}
        >
          Back to Sign In
        </Button>
      </div>
    </div>
  )
}
