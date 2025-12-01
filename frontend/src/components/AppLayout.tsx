import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  children: ReactNode
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-white">
        {children}
      </main>
    </div>
  )
}
