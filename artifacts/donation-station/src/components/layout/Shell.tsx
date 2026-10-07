import { useEffect, useState, ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, AlertTriangle, Truck, Plus, Clock, ClipboardCheck, Flag, FileText, ArrowRightLeft, Users, Heart, CalendarDays, Globe, ShieldAlert, Recycle, Menu, X, LogOut, Link as LinkIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { customFetch } from '@workspace/api-client-react';

// Replaces Clerk's <UserButton /> now that staff sign-in is a session
// cookie, not Clerk — see hooks/use-auth.tsx.
function StaffSignOutButton() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  async function handleSignOut() {
    await logout();
    navigate('/login');
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleSignOut}
      title={user ? `Sign out (${user.name})` : 'Sign out'}
      className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
    >
      <LogOut className="w-4 h-4" />
    </Button>
  );
}

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

type NavItem = {
  href: string;
  alias?: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const pendingCount = usePendingCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navGroups: NavGroup[] = [
    {
      title: "Network Overview",
      items: [
        { href: '/', alias: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/dashboard/receiving', label: 'Receiving', icon: Package },
        { href: '/dashboard/gaining', label: 'Gaining', icon: ShieldAlert },
        { href: '/dashboard/giving', label: 'Giving', icon: Recycle },
        { href: '/dashboard/bridging', label: 'Bridging', icon: Truck },
        { href: '/dashboard/relationships', label: 'Relationships', icon: Heart },
      ]
    },
    {
      title: "Direct Access",
      items: [
        { href: '/items', label: 'Items Directory', icon: Package },
        { href: '/pending', label: 'Review Queue', icon: Clock, badge: pendingCount },
        { href: '/claims', label: 'Claims', icon: FileText },
        { href: '/transfers', label: 'Transfers', icon: ArrowRightLeft },
        { href: '/pickups', label: 'Pickups', icon: ClipboardCheck },
        { href: '/pickup-flags', label: 'Pickup Flags', icon: Flag },
        { href: '/routes', label: 'Routes', icon: Truck },
        { href: '/calendar', label: 'Calendar', icon: CalendarDays },
        { href: '/expiring', label: 'Expiring', icon: AlertTriangle },
      ]
    },
    {
      title: "Records",
      items: [
        { href: '/donors', label: 'Donors', icon: Heart },
        { href: '/accounts', label: 'Accounts', icon: Users },
        { href: '/community-ownership', label: 'Ownership', icon: LinkIcon },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-background text-foreground flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[260px] flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl z-10 shrink-0">
        <div className="p-5 border-b border-sidebar-border/50">
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

        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto custom-scrollbar">
          {navGroups.map((group, i) => (
            <div key={i} className="space-y-1">
              <h3 className="px-3 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              {group.items.map((item) => {
                const isActive = item.href === '/'
                  ? location === '/' || location === '/dashboard'
                  : location === item.href || location.startsWith(item.href + '/');

                return (
                  <Link key={item.href} href={item.href} className={`flex items-center w-full px-3 py-2 text-sm rounded-md transition-all duration-200 ${
                    isActive
                      ? 'bg-primary/20 hover:bg-primary/30 text-primary-foreground font-semibold shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-medium'
                  }`}>
                    <item.icon className={`mr-3 w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-primary' : ''}`} />
                    <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 shadow-sm">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border/50 space-y-3 bg-sidebar/50">
          <Link href="/items/new">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md h-9 text-sm">
              <Plus className="mr-2 w-4 h-4" /> Intake Item
            </Button>
          </Link>
          <div className="flex items-center justify-between pt-2 px-1">
            <a
              href={`${import.meta.env.BASE_URL}donate`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
            >
              <span>↗</span> Donor Form
            </a>
            <StaffSignOutButton />
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
            <StaffSignOutButton />
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

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-sidebar flex flex-col animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border/50 shadow-sm bg-sidebar">
            <h1 className="text-lg font-bold flex items-center gap-2 text-sidebar-foreground">
              <Globe className="w-5 h-5 text-primary" />
              W.O.W. OS Menu
            </h1>
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} className="text-sidebar-foreground hover:bg-sidebar-accent">
              <X className="w-6 h-6" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-8 bg-sidebar">
            {navGroups.map((group, i) => (
              <div key={i} className="space-y-2">
                <h3 className="px-2 text-[11px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = item.href === '/'
                      ? location === '/' || location === '/dashboard'
                      : location === item.href || location.startsWith(item.href + '/');

                    return (
                      <Link key={item.href} href={item.href} className={`flex items-center w-full px-3 py-3 text-sm rounded-md transition-all duration-200 ${
                        isActive
                          ? 'bg-primary/20 text-primary-foreground font-semibold border border-primary/20'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50'
                      }`}>
                        <item.icon className={`mr-4 w-5 h-5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="ml-2 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold px-1.5 shadow-sm">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      {!mobileMenuOpen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around p-2 pb-safe z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          {navGroups[0].items.slice(0, 4).map((item) => {
            const isActive = item.href === '/'
              ? location === '/' || location === '/dashboard'
              : location === item.href || location.startsWith(item.href + '/');

            return (
              <Link key={item.href} href={item.href} className="flex-1 min-w-[60px]">
                <div
                  className={`relative flex flex-col items-center p-2 rounded-lg transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <item.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                  <span className={`text-[10px] font-medium mt-1 truncate max-w-full ${isActive ? 'font-bold' : ''}`}>
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex-1 min-w-[60px] flex flex-col items-center p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg"
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1 truncate max-w-full">
              Menu
            </span>
          </button>
        </nav>
      )}
    </div>
  );
}