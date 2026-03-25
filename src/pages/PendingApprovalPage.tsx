import { supabase } from '@/lib/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Clock } from 'lucide-react';

export default function PendingApprovalPage() {
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Clock className="h-10 w-10 text-slate-400" />
            </div>
            <CardTitle className="text-2xl">Pending approval</CardTitle>
            <CardDescription>
              Your account is awaiting approval from an administrator.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center">
              You&apos;ll receive access once an admin reviews your account.
              Please check back later.
            </p>
            <Button variant="outline" className="w-full" onClick={handleSignOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
