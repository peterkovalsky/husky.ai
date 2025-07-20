import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SignIn } from './components/auth/SignIn'
import { SignUp } from './components/auth/SignUp'
import { ForgotPassword } from './components/auth/ForgotPassword'
import { Dashboard } from './components/Dashboard'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ConfigurationNotice } from './components/ConfigurationNotice'
import { useAuth } from './hooks/useAuth'

function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const message = location.state?.message

  return (
    <>
      <ConfigurationNotice />
      <Routes>
      <Route 
        path="/signin" 
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <div>
              {message && (
                <div className="fixed top-4 right-4 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg z-50">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 text-sm">{message}</span>
                  </div>
                </div>
              )}
              <SignIn />
            </div>
          )
        } 
      />
      <Route 
        path="/signup" 
        element={user ? <Navigate to="/" replace /> : <SignUp />} 
      />
      <Route 
        path="/forgot-password" 
        element={user ? <Navigate to="/" replace /> : <ForgotPassword />} 
      />
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
