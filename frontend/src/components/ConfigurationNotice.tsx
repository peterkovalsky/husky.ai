import { isSupabaseConfigured } from '../lib/supabase'

export const ConfigurationNotice = () => {
  if (isSupabaseConfigured()) {
    return null
  }

  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-50 border-b border-yellow-200 px-4 py-3 z-50" role="alert">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-x-3">
          <div className="flex-shrink-0">
            <svg className="size-4 text-yellow-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" x2="12" y1="9" y2="13"/>
              <line x1="12" x2="12.01" y1="17" y2="17"/>
            </svg>
          </div>
          <div>
            <h3 className="text-sm text-yellow-800 font-medium">
              Configuration Required
            </h3>
            <p className="text-sm text-yellow-700">
              Please add <span className="font-mono">VITE_SUPABASE_URL</span> and <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> to your .env file to enable authentication.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}