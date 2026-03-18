import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supa-client'
import { Button } from '@/components/ui/button'

export default function ProtectedPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data?.user) {
        navigate('/login')
      } else {
        setUser(data.user)
      }
    })
  }, [navigate])

  if (!user) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-screen gap-2">
      <p>
        Hello <span className="text-primary font-semibold">{user.email}</span>
      </p>
      <Button onClick={() => navigate('/logout')}>Logout</Button>
    </div>
  )
}
