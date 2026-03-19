import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/hooks/useMapbox';
import { MAP_STYLES, type StyleKey } from '@/lib/map/config';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export default function MapPage() {
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

  return <MapPageInner />;
}

function MapPageInner() {
  const {
    mapContainerRef,
    currentStyle,
    contourStrength,
    contourScheme,
    trails,
    loading,
    trailsError,
    handleStyleChange,
    handleContourStrength,
    handleContourScheme,
  } = useMapbox();

  return (
    <div className="relative">
      <div
        ref={mapContainerRef}
        className="w-full"
        style={{ height: 'calc(100vh - 120px)' }}
      />

      {loading && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-white/90 rounded-full px-4 py-1.5 text-xs text-slate-600 shadow">
          Loading trails…
        </div>
      )}

      {trailsError && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 text-xs text-red-700 shadow">
          Failed to load trails: {trailsError}
        </div>
      )}

      {/* Control panel */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[150px] space-y-3">

          {/* Style */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Style</h3>
            <div className="space-y-1.5">
              {(Object.keys(MAP_STYLES) as StyleKey[]).map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mapStyle"
                    value={key}
                    checked={currentStyle === key}
                    onChange={() => handleStyleChange(key)}
                    className="w-3.5 h-3.5 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700 capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Trail count */}
          {!loading && !trailsError && (
            <p className="text-xs text-slate-500 border-t pt-2">
              {trails.length} trail{trails.length !== 1 ? 's' : ''} loaded
            </p>
          )}

          {/* Contour controls */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contours</span>
              <span className="text-xs text-slate-400">{contourStrength === 0 ? 'off' : `${contourStrength}%`}</span>
            </div>
            <input
              type="range"
              min={0} max={100} step={5}
              value={contourStrength}
              onChange={e => handleContourStrength(Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-amber-600 cursor-pointer"
            />
            {/* Light / Dark colour scheme toggle */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">Light</span>
              <button
                onClick={() => handleContourScheme(contourScheme === 'dark' ? 'light' : 'dark')}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none
                  ${contourScheme === 'dark' ? 'bg-amber-700' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform
                  ${contourScheme === 'dark' ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </button>
              <span className="text-xs text-slate-400">Dark</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

