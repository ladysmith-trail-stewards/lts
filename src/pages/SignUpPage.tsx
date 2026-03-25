import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon } from '@/components/icons/GoogleIcon';

// Production: SSO only. Dev: email/password + SSO.
const isProduction = import.meta.env.PROD;

export default function SignUpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const success = searchParams.has('success');

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const repeatPassword = formData.get('repeat-password') as string;

    if (!password) {
      setError('Password is required');
      setLoading(false);
      return;
    }

    if (password !== repeatPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSearchParams({ success: '' });
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          {success ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">
                  Thank you for signing up!
                </CardTitle>
                <CardDescription>Check your email to confirm</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve successfully signed up. Please check your email to
                  confirm your account before signing in.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Sign up</CardTitle>
                <CardDescription>
                  {isProduction
                    ? 'Create an account with your Google account'
                    : 'Create a new account'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6">
                  {!isProduction && (
                    <form onSubmit={handleSubmit}>
                      <div className="flex flex-col gap-6">
                        <div className="grid gap-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="m@example.com"
                            required
                          />
                        </div>
                        <div className="grid gap-2">
                          <div className="flex items-center">
                            <Label htmlFor="password">Password</Label>
                          </div>
                          <Input
                            id="password"
                            name="password"
                            type="password"
                            required
                          />
                        </div>
                        <div className="grid gap-2">
                          <div className="flex items-center">
                            <Label htmlFor="repeat-password">
                              Repeat Password
                            </Label>
                          </div>
                          <Input
                            id="repeat-password"
                            name="repeat-password"
                            type="password"
                            required
                          />
                        </div>
                        {error && (
                          <p className="text-sm text-red-500">{error}</p>
                        )}
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={loading}
                        >
                          {loading ? 'Creating an account...' : 'Sign up'}
                        </Button>
                      </div>
                      <div className="mt-4 text-center text-sm">
                        Already have an account?{' '}
                        <Link
                          to="/login"
                          className="underline underline-offset-4"
                        >
                          Login
                        </Link>
                      </div>
                    </form>
                  )}
                  <div className="flex flex-col gap-4">
                    {!isProduction && (
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-card px-2 text-muted-foreground">
                            Or continue with
                          </span>
                        </div>
                      </div>
                    )}
                    {error && isProduction && (
                      <p className="text-sm text-red-500">{error}</p>
                    )}
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
                    {isProduction && (
                      <div className="text-center text-sm">
                        Already have an account?{' '}
                        <Link
                          to="/login"
                          className="underline underline-offset-4"
                        >
                          Login
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
