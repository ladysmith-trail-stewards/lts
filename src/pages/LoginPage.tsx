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

export default function LoginPage() {
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
              <CardTitle className="text-2xl">Login</CardTitle>
              <CardDescription>Sign in with your Google account</CardDescription>
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
                  Don&apos;t have an account?{' '}
                  <Link to="/sign-up" className="underline underline-offset-4">
                    Sign up
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
