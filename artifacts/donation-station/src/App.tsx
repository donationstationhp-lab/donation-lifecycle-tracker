import { type ReactNode } from 'react';
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

import { Shell } from '@/components/layout/Shell';
import Dashboard from '@/pages/Dashboard';
import ItemsList from '@/pages/ItemsList';
import IntakeForm from '@/pages/IntakeForm';
import ItemDetail from '@/pages/ItemDetail';
import ExpiringItems from '@/pages/ExpiringItems';
import RoutesList from '@/pages/RoutesList';
import RouteDetail from '@/pages/RouteDetail';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/items" component={ItemsList} />
          <Route path="/items/new" component={IntakeForm} />
          <Route path="/items/:id" component={ItemDetail} />
          <Route path="/expiring" component={ExpiringItems} />
          <Route path="/routes" component={RoutesList} />
          <Route path="/routes/:id" component={RouteDetail} />
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