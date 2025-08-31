import type { ReactNode } from 'react'
import { Card, CardBody } from '@heroui/react'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shadow-lg p-2">
              <img 
                src="/husky-logo-white-32x32.png" 
                alt="Husky AI Logo" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-primary mb-2">
            Husky AI
          </h1>
          <h2 className="text-2xl font-semibold mb-2">{title}</h2>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        <Card>
          <CardBody className="p-8">
            {children}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}