import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { Shell } from '@/components/layout/Shell';
import Dashboard from '@/pages/Dashboard';
import Donate from '@/pages/Donate';
import Login from '@/pages/Login';
import ItemsList from '@/pages/ItemsList';
import IntakeForm from '@/pages/IntakeForm';
import ItemDetail from '@/pages/ItemDetail';
import Donors from '@/pages/Donors';
import DonorDetail from '@/pages/DonorDetail';
import ExpiringItems from '@/pages/ExpiringItems';
import RoutesList from '@/pages/RoutesList';
import RouteDetail from '@/pages/RouteDetail';
import PendingReview from '@/pages/PendingReview';

const queryClient = new QueryClient();

// Redirects to /login when no staff session is present; renders nothing
// while the initial /api/auth/me check is in flight.
function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [isLoading, user, navigate]);

  if (isLoading || !user) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      {/* /donate is fully public — no Shell, no nav, no auth */}
      <Route path="/donate" component={Donate} />
      <Route path="/login" component={Login} />

      {/* All staff routes require a signed-in session and are wrapped in the Shell */}
      <Route>
        <AuthGate>
          <Shell>
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/items" component={ItemsList} />
                <Route path="/items/new" component={IntakeForm} />
                <Route path="/items/:id" component={ItemDetail} />
                <Route path="/donors" component={Donors} />
                <Route path="/donors/:id" component={DonorDetail} />
                <Route path="/expiring" component={ExpiringItems} />
                <Route path="/routes" component={RoutesList} />
                <Route path="/routes/:id" component={RouteDetail} />
                <Route path="/pending" component={PendingReview} />
                <Route component={NotFound} />
              </Switch>
            </RoutedErrorBoundary>
          </Shell>
        </AuthGate>
      </Route>
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
