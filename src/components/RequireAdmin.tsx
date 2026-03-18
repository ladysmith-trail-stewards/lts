import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { supabase } from '@/lib/supa-client'

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'authorized' | 'unauthorized'>('loading')

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data?.user) {
        setState('unauthorized')
        return
      }
      supabase.rpc('is_admin').then(({ data: isAdmin, error: rpcError }) => {
        if (rpcError || !isAdmin) {
          setState('unauthorized')
        } else {
          setState('authorized')
        }
      })
    })
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (state === 'unauthorized') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
