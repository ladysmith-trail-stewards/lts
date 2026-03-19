import { Link } from 'react-router-dom';
import { menuRoutes } from '@/routes';

function Footer() {
  return (
    <footer className="bg-slate-800 text-white py-5 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <img
                src="/images/logo.jpg"
                alt="Ladysmith Logo"
                className="h-6 w-auto"
              />
              <span className="text-sm font-semibold tracking-tight">
                Trail Stewards
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-5">
              Building sustainable trails for our community in Ladysmith, BC.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold tracking-tight mb-2">
              Quick Links
            </h3>
            <ul className="my-0 ml-0 list-none space-y-1">
              {menuRoutes.map(({ to, title }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="text-sm font-semibold tracking-tight mb-2">
              Connect
            </h3>
            <ul className="my-0 ml-0 list-none space-y-1">
              <li>
                <a
                  href="https://www.facebook.com/groups/762166175047717"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Facebook Group
                </a>
              </li>
              <li>
                <p className="text-xs text-slate-400">
                  info@ladysmithtrailstewards.org
                </p>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-700 mt-4 pt-3 text-center">
          <p className="text-xs text-slate-400">
            &copy; 2026 Ladysmith Trail Stewards. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
