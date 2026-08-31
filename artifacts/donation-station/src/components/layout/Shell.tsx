import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, AlertTriangle, Truck, Plus, Clock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';

const API_KEY = import.meta.env.VITE_DONATION_STATION_API_KEY ?? '';

function usePendingCount() {
  const { data } = useQuery<unknown[]>({
    queryKey: ['pending-count'],
    queryFn: () =>
      fetch('/api/items?pendingReview=true', {
        headers: { 'X-API-Key': API_KEY },
      }).then((r) => (r.ok ? r.json() : [])),
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
    { href: '/items', label: 'Items', icon: Package },
    { href: '/donors', label: 'Donors', icon: Users },
    { href: '/expiring', label: 'Expiring', icon: AlertTriangle },
    { href: '/routes', label: 'Routes', icon: Truck },
    { href: '/pending', label: 'Pending Review', icon: Clock, badge: pendingCount },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-primary text-primary-foreground border-r border-sidebar-border">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Package className="w-6 h-6" />
            Donation Station
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? location === '/'
              : location.startsWith(item.href);

            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={`w-full justify-start ${
                    isActive
                      ? 'bg-white/10 hover:bg-white/20 text-white font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="mr-3 w-5 h-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-amber-400 text-[#1e2a38] text-xs font-bold px-1">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 space-y-2">
          <Link href="/items/new">
            <Button className="w-full bg-tier-e hover:bg-tier-e/90 text-white">
              <Plus className="mr-2 w-4 h-4" /> Intake Item
            </Button>
          </Link>
          {/* Quick link to public donor form */}
          <a
            href="/donation-station/donate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors py-1"
          >
            <span>↗</span> Donor form
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full pb-20 md:pb-0 relative flex flex-col">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-primary text-primary-foreground">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Package className="w-5 h-5" />
            Donation Station
          </h1>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <Link href="/pending">
                <span className="flex items-center gap-1 bg-amber-400 text-[#1e2a38] text-xs font-bold px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" />
                  {pendingCount}
                </span>
              </Link>
            )}
            <Link href="/items/new">
              <Button size="icon" className="bg-tier-e hover:bg-tier-e/90 text-white rounded-full w-8 h-8">
                <Plus className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around p-2 pb-safe z-50">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="flex-1">
            <div
              className={`relative flex flex-col items-center p-2 rounded-lg ${
                location === item.href ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon className={`w-5 h-5 ${location === item.href ? 'fill-primary/10' : ''}`} />
              {item.badge != null && item.badge > 0 && (
                <span className="absolute top-1 right-2 min-w-[1rem] h-4 flex items-center justify-center rounded-full bg-amber-400 text-[#1e2a38] text-[9px] font-bold px-0.5">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
              <span className="text-[10px] font-medium mt-1">
                {item.label === 'Pending Review' ? 'Review' : item.label}
              </span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
