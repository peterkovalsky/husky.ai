import { useNavigate } from 'react-router-dom'
import { MessageSquareMore, Home, Globe } from 'lucide-react'

export type SidebarPanel = 'chat' | 'publish' | null

interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  panel: NonNullable<SidebarPanel>
}

const ICON_CLASS = 'w-6 h-6'

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquareMore className={ICON_CLASS} strokeWidth={1.5} />,
    panel: 'chat',
  },
  {
    id: 'publish',
    label: 'Publish',
    icon: <Globe className={ICON_CLASS} strokeWidth={1.5} />,
    panel: 'publish',
  },
]

interface ProjectSidebarRailProps {
  activePanel: SidebarPanel
  onItemClick: (panel: NonNullable<SidebarPanel>) => void
}

export const ProjectSidebarRail = ({ activePanel, onItemClick }: ProjectSidebarRailProps) => {
  const navigate = useNavigate()

  return (
    <div className="h-full w-[72px] flex-shrink-0 flex flex-col items-center px-2 py-3 bg-white border-r border-slate-200">
      {/* Home button — navigates back to projects */}
      <button
        onClick={() => navigate('/projects')}
        className="flex flex-col items-center justify-center gap-2 cursor-pointer group mb-5"
        title="Home"
      >
        <span className="inline-flex items-center justify-center p-2 rounded-lg transition-all duration-150 text-[#737373] group-hover:bg-slate-100">
          <Home className="w-6 h-6" strokeWidth={1.5} />
        </span>
        <span className="text-xs font-medium leading-none text-[#737373]">Home</span>
      </button>

      {/* Panel items */}
      <div className="flex flex-col items-center gap-4">
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = activePanel === item.panel
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item.panel)}
            className="flex flex-col items-center justify-center gap-2 cursor-pointer group"
            title={item.label}
          >
            <span
              className={`
                inline-flex items-center justify-center p-2 rounded-lg transition-all duration-150
                ${isActive
                  ? 'bg-white shadow-sm text-primary'
                  : 'text-[#737373] group-hover:bg-slate-100'
                }
              `}
            >
              {item.icon}
            </span>
            <span className="text-xs font-medium leading-none text-[#737373]">
              {item.label}
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )
}
