import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Tooltip } from '@heroui/react'
import { Home, LogOut, Menu, X, CreditCard, Receipt, ChevronDown, ChevronRight, PanelLeftClose } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { CreditBalanceWidget } from './CreditBalanceWidget'
import { useState, useEffect } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

export const Sidebar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isBillingExpanded, setIsBillingExpanded] = useState(false)
  const [isCollapsed, setIsCollapsed] = useLocalStorage('sidebar-collapsed', false)

  // Auto-expand billing menu if on a billing sub-page
  useEffect(() => {
    if (location.pathname === '/subscription' || location.pathname === '/transactions') {
      setIsBillingExpanded(true)
    }
  }, [location.pathname])

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
    path,
    isSubItem = false,
    endContent
  }: {
    icon: React.ReactNode
    label: string
    path?: string
    isSubItem?: boolean
    endContent?: React.ReactNode
  }) => {
    const active = path ? isActive(path) : (isActive('/subscription') || isActive('/transactions'))

    const button = (
      <Button
        fullWidth={!isCollapsed}
        isIconOnly={isCollapsed && !isSubItem}
        variant="light"
        className={`
          ${isCollapsed && !isSubItem ? 'w-10 h-10' : 'justify-start'}
          ${isSubItem ? 'h-9 pl-12 text-sm' : 'h-11'}
          ${active ? 'text-primary' : ''}
        `}
        startContent={!isCollapsed || isSubItem ? icon : undefined}
        endContent={!isCollapsed ? endContent : undefined}
        onPress={() => {
          if (path) {
            navigate(path)
            setIsMobileMenuOpen(false)
          } else {
            // Billing button behavior
            if (!isBillingExpanded) {
              navigate('/subscription')
              setIsMobileMenuOpen(false)
            }
            setIsBillingExpanded(!isBillingExpanded)
          }
        }}
      >
        {isCollapsed && !isSubItem ? icon : label}
      </Button>
    )

    if (isCollapsed && !isSubItem) {
      return (
        <Tooltip content={label} placement="right" delay={0} closeDelay={0}>
          {button}
        </Tooltip>
      )
    }

    return button
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
      <div className={`${isCollapsed && !isMobile ? 'p-3' : 'p-6'}`}>
        <div className={`flex items-center ${isCollapsed && !isMobile ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center ${isCollapsed && !isMobile ? '' : 'gap-3'}`}>
            <img
              src="/husky-logo-black-32x32.png"
              alt="Husky AI Logo"
              className="w-8 h-8 object-contain"
            />
            {(!isCollapsed || isMobile) && <h1 className="text-xl font-bold">Husky AI</h1>}
          </div>
          {/* Collapse Toggle Button - Desktop only */}
          {(!isCollapsed || isMobile) && !isMobile && (
            <Tooltip content="Collapse sidebar" placement="right" delay={0} closeDelay={0}>
              <Button
                isIconOnly
                variant="light"
                size="sm"
                className="text-default-400 hover:text-default-600 hidden lg:flex"
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
            label="Projects"
            path="/"
          />
          <NavButton
            icon={<CreditCard className="h-4 w-4" />}
            label="Billing"
            endContent={isBillingExpanded ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
          />
          {isBillingExpanded && (!isCollapsed || isMobile) && (
            <>
              <NavButton
                icon={<CreditCard className="h-3.5 w-3.5" />}
                label="Subscription"
                path="/subscription"
                isSubItem
              />
              <NavButton
                icon={<Receipt className="h-3.5 w-3.5" />}
                label="Transactions"
                path="/transactions"
                isSubItem
              />
            </>
          )}
        </div>

        {/* Credit Balance Widget */}
        {(!isCollapsed || isMobile) && <CreditBalanceWidget />}
      </nav>

      {/* User Menu */}
      <div className={`${isCollapsed && !isMobile ? 'p-2' : 'p-4'}`}>
        <Dropdown placement={isCollapsed && !isMobile ? 'right-end' : 'top-start'}>
          <DropdownTrigger>
            {isCollapsed && !isMobile ? (
              <Button
                size="sm"
                isIconOnly
                variant="bordered"
                className="w-10 h-10"
              >
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                  {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="bordered"
                className="w-full justify-start h-12"
                startContent={
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {(user?.user_metadata?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
                  </div>
                }
              >
                <div className="flex flex-col items-start overflow-hidden max-w-[130px]">
                  <span className="text-sm font-medium truncate w-full text-left">
                    {user?.user_metadata?.display_name || 'User'}
                  </span>
                  <span className="text-xs text-default-500 truncate w-full text-left">
                    {user?.email}
                  </span>
                </div>
              </Button>
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
        className="fixed top-4 left-4 z-50 lg:hidden"
        onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex ${isCollapsed ? 'w-16' : 'w-64'} bg-default-50 border-r border-divider transition-all duration-300 ease-in-out`}>
        {sidebarContent(false)}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-default-50 border-r border-divider z-50 lg:hidden">
            {sidebarContent(true)}
          </aside>
        </>
      )}
    </>
  )
}