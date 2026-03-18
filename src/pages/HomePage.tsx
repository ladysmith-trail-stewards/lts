import Mission from '../components/Mission';
import Gallery from '../components/Gallery';
import NavigationCards from '../components/NavigationCards';

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Logo hero block */}
      <div className="bg-slate-800 text-white flex flex-col items-center justify-center py-4">
        <img
          src="/images/mtb-logo-full.png"
          alt="Ladysmith Trail Stewards Logo"
          className="h-40 w-auto"
        />
      </div>

      <div className="container mx-auto max-w-7xl px-4 py-5 space-y-5 bg-slate-50">
        {/* Mission across the top */}
        <Mission />

        {/* Nav Cards + Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
          <NavigationCards />
          <div className="lg:col-span-2 lg:order-first self-stretch flex items-center">
            <Gallery />
          </div>
        </div>
      </div>
    </div>
  );
}
