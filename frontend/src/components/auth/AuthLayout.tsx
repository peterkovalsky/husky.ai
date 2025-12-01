import type { ReactNode } from 'react'
import { Card, CardBody } from '@heroui/react'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-300/20 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-10 w-64 h-64 bg-husky-400/20 rounded-full blur-3xl" />

      {/* Auth Card */}
      <Card className="w-full max-w-md glass-card border-white/30 relative z-10">
        <CardBody className="p-8">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-16 h-16 rounded-xl bg-husky-600 flex items-center justify-center">
              <img
                src="/husky-logo.png"
                alt="Husky AI Logo"
                className="w-12 h-12 object-contain"
              />
            </div>
            <span className="text-2xl font-bold text-gray-900">Husky AI</span>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-semibold mb-2 text-gray-900 text-center">{title}</h2>
          {subtitle && (
            <p className="text-default-500 text-center mb-6">{subtitle}</p>
          )}
          {!subtitle && <div className="mb-6" />}

          {children}
        </CardBody>
      </Card>
    </div>
  )
}
