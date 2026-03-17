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
          <span className="text-xl font-bold">Ladysmith Trail Stewards</span>
        </div>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link
                to="/charter"
                className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-600 hover:text-white focus:bg-slate-600 focus:text-white focus:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                Charter
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link
                to="/contact"
                className="group inline-flex h-10 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-600 hover:text-white focus:bg-slate-600 focus:text-white focus:outline-none disabled:pointer-events-none disabled:opacity-50"
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
