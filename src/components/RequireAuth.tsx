import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, policyAccepted, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!policyAccepted) {
    return <Navigate to="/accept-policy" replace />;
  }

  return <>{children}</>;
}
