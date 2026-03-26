import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, User, Menu } from 'lucide-react';
import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { Tooltip } from '@base-ui/react/tooltip';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { menuRoutes } from '@/routes';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfileDialog } from '@/components/UserProfileDialog';
import type { User as SupabaseUser } from '@supabase/supabase-js';

function RouterLink(props: NavigationMenu.Link.Props & { to: string }) {
  const navigate = useNavigate();
  const { to, ...rest } = props;
  return (
    <NavigationMenuLink
      render={<a href={to} />}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
          return;
        e.preventDefault();
        navigate(to);
      }}
      closeOnClick
      {...rest}
    />
  );
}

function HeaderMenu() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      supabase.rpc('is_admin').then(({ data }) => setIsAdmin(data === true));
    });

    return () => subscription.unsubscribe();
  }, []);

  const visibleRoutes = menuRoutes.filter(
    (r) => r.access !== 'ADMIN' || isAdmin
  );

  return (
    <NavigationMenu.Root className="relative" delay={0} closeDelay={150}>
      <NavigationMenu.List className="flex">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 flex items-center justify-center text-white shadow-lg transition-colors">
            <Menu size={16} />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            {visibleRoutes.map(
              ({ to, title, description, icon: Icon, access }) => {
                const disabled = access === 'USER' && !user;

                const linkContent = disabled ? (
                  <div
                    key={to}
                    className="flex flex-row items-center gap-3 rounded-lg px-3 py-2.5 w-full cursor-not-allowed opacity-40"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <Icon size={16} />
                    </div>
                    <span className="text-base text-slate-400">{title}</span>
                  </div>
                ) : (
                  <RouterLink
                    key={to}
                    to={to}
                    className="flex flex-row items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors outline-none focus:bg-slate-100 w-full"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon size={16} />
                    </div>
                    <span className="text-base text-slate-800">{title}</span>
                  </RouterLink>
                );

                if (!description) return linkContent;

                return (
                  <Tooltip.Provider key={to} delay={100}>
                    <Tooltip.Root>
                      <Tooltip.Trigger render={<div />} className="w-full">
                        {linkContent}
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Positioner side="left" sideOffset={8}>
                          <Tooltip.Popup className="max-w-[220px] rounded-lg bg-slate-800 px-3 py-2 text-slate-100 shadow-lg">
                            {description}
                            <Tooltip.Arrow className="fill-slate-800" />
                          </Tooltip.Popup>
                        </Tooltip.Positioner>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                );
              }
            )}
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      <NavigationMenu.Portal>
        <NavigationMenu.Positioner side="bottom" align="end" sideOffset={8}>
          <NavigationMenu.Popup className="min-w-[240px] rounded-xl bg-white shadow-xl ring-1 ring-black/5 p-2 z-50">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}

function HeaderUser() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { user, role } = useAuth();

  if (!user) {
    return (
      <Link
        to="/login"
        className="flex items-center gap-1.5 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 px-3 h-9 text-sm text-white transition-colors"
      >
        <LogIn size={14} />
        <span>Login</span>
      </Link>
    );
  }

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="flex items-center gap-2 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 pl-1 pr-3 h-9 text-sm text-white transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-500 text-white">
          <User size={14} />
        </div>
        <span className="max-w-[120px] truncate">{displayName}</span>
        {role && (
          <span className="text-[10px] leading-none px-1.5 py-0.5 rounded bg-slate-600 text-slate-300 capitalize">
            {role === 'pending' ? 'pending approval' : role.replace('_', ' ')}
          </span>
        )}
      </button>
      <UserProfileDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-50 w-full bg-slate-800/85 backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between px-4 h-16 text-white">
        <Link
          to="/"
          className="text-2xl font-bold hover:text-slate-200 transition-colors whitespace-nowrap"
        >
          Ladysmith Trail Stewards
        </Link>
        <div className="flex items-center gap-2">
          <HeaderUser />
          <HeaderMenu />
        </div>
      </div>
    </div>
  );
}

export default Header;
