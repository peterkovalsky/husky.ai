import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { AuthLayout } from './AuthLayout'
import { HiMail } from 'react-icons/hi'

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
      <AuthLayout title="Check Your Email" subtitle="Password reset instructions sent">
        <div className="text-center space-y-4">
          <div className="bg-green-50/80 backdrop-blur-sm border border-green-200/50 rounded-2xl p-8 shadow-lg">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-green-800 mb-3 text-center">Email Sent!</h3>
            <p className="text-green-700 text-center leading-relaxed">
              We've sent password reset instructions to<br/>
              <strong className="font-semibold">{email}</strong>
            </p>
          </div>
          
          <div className="text-sm text-gray-500 bg-gray-50/50 rounded-xl p-4">
            <p className="text-center">Didn't receive the email? Check your spam folder or try again.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setSuccess(false)
                setEmail('')
              }}
              className="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
            >
              Try Again
            </button>
            
            <Link 
              to="/signin"
              className="w-full text-gray-900 bg-white border border-gray-300 focus:outline-none hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 font-medium rounded-lg text-sm px-5 py-2.5 text-center flex justify-center items-center"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your email to receive reset instructions">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50">
            <svg className="flex-shrink-0 inline w-4 h-4 mr-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/>
            </svg>
            <span className="sr-only">Info</span>
            <div>
              <span className="font-medium">Error:</span> {error}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="email" className="block mb-2 text-sm font-medium text-gray-900">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <HiMail className="w-4 h-4 text-gray-500" />
            </div>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 p-2.5"
              placeholder="Enter your email address"
              required
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">We'll send password reset instructions to this email</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending...
            </div>
          ) : (
            'Send Reset Instructions'
          )}
        </button>

        <Link 
          to="/signin" 
          className="w-full text-gray-900 bg-white border border-gray-300 focus:outline-none hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 font-medium rounded-lg text-sm px-5 py-2.5 text-center flex justify-center items-center"
        >
          Back to Sign In
        </Link>
      </form>
    </AuthLayout>
  )
}