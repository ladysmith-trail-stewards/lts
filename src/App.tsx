import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import CharterPage from './pages/CharterPage';
import ContactPage from './pages/ContactPage';

function App() {
  return (
    <div className="flex flex-col min-h-full bg-gray-50 text-gray-900">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/charter" element={<CharterPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
