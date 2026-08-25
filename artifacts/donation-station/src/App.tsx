import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setApiKey } from '@workspace/api-client-react';

// Inject the API key into every request made by the generated hooks
setApiKey(import.meta.env.VITE_DONATION_STATION_API_KEY ?? null);

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

function Router() {
  return (
    <Switch>
      {/* /donate is fully public — no Shell, no nav, no auth */}
      <Route path="/donate" component={Donate} />

      {/* All staff routes are wrapped in the Shell */}
      <Route>
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
