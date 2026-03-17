import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="bg-slate-800 text-white py-8 mt-auto">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <img
                src="/images/logo.jpg"
                alt="Ladysmith Logo"
                className="h-8 w-auto"
              />
              <span className="text-lg font-bold">Trail Stewards</span>
            </div>
            <p className="text-slate-300 text-sm">
              Building sustainable trails for our community in Ladysmith, BC.
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="text-slate-300 hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/charter" className="text-slate-300 hover:text-white transition-colors">
                  Charter
                </Link>
              </li>
              <li>
                <Link to="/map" className="text-slate-300 hover:text-white transition-colors">
                  Map
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-slate-300 hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">Connect</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a 
                  href="https://www.facebook.com/groups/762166175047717"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 hover:text-white transition-colors"
                >
                  Facebook Group
                </a>
              </li>
              <li className="text-slate-300">
                Email: info@ladysmithtrailstewards.org
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-slate-600 mt-8 pt-6 text-center">
          <p className="text-slate-300 text-sm">
            &copy; 2026 Ladysmith Trail Stewards. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
