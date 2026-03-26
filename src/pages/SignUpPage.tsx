import { useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setSsoLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setError(error.message);
      setSsoLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sign up</CardTitle>
              <CardDescription>
                Create an account with your Google account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={ssoLoading}
                  onClick={handleGoogleSignIn}
                >
                  <GoogleIcon />
                  {ssoLoading ? 'Redirecting...' : 'Continue with Google'}
                </Button>
                <div className="text-center text-sm">
                  Already have an account?{' '}
                  <Link to="/login" className="underline underline-offset-4">
                    Login
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
