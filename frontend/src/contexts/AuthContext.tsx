import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { AuthContext } from './AuthContext'
import { ApiService } from '../services/api'

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupInProgress, setSetupInProgress] = useState<string | null>(null)

  const checkAndSetupUser = async () => {
    if (!user?.id) return
    
    // Prevent duplicate setup calls for the same user
    if (setupInProgress === user.id) return
    
    try {
      setSetupInProgress(user.id)
      const result = await ApiService.setupUser()
    } catch (error) {
      console.error('Failed to setup user:', error)
    } finally {
      setSetupInProgress(null)
    }
  }

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
      
      // Check and setup user if logged in
      if (session?.user) {
        await checkAndSetupUser()
      }
      
      setLoading(false)
    }).catch(error => {
      setSession(null)
      setUser(null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.id)
      setSession(session)
      setUser(session?.user ?? null)
      
      // Check and setup user on sign in
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('User signed in, setting up...')
        await checkAndSetupUser()
      }
      
      // Clear setup state on sign out
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing state...')
        setSetupInProgress(null)
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
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Supabase signOut error:', error)
        throw error
      }
      console.log('Sign out successful')
    } catch (error) {
      console.error('Sign out failed:', error)
      throw error
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

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}