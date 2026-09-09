import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, AlertTriangle, Truck, Plus, Clock, ClipboardCheck, Flag, FileText, ArrowRightLeft, Users, Heart, CalendarDays, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { UserButton } from '@clerk/react';
import { customFetch } from '@workspace/api-client-react';

function usePendingCount() {
  const { data } = useQuery<unknown[]>({
    queryKey: ['pending-count'],
    queryFn: () =>
      customFetch<unknown[]>('/api/items?pendingReview=true', {
        responseType: 'json',
      }),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  return Array.isArray(data) ? data.length : 0;
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const pendingCount = usePendingCount();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/items', label: 'Items', desktopLabel: 'Items — Received Resources', icon: Package },
    { href: '/donors', label: 'Donors', icon: Heart },
    { href: '/accounts', label: 'Accounts', icon: Users },
    { href: '/claims', label: 'Claims', desktopLabel: 'Claims — Service Requests / Gaining Verification', icon: FileText },
    { href: '/transfers', label: 'Transfers', desktopLabel: 'Transfers — Giving / Distribution', icon: ArrowRightLeft },
    { href: '/calendar', label: 'Calendar', desktopLabel: 'Calendar — Bridging Time', icon: CalendarDays },
    { href: '/pickups', label: 'Pickups', icon: ClipboardCheck },
    { href: '/pickup-flags', label: 'Flags', icon: Flag },
    { href: '/expiring', label: 'Expiring', icon: AlertTriangle },
    { href: '/routes', label: 'Routes', desktopLabel: 'Routes — Bridging Movement', icon: Truck },
    { href: '/pending', label: 'Review', desktopLabel: 'Review — Due Diligence', icon: Clock, badge: pendingCount },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[300px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-10">
        <div className="p-6 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg text-primary">
              <Globe className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-none tracking-wide text-white">W.O.W. OS</span>
              <span className="text-[9px] text-white/50 leading-none uppercase tracking-widest font-semibold mt-1.5">Receive. Gain. Give.</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? location === '/'
              : location.startsWith(item.href);

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/20 hover:bg-primary/30 text-primary-foreground font-semibold shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-medium'
                  }`}
                >
                  <item.icon className={`mr-3 w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-primary' : ''}`} />
                  <span className="flex-1 text-left whitespace-normal text-xs md:text-sm">{item.desktopLabel || item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold px-1.5 shadow-sm">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 space-y-3 bg-sidebar/50">
          <Link href="/items/new">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md">
              <Plus className="mr-2 w-4 h-4" /> Intake Item
            </Button>
          </Link>
          {/* Quick link to public donor form */}
          <a
            href={`${import.meta.env.BASE_URL}donate`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors py-2"
          >
            <span>↗</span> Donor Form
          </a>
          <div className="flex items-center justify-center pt-2">
            <UserButton />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full pb-20 md:pb-0 relative flex flex-col bg-background">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-sidebar text-sidebar-foreground shadow-md z-20">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            W.O.W. OS
          </h1>
          <div className="flex items-center gap-3">
            <UserButton />
            {pendingCount > 0 && (
              <Link href="/pending">
                <span className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                  <Clock className="w-3 h-3" />
                  {pendingCount}
                </span>
              </Link>
            )}
            <Link href="/items/new">
              <Button size="icon" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-8 h-8 shadow-sm">
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-8 w-full max-w-full lg:max-w-7xl mx-auto h-full flex flex-col">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 pb-safe z-50 overflow-x-auto shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className="flex-1 min-w-[60px]">
              <div
                className={`relative flex flex-col items-center p-2 rounded-lg transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute top-1 right-2 min-w-[1rem] h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold px-0.5 shadow-sm">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
                <span className={`text-[10px] font-medium mt-1 truncate max-w-full ${isActive ? 'font-bold' : ''}`}>
                  {item.label}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
