import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip } from '@heroui/react'
import { Home, LogOut, Menu, X, CreditCard, PanelLeftClose, FolderOpen } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { CreditBalanceWidget } from './CreditBalanceWidget'
import { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

export const Sidebar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useLocalStorage('sidebar-collapsed', true)

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

  const NavButton = ({
    icon,
    label,
    path
  }: {
    icon: React.ReactElement<{ className?: string }>
    label: string
    path: string
  }) => {
    const active = isActive(path)

    // Collapsed mode - Canva style with icon + label stacked
    if (isCollapsed) {
      return (
        <button
          onClick={() => {
            navigate(path)
            setIsMobileMenuOpen(false)
          }}
          className={`
            flex flex-col items-center justify-center w-full py-2 px-2 rounded-xl cursor-pointer
            ${active ? '' : 'text-gray-500'}
            transition-colors duration-200
          `}
          style={active ? { color: '#7c3aed' } : {}}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${active ? '' : 'hover:bg-gray-100'}`}
               style={active ? { backgroundColor: '#ddd6fe' } : {}}>
            {React.cloneElement(icon, { className: 'h-5 w-5' })}
          </div>
          <span className="text-xs font-medium">{label}</span>
        </button>
      )
    }

    // Expanded mode
    return (
      <Button
        fullWidth
        variant="light"
        className={`
          justify-start cursor-pointer h-11
          ${active ? '' : 'hover:bg-husky-50 dark:hover:bg-husky-900/20'}
          transition-colors duration-200
        `}
        style={active ? { backgroundColor: '#ddd6fe', color: '#7c3aed' } : {}}
        startContent={icon}
        onPress={() => {
          navigate(path)
          setIsMobileMenuOpen(false)
        }}
      >
        {label}
      </Button>
    )
  }

  // Handle click on empty space in collapsed sidebar to expand
  const handleSidebarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed && e.target === e.currentTarget) {
      setIsCollapsed(false)
    }
  }

  const sidebarContent = (isMobile: boolean = false) => (
    <div
      className={`h-full flex flex-col ${isCollapsed && !isMobile ? 'cursor-e-resize' : ''}`}
      onClick={!isMobile ? handleSidebarClick : undefined}
    >
      {/* Header */}
      <div className={`${isCollapsed && !isMobile ? 'p-3 pt-4' : 'p-6'}`}>
        <div className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center ${isCollapsed && !isMobile ? 'flex-col' : 'gap-3'}`}>
            <img
              src="/husky-logo.png"
              alt="Husky AI Logo"
              className="w-10 h-10 object-contain"
            />
            {(!isCollapsed || isMobile) && (
              <h1 className="text-xl font-bold text-gray-900">Husky AI</h1>
            )}
          </div>
          {/* Collapse Toggle Button - Desktop only */}
          {(!isCollapsed || isMobile) && !isMobile && (
            <Tooltip content="Collapse sidebar" placement="right" delay={0} closeDelay={0}>
              <Button
                isIconOnly
                variant="light"
                size="sm"
                className="text-default-400 hover:text-husky-600 hover:bg-husky-50 hidden lg:flex transition-colors"
                onPress={() => setIsCollapsed(true)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav
        className={`flex-1 ${isCollapsed && !isMobile ? 'p-2' : 'p-4'} space-y-4 ${isCollapsed && !isMobile ? 'cursor-e-resize' : ''}`}
        onClick={!isMobile ? handleSidebarClick : undefined}
      >
        <div className={`space-y-2 ${isCollapsed && !isMobile ? 'flex flex-col items-center' : ''}`}>
          <NavButton
            icon={<Home className="h-4 w-4" />}
            label="Home"
            path="/"
          />
          <NavButton
            icon={<FolderOpen className="h-4 w-4" />}
            label="Projects"
            path="/projects"
          />
          <NavButton
            icon={<CreditCard className="h-4 w-4" />}
            label="Billing"
            path="/billing"
          />
        </div>
      </nav>

      {/* Credit Balance Widget - Bottom of sidebar */}
      {(!isCollapsed || isMobile) && (
        <div className={`${isCollapsed && !isMobile ? 'p-2' : 'px-4 pb-2'}`}>
          <CreditBalanceWidget />
        </div>
      )}

      {/* User Menu */}
      <div className={`${isCollapsed && !isMobile ? 'p-2' : 'p-4'}`}>
        <Dropdown placement={isCollapsed && !isMobile ? 'right-end' : 'top-start'}>
          <DropdownTrigger>
            {isCollapsed && !isMobile ? (
              <button className="flex flex-col items-center justify-center w-full py-2 px-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium mb-1 bg-husky-500">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </button>
            ) : (
              <button
                className="w-full flex items-center gap-3 h-12 px-3 rounded-xl border border-husky-200 hover:border-husky-400 hover:bg-husky-50/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0 bg-husky-500">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col items-start overflow-hidden min-w-0">
                  <span className="text-sm font-medium truncate w-full text-left">
                    {user?.user_metadata?.display_name || 'User'}
                  </span>
                  <span className="text-xs text-default-500 truncate w-full text-left">
                    {user?.email}
                  </span>
                </div>
              </button>
            )}
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
        size="sm"
        isIconOnly
        variant="light"
        className="fixed top-4 left-4 z-50 lg:hidden bg-white/80 backdrop-blur-sm shadow-md hover:shadow-husky transition-shadow"
        onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex ${isCollapsed ? 'w-20' : 'w-64'} bg-gray-50 border-r border-gray-200 transition-all duration-300 ease-in-out`}>
        {sidebarContent(false)}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-gray-50 border-r border-gray-200 z-50 lg:hidden animate-slide-up">
            {sidebarContent(true)}
          </aside>
        </>
      )}
    </>
  )
}
