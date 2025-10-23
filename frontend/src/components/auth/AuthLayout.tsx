import type { ReactNode } from 'react'
import { Card, CardBody } from '@heroui/react'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

export const AuthLayout = ({ children, title }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-400 to-indigo-500 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md bg-white/20 backdrop-blur-md border-white/30">
        <CardBody className="p-8">
          <h2 className="text-2xl font-semibold mb-6 text-gray-900">{title}</h2>
          {children}
        </CardBody>
      </Card>
    </div>
  )
}