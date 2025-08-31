import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react'
import { Home, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

export const Sidebar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const isActive = (path: string) => {
    return location.pathname === path
  }

  const sidebarContent = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img 
            src="/husky-logo-black-32x32.png" 
            alt="Husky AI Logo" 
            className="w-8 h-8 object-contain"
          />
          <h1 className="text-xl font-bold">Husky AI</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          <Button
            fullWidth
            variant={isActive('/') ? 'flat' : 'light'}
            color={isActive('/') ? 'primary' : 'default'}
            className="justify-start h-11"
            startContent={<Home className="h-4 w-4" />}
            onPress={() => {
              navigate('/')
              setIsMobileMenuOpen(false)
            }}
          >
            Projects
          </Button>
        </div>
      </nav>

      {/* User Menu */}
      <div className="p-4">
        <Dropdown placement="top-start">
          <DropdownTrigger>
            <Button
              variant="bordered"
              className="w-full justify-start h-12"
              startContent={
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              }
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium truncate">
                  {user?.user_metadata?.display_name || 'User'}
                </span>
                <span className="text-xs text-default-500 truncate">
                  {user?.email}
                </span>
              </div>
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="User menu">
            <DropdownItem key="signout" onClick={handleSignOut} color="danger">
              <div className="flex items-center">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </div>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        isIconOnly
        variant="light"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-default-50 border-r border-divider">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-default-50 border-r border-divider z-50 lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}