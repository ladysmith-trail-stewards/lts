import Header from './components/Header';
import Hero from './components/Hero';
import Mission from './components/Mission';
import Gallery from './components/Gallery';
import Contact from './components/Contact';
import Footer from './components/Footer';

function App() {
  return (
    <div className="flex flex-col min-h-full bg-green-50 text-gray-900">
      <Header />
      <Hero />
      <Mission />
      <Gallery />
      <Contact />
      <Footer />
    </div>
  );
}

export default App;
