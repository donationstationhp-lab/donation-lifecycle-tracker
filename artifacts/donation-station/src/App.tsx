import { type ReactNode, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Show, SignIn, SignUp, UserButton, useAuth as useClerkAuth, useUser } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";

import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Shell } from "@/components/layout/Shell";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import DashboardBridging from "@/pages/DashboardBridging";
import DashboardGaining from "@/pages/DashboardGaining";
import DashboardGiving from "@/pages/DashboardGiving";
import DashboardReceiving from "@/pages/DashboardReceiving";
import DashboardRelationships from "@/pages/DashboardRelationships";
import Donate from "@/pages/Donate";
import ItemDetail from "@/pages/ItemDetail";
import ItemsList from "@/pages/ItemsList";
import IntakeForm from "@/pages/IntakeForm";
import DonorDetail from "@/pages/DonorDetail";
import Donors from "@/pages/Donors";
import ExpiringItems from "@/pages/ExpiringItems";
import RoutesList from "@/pages/RoutesList";
import RouteDetail from "@/pages/RouteDetail";
import PendingReview from "@/pages/PendingReview";
import Pickups from "@/pages/Pickups";
import PickupFlags from "@/pages/PickupFlags";
import AccountsList from "@/pages/AccountsList";
import ClaimsList from "@/pages/ClaimsList";
import ClaimDetail from "@/pages/ClaimDetail";
import TransfersList from "@/pages/TransfersList";
import TransferDetail from "@/pages/TransferDetail";
import NotFound from "@/pages/not-found";
import PublicFAQ from "@/pages/PublicFAQ";
import PublicResources from "@/pages/PublicResources";
import PublicTrack from "@/pages/PublicTrack";
import PublicPrivacy from "@/pages/PublicPrivacy";
import PublicTerms from "@/pages/PublicTerms";
import Schedule from "@/pages/Schedule";
import CommunityHistory from "@/pages/CommunityHistory";
import CommunityOwnershipPage from "@/pages/CommunityOwnership";

const queryClient = new QueryClient();

function DonorAuthCard({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Donation Station</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to view your private donation history.
          </p>
        </div>
        {mode === "sign-in" ? (
          <SignIn routing="hash" signUpUrl="/sign-up" />
        ) : (
          <SignUp routing="hash" signInUrl="/sign-in" />
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Staff member?{" "}
          <a href="/login" className="underline hover:text-foreground">
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );
}

function PublicTrackRedirect({ trackingCode }: { trackingCode: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(`/track/${trackingCode}`);
  }, [setLocation, trackingCode]);
  return null;
}

function PublicPage({ children }: { children: ReactNode }) {
  return <PublicLayout>{children}</PublicLayout>;
}

// Attaches Clerk's bearer token to API calls only while a donor/community
// Clerk session is active. Staff calls need no token: the httpOnly session
// cookie from /auth/login rides along automatically (see hooks/use-auth.tsx).
function CommunityAuthTransport() {
  const { user, isLoaded } = useUser();
  const { getToken } = useClerkAuth();
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

    if (!user) {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded, user?.id]);

  return null;
}

/** Gate for staff routes: a signed-in session cookie, not Clerk. */
function StaffAuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Validating staff access...
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}

function StaffApp() {
  return (
    <StaffAuthGate>
      <Shell>
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/dashboard/receiving" component={DashboardReceiving} />
            <Route path="/dashboard/gaining" component={DashboardGaining} />
            <Route path="/dashboard/giving" component={DashboardGiving} />
            <Route path="/dashboard/bridging" component={DashboardBridging} />
            <Route path="/dashboard/relationships" component={DashboardRelationships} />
            <Route path="/items" component={ItemsList} />
            <Route path="/items/new" component={IntakeForm} />
            <Route path="/items/:id" component={ItemDetail} />
            <Route path="/donors" component={Donors} />
            <Route path="/donors/:id" component={DonorDetail} />
            <Route path="/pickups" component={Pickups} />
            <Route path="/pickup-flags" component={PickupFlags} />
            <Route path="/expiring" component={ExpiringItems} />
            <Route path="/claims" component={ClaimsList} />
            <Route path="/claims/:id" component={ClaimDetail} />
            <Route path="/transfers" component={TransfersList} />
            <Route path="/transfers/:id" component={TransferDetail} />
            <Route path="/routes" component={RoutesList} />
            <Route path="/routes/:id" component={RouteDetail} />
            <Route path="/accounts" component={AccountsList} />
            <Route path="/community-ownership" component={CommunityOwnershipPage} />
            <Route path="/pending" component={PendingReview} />
            <Route path="/calendar"><Schedule /></Route>
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </Shell>
    </StaffAuthGate>
  );
}

function CommunityApp() {
  return (
    <>
      <CommunityAuthTransport />
      <main className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex justify-end mb-4"><UserButton /></div>
          <CommunityHistory />
        </div>
      </main>
    </>
  );
}

/**
 * A signed-in Clerk user only ever reaches community data if the server
 * also agrees (apiKeyAuth.ts's getClerkCommunityRole requires the
 * "community" metadata role) — this client-side check is a UX nicety, not
 * the security boundary, so it mirrors the server's rule rather than
 * loosening or tightening it.
 */
function CommunityGate() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Validating access...
      </div>
    );
  }

  const role = user?.publicMetadata.role;
  if (role !== "community") {
    return (
      <div className="min-h-screen bg-background grid place-items-center p-4">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold">Community access not assigned</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is signed in, but an administrator must assign the
            community role before you can view your donation history.
          </p>
          <div className="mt-6 flex justify-center"><UserButton /></div>
        </div>
      </div>
    );
  }

  return <CommunityApp />;
}

function Router() {
  return (
    <Switch>
      <Route path="/resources">
        <PublicPage><PublicResources /></PublicPage>
      </Route>
      <Route path="/faq">
        <PublicPage><PublicFAQ /></PublicPage>
      </Route>
      <Route path="/schedule">
        <PublicPage><Schedule /></PublicPage>
      </Route>
      <Route path="/volunteer">
        <PublicPage><Schedule mode="volunteer" /></PublicPage>
      </Route>
      <Route path="/privacy">
        <PublicPage><PublicPrivacy /></PublicPage>
      </Route>
      <Route path="/terms">
        <PublicPage><PublicTerms /></PublicPage>
      </Route>
      <Route path="/track/:trackingCode">
        {(params) => (
          <PublicPage><PublicTrack trackingCode={params.trackingCode} /></PublicPage>
        )}
      </Route>
      <Route path="/public/track/:trackingCode">
        {(params) => <PublicTrackRedirect trackingCode={params.trackingCode} />}
      </Route>
      <Route path="/donate">
        <PublicPage><Donate /></PublicPage>
      </Route>

      {/* Staff sign-in — a plain login form, not Clerk. */}
      <Route path="/login" component={Login} />

      {/* Donor/community sign-in — Clerk only, never grants staff access. */}
      <Route path="/sign-in">
        <Show when="signed-in" fallback={<DonorAuthCard mode="sign-in" />}>
          <CommunityGate />
        </Show>
      </Route>
      <Route path="/sign-up">
        <Show when="signed-in" fallback={<DonorAuthCard mode="sign-up" />}>
          <CommunityGate />
        </Show>
      </Route>

      {/*
        Default: staff app, gated by the session cookie from /login. A
        signed-in Clerk donor landing here (e.g. a bookmarked "/") still
        sees their own history instead of a staff login prompt.
      */}
      <Route>
        <Show when="signed-in" fallback={<StaffApp />}>
          <CommunityGate />
        </Show>
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
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
