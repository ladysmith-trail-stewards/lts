import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const mapStyles = {
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [currentStyle, setCurrentStyle] = useState<'outdoors' | 'satellite'>('outdoors');

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) return;

    // Initialize map
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapStyles.outdoors,
      center: [-123.8154, 48.9994], // Ladysmith, BC coordinates
      zoom: 12
    });

    // Add navigation controls
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Cleanup on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []);

  const handleStyleChange = (style: 'outdoors' | 'satellite') => {
    if (!mapRef.current) return;

    mapRef.current.setStyle(mapStyles[style]);
    setCurrentStyle(style);
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-96 text-center px-4">
        <p className="text-muted-foreground">
          Map requires a Mapbox access token. Set{' '}
          <code className="font-mono bg-muted px-1 rounded">VITE_MAPBOX_ACCESS_TOKEN</code>{' '}
          in your <code className="font-mono bg-muted px-1 rounded">.env</code> file.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div 
        ref={mapContainerRef}
        className="w-full"
        style={{ height: 'calc(100vh - 120px)' }}
      />
      
      {/* Layer Picker */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Map Style</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mapStyle"
                value="outdoors"
                checked={currentStyle === 'outdoors'}
                onChange={(e) => handleStyleChange(e.target.value as 'outdoors' | 'satellite')}
                className="w-4 h-4 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-slate-700">Outdoors</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mapStyle"
                value="satellite"
                checked={currentStyle === 'satellite'}
                onChange={(e) => handleStyleChange(e.target.value as 'outdoors' | 'satellite')}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Satellite</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
