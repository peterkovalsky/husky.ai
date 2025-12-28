import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { AuthContext } from './AuthContext'
import { errorTracking } from '../services/errorTracking'

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)


  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Session timeout')), 10000)
    })
    
    // Race between getSession and timeout
    Promise.race([
      supabase.auth.getSession(),
      timeoutPromise
    ]).then(async (result: any) => {
      const { data: { session } } = result
      setSession(session)
      setUser(session?.user ?? null)

      // Identify user in PostHog if session exists
      if (session?.user) {
        errorTracking.identifyUser(session.user.id, {
          email: session.user.email,
          created_at: session.user.created_at,
        });
      }

      setLoading(false)
    }).catch(() => {
      setSession(null)
      setUser(null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)

      // Identify user in PostHog when they sign in
      if (session?.user) {
        errorTracking.identifyUser(session.user.id, {
          email: session.user.email,
          created_at: session.user.created_at,
        });
      }

      // Reset user in PostHog when they sign out
      if (event === 'SIGNED_OUT') {
        errorTracking.resetUser();
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    
    // User setup will be handled by onAuthStateChange listener
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    })
    if (error) throw error
    
    // User setup will be handled by onAuthStateChange listener
  }

  const signOut = async () => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
    }

    try {
      console.log('Attempting to sign out...')
      // Use scope: 'local' to always clear local storage, even if server call fails
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        console.error('Sign out error:', error)
        errorTracking.captureUserActionError(error, 'sign_out');
        // Don't throw - local session is already cleared with scope: 'local'
      }
      // Clear React state
      setSession(null)
      setUser(null)
      console.log('Sign out successful')
    } catch (error) {
      console.error('Sign out exception:', error)
      // Even if there's an error, try to clear local state
      setSession(null)
      setUser(null)
      if (error instanceof Error) {
        errorTracking.captureUserActionError(error, 'sign_out');
      }
      // Don't throw - we want logout to always succeed from user's perspective
    }
  }

  const resetPassword = async (email: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  const signInWithGoogle = async (prompt?: string) => {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
    }
    // Build redirect URL - if prompt is provided, redirect to home with prompt param
    // Otherwise redirect to home
    const redirectTo = prompt
      ? `${window.location.origin}/?prompt=${encodeURIComponent(prompt)}`
      : `${window.location.origin}/`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })
    if (error) throw error
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}