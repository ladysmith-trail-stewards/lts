import { Link } from 'react-router-dom';
import { menuRoutes } from '@/routes';

function Footer() {
  return (
    <footer className="bg-slate-800 text-white py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Brand */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <img
                src="/images/logo.jpg"
                alt="Ladysmith Logo"
                className="h-8 w-auto"
              />
              <span className="text-lg font-semibold tracking-tight">Trail Stewards</span>
            </div>
            <p className="text-sm text-slate-400 leading-7">
              Building sustainable trails for our community in Ladysmith, BC.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mb-4">Quick Links</h3>
            <ul className="my-0 ml-0 list-none space-y-2">
              {menuRoutes.map(({ to, title }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mb-4">Connect</h3>
            <ul className="my-0 ml-0 list-none space-y-2">
              <li>
                <a
                  href="https://www.facebook.com/groups/762166175047717"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Facebook Group
                </a>
              </li>
              <li>
                <p className="text-sm text-slate-400">
                  info@ladysmithtrailstewards.org
                </p>
              </li>
            </ul>
          </div>

        </div>

        <div className="border-t border-slate-700 mt-8 pt-6 text-center">
          <p className="text-sm text-slate-400">
            &copy; 2026 Ladysmith Trail Stewards. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
