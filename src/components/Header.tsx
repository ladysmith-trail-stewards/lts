import { Link, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { Tooltip } from '@base-ui/react/tooltip';
import { NavigationMenuLink } from '@/components/ui/navigation-menu';
import { menuRoutes } from '@/routes';

function RouterLink(props: NavigationMenu.Link.Props & { to: string }) {
  const navigate = useNavigate();
  const { to, ...rest } = props;
  return (
    <NavigationMenuLink
      render={<a href={to} />}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        navigate(to);
      }}
      closeOnClick
      {...rest}
    />
  );
}

function HeaderMenu() {
  return (
    <NavigationMenu.Root className="relative" delay={0} closeDelay={150}>
      <NavigationMenu.List className="flex">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className="w-9 h-9 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 flex items-center justify-center text-white shadow-lg transition-colors">
            <Menu size={16} />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            {menuRoutes.map(({ to, title, description, icon: Icon }) => {
              const linkContent = (
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
            })}
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

function Header() {
  return (
    <div className="sticky top-0 z-50 w-full bg-slate-800/85 backdrop-blur-sm shadow-lg">
      <div className="flex items-center justify-between px-4 h-16 text-white">
        <Link to="/" className="text-2xl font-bold hover:text-slate-200 transition-colors whitespace-nowrap">
          Ladysmith Trail Stewards
        </Link>
        <HeaderMenu />
      </div>
    </div>
  );
}

export default Header;
