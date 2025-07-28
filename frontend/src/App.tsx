import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { SignIn } from './components/auth/SignIn'
import { SignUp } from './components/auth/SignUp'
import { ForgotPassword } from './components/auth/ForgotPassword'
import { Home } from './components/Home'
import { Dashboard } from './components/Dashboard'
import { ProjectPage } from './components/ProjectPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ConfigurationNotice } from './components/ConfigurationNotice'
import { useAuth } from './hooks/useAuth'
import { ProjectProvider } from './contexts/ProjectContext'
import { Alert, AlertDescription } from './components/ui/alert'
import { CheckCircle, Loader2 } from 'lucide-react'

function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  useEffect(() => {
    // Initialize Preline UI components
    if (typeof window !== 'undefined' && (window as any).HSStaticMethods) {
      (window as any).HSStaticMethods.autoInit()
    }
  }, [location.pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
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
                <Alert className="fixed top-4 right-4 max-w-sm shadow-lg z-50 border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    {message}
                  </AlertDescription>
                </Alert>
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
            <ProjectProvider>
              <Home />
            </ProjectProvider>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/project/:project_id" 
        element={
          <ProtectedRoute>
            <ProjectProvider>
              <ProjectPage />
            </ProjectProvider>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/project/:project_id/edit" 
        element={
          <ProtectedRoute>
            <ProjectProvider>
              <Dashboard />
            </ProjectProvider>
          </ProtectedRoute>
        } 
      />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
