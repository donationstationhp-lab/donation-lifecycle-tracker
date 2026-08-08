import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Package, AlertTriangle, Truck, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/items', label: 'Items', icon: Package },
    { href: '/expiring', label: 'Expiring', icon: AlertTriangle },
    { href: '/routes', label: 'Routes', icon: Truck },
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
        
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={location === item.href ? 'secondary' : 'ghost'}
                className={`w-full justify-start ${
                  location === item.href 
                    ? 'bg-white/10 hover:bg-white/20 text-white font-medium' 
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <item.icon className="mr-3 w-5 h-5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="p-4">
          <Link href="/items/new">
            <Button className="w-full bg-tier-e hover:bg-tier-e/90 text-white">
              <Plus className="mr-2 w-4 h-4" /> Intake Item
            </Button>
          </Link>
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
          <Link href="/items/new">
            <Button size="icon" className="bg-tier-e hover:bg-tier-e/90 text-white rounded-full w-8 h-8">
              <Plus className="w-5 h-5" />
            </Button>
          </Link>
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
            <div className={`flex flex-col items-center p-2 rounded-lg ${
              location === item.href ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}>
              <item.icon className={`w-6 h-6 ${location === item.href ? 'fill-primary/10' : ''}`} />
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}