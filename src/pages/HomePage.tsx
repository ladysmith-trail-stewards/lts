import Mission from '../components/Mission';
import Gallery from '../components/Gallery';
import NavigationCards from '../components/NavigationCards';
import Contact from '../components/Contact';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16">
      {/* Logo hero block */}
      <div className="bg-slate-800 text-white flex flex-col items-center justify-center py-6">
        <img
          src="/images/mtb-logo-full.png"
          alt="Ladysmith Trail Stewards Logo"
          className="h-64 w-auto"
        />
      </div>
      <div className="flex flex-col gap-16 pb-16">
        <NavigationCards />
        <Mission />
        <Gallery />
        <Contact />
      </div>
    </div>
  );
}
