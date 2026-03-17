import { Link } from 'react-router-dom';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';

function Header() {
  return (
    <header className="bg-slate-800 text-white shadow-lg">
      <div className="container mx-auto flex justify-between items-center p-4">
        <div className="flex items-center space-x-4">
          <img
            src="/images/logo.jpg"
            alt="Ladysmith Logo"
            className="h-10 w-auto"
          />
          <Link to="/" className="text-xl font-bold hover:text-slate-200 transition-colors">
            Ladysmith Trail Stewards
          </Link>
        </div>
        <NavigationMenu>
          <NavigationMenuList className="gap-2">
            <NavigationMenuItem>
              <Link
                to="/charter"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 focus:bg-slate-600 focus:outline-none border border-slate-600 hover:border-slate-500"
              >
                Charter
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link
                to="/map"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 focus:bg-slate-600 focus:outline-none border border-slate-600 hover:border-slate-500"
              >
                Map
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link
                to="/contact"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 focus:bg-slate-600 focus:outline-none border border-slate-600 hover:border-slate-500"
              >
                Contact
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
  );
}

export default Header;
