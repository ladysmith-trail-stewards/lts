import { useEffect, useState } from 'react';
import NavCard from './NavCard';
import Contact from './Contact';
import { cardRoutes } from '@/routes';
import { supabase } from '@/lib/supa-client';
import type { User } from '@supabase/supabase-js';

export default function NavigationCards() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {cardRoutes.map((route) => (
        <NavCard
          key={route.to}
          to={route.to}
          title={route.title}
          description={route.description ?? ''}
          label={route.linkProps.label}
          variant={route.linkProps.variant}
          disabled={route.access === 'USER' && !user}
        />
      ))}
      <Contact />
    </div>
  );
}
