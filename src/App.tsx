import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import CharterPage from './pages/CharterPage';
import ContactPage from './pages/ContactPage';
import MapPage from './pages/MapPage';

function App() {
  const location = useLocation();
  const isMapPage = location.pathname === '/map';

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col min-h-full">
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/charter" element={<CharterPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/map" element={<MapPage />} />
            </Routes>
          </div>
          {isMapPage ? (
            <div className="bg-slate-800 text-slate-300 py-2 px-4 text-center text-xs">
              © 2026 Ladysmith Trail Stewards. All rights reserved.
            </div>
          ) : (
            <Footer />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
