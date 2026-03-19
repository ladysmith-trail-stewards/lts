import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';

import { supabase } from '@/lib/supa-client';

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next')?.startsWith('/')
      ? searchParams.get('next')!
      : '/';

    if (!tokenHash || !type) {
      navigate(
        `/auth/error?error=${encodeURIComponent('No token hash or type')}`
      );
      return;
    }

    supabase.auth
      .verifyOtp({ type, token_hash: tokenHash })
      .then(({ error }) => {
        if (error) {
          navigate(`/auth/error?error=${encodeURIComponent(error.message)}`);
        } else {
          navigate(next);
        }
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">
        Confirming your account...
      </p>
    </div>
  );
}
