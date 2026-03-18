import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { supabase } from '@/lib/supa-client'

export default function LogoutPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.signOut().then(() => {
      navigate('/')
    })
  }, [navigate])

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Logging out...</p>
    </div>
  )
}
