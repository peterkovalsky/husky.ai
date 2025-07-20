import type { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v10c0 5.55 3.84 9.739 9 11 5.16-1.261 9-5.45 9-11V7l-10-5z"/>
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-blue-600 mb-2">
            Husky AI
          </h1>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">{title}</h2>
          {subtitle && <p className="text-gray-600 text-sm">{subtitle}</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  )
}