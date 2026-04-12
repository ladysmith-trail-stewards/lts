import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollText } from 'lucide-react';
import {
  getRegionsDb,
  type RegionRecordMeta,
} from '@/lib/db_services/regions/getRegionsDb';

export default function AcceptPolicyPage() {
  const { user, policyAccepted } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionRecordMeta[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);

  useEffect(() => {
    getRegionsDb(supabase, { metaOnly: true }).then(
      ({ data, error: fetchError }) => {
        if (data) setRegions(data);
        if (fetchError)
          setError('Failed to load regions. Please refresh and try again.');
      }
    );
    // supabase is a stable module-level singleton; no re-run needed
  }, []);

  // Navigate home only after AuthContext confirms policyAccepted = true.
  // This ensures PendingApprovalPage never sees stale state.
  useEffect(() => {
    if (submitting && policyAccepted) {
      toast.success("You're on the list!", {
        description:
          'Your policy acceptance has been recorded. An admin will review your account shortly.',
        duration: 6000,
      });
      navigate('/', { replace: true });
    }
  }, [policyAccepted, submitting, navigate]);

  // Guard: unauthenticated users go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Guard: already-accepted users have nothing to do here (and not mid-submit)
  if (policyAccepted && !submitting) {
    return <Navigate to="/" replace />;
  }

  async function handleAccept() {
    if (!regionId || regionId <= 0) {
      setError('Please select your region before continuing.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc('accept_policy', {
      p_region_id: regionId,
    });

    if (rpcError) {
      setError((rpcError as { message: string }).message);
      setSubmitting(false);
      return;
    }

    // Refresh the session so the JWT gets the new policy_accepted = true claim.
    // The hook is volatile so it re-reads profiles and stamps the fresh value.
    // AuthContext picks up TOKEN_REFRESHED, decodes the new token, and flips
    // policyAccepted — the useEffect above then navigates to home.
    const { error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      setError(refreshError.message);
      setSubmitting(false);
    }
    // Navigation happens in the useEffect once policyAccepted flips to true.
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <ScrollText className="h-10 w-10 text-slate-400" />
            </div>
            <CardTitle className="text-2xl">Membership Policy</CardTitle>
            <CardDescription>
              Please read and accept the policy before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Policy text — org to supply final copy before launch */}
            <div className="rounded-md border bg-muted/40 p-4 max-h-72 overflow-y-auto text-sm text-muted-foreground space-y-3">
              <p className="font-semibold text-foreground">
                Ladysmith Trail Stewards — Membership Policy
              </p>
              <p>
                By joining the Ladysmith Trail Stewards you agree to act as a
                responsible steward of the trail network and surrounding natural
                environment. Members are expected to follow all posted trail
                guidelines, respect private and Crown land boundaries, and
                contribute positively to the community.
              </p>
              <p>
                Trail work and organised activities are undertaken voluntarily
                and at your own risk. The Ladysmith Trail Stewards, its
                directors, and volunteers accept no liability for injury, loss,
                or damage arising from participation in any trail-related
                activity.
              </p>
              <p>
                Your personal information (name and email) will be used solely
                for membership administration and will not be shared with third
                parties without your consent.
              </p>
              <p className="italic">
                This is placeholder copy. Final policy text will be supplied by
                the organisation before launch.
              </p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Region <span className="text-red-500">*</span>
              </label>
              <Select
                value={regionId !== null ? String(regionId) : ''}
                onValueChange={(val) => setRegionId(Number(val))}
                disabled={submitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select your region…">
                    {regionId !== null
                      ? (regions.find((r) => r.id === regionId)?.name ?? '')
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary"
              />
              <span className="text-sm leading-snug">
                I have read and agree to the Ladysmith Trail Stewards membership
                policy.
              </span>
            </label>

            <Button
              onClick={handleAccept}
              disabled={!checked || !regionId || regionId <= 0 || submitting}
              className="w-full"
            >
              {submitting ? 'Submitting…' : 'Accept & Continue'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
