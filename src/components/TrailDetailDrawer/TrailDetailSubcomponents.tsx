import { Badge } from '@/components/ui/badge';
import { TRAIL_CLASS_COLORS } from './trailEditSchema';

// ── TrailClassDot ─────────────────────────────────────────────────────────────

export function TrailClassDot({ trailClass }: { trailClass: string | null }) {
  if (!trailClass) return null;
  const bg = TRAIL_CLASS_COLORS[trailClass] ?? 'bg-slate-400';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${bg}`}
    />
  );
}

// ── InfoBadge ─────────────────────────────────────────────────────────────────

export function InfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="text-xs font-normal px-2 py-0.5">
      {children}
    </Badge>
  );
}

// ── PillToggle ────────────────────────────────────────────────────────────────

export function PillToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer
        ${
          checked
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
            : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
        }`}
    >
      {label}
    </button>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────

export function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {on ? 'Yes' : 'No'}
    </span>
  );
}
