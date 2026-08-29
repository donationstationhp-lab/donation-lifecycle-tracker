import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Show, SignIn, SignUp, UserButton, useAuth, useUser } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import { Shell } from '@/components/layout/Shell';
import Dashboard from '@/pages/Dashboard';
import Donate from '@/pages/Donate';
import ItemsList from '@/pages/ItemsList';
import IntakeForm from '@/pages/IntakeForm';
import ItemDetail from '@/pages/ItemDetail';
import ExpiringItems from '@/pages/ExpiringItems';
import RoutesList from '@/pages/RoutesList';
import RouteDetail from '@/pages/RouteDetail';
import PendingReview from '@/pages/PendingReview';
import Pickups from '@/pages/Pickups';
import PickupFlags from '@/pages/PickupFlags';

const queryClient = new QueryClient();

function AuthCard({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Donation Station</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff access is required to view donor and operations records.
          </p>
        </div>
        {mode === 'sign-in' ? (
          <SignIn routing="hash" signUpUrl="/sign-up" />
        ) : (
          <SignUp routing="hash" signInUrl="/sign-in" />
        )}
      </div>
    </div>
  );
}

function SessionCacheReset() {
  const { user, isLoaded } = useUser();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const currentUserId = user?.id ?? null;
    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== currentUserId
    ) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [isLoaded, user?.id]);
  return null;
}

function Router() {
  return (
    <Switch>
      {/* /donate is fully public — no Shell, no nav, no auth */}
      <Route path="/donate" component={Donate} />
      <Route path="/sign-in">
        <Show when="signed-in" fallback={<AuthCard mode="sign-in" />}>
          <StaffApp />
        </Show>
      </Route>
      <Route path="/sign-up">
        <Show when="signed-in" fallback={<AuthCard mode="sign-up" />}>
          <StaffApp />
        </Show>
      </Route>

      <Route>
        <Show when="signed-in" fallback={<AuthCard mode="sign-in" />}>
          <StaffApp />
        </Show>
      </Route>
    </Switch>
  );
}

function StaffApp() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [authTransportReady, setAuthTransportReady] = useState(false);
  useEffect(() => {
    if (!isLoaded || !user) {
      setAuthTokenGetter(null);
      setAuthTransportReady(false);
      return;
    }
    setAuthTokenGetter(() => getToken());
    setAuthTransportReady(true);
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded, user?.id]);

  if (!isLoaded || !authTransportReady) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Validating staff access...
      </div>
    );
  }
  const role = user?.publicMetadata.role;
  if (role !== 'staff' && role !== 'supervisor') {
    return (
      <div className="min-h-screen bg-background grid place-items-center p-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Staff access not assigned</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is signed in, but an administrator must assign the
            staff or supervisor role before you can view donor records.
          </p>
          <div className="mt-6 flex justify-center"><UserButton /></div>
        </div>
      </div>
    );
  }
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/items" component={ItemsList} />
          <Route path="/items/new" component={IntakeForm} />
          <Route path="/items/:id" component={ItemDetail} />
          <Route path="/pickups" component={Pickups} />
          <Route path="/pickup-flags" component={PickupFlags} />
          <Route path="/expiring" component={ExpiringItems} />
          <Route path="/routes" component={RoutesList} />
          <Route path="/routes/:id" component={RouteDetail} />
          <Route path="/pending" component={PendingReview} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionCacheReset />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
