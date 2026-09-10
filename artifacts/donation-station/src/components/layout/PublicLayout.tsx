import { Link, useLocation } from "wouter";
import { Package, Heart, CalendarDays, Users, HelpCircle, Menu, X, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/resources", label: "Resources", icon: Package },
  { href: "/donate", label: "Donate", icon: Heart },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/volunteer", label: "Volunteer", icon: Users },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/resources" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Globe className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold leading-tight tracking-tight text-foreground">W.O.W. OS</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Donation Station</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold transition-colors hover:text-primary",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-4">
             <Button asChild variant="outline" size="sm" className="font-bold border-border text-foreground hover:bg-muted">
               <Link href="/sign-in">Staff Login</Link>
             </Button>
          </div>

          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isOpen}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="md:hidden border-t border-border bg-card">
            <nav className="flex flex-col px-4 py-4 space-y-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 text-base font-semibold",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="pt-4 border-t border-border">
                <Button asChild variant="outline" className="w-full font-bold border-border text-foreground">
                  <Link href="/sign-in" onClick={() => setIsOpen(false)}>Staff Login</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <div className="flex-1 w-full flex flex-col">
        {children}
      </div>

      <footer className="border-t border-border bg-muted/30 py-10 mt-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <Globe className="h-8 w-8 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-sm font-bold text-foreground">W.O.W. Universal Servicing OS</p>
          <p className="text-xs font-medium text-muted-foreground mt-1 max-w-sm mx-auto">
            Dignified public resources, privacy-safe tracking, and community service.
          </p>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs font-medium text-muted-foreground">
            <Link href="/resources" className="hover:text-foreground">Resources</Link>
            <Link href="/faq" className="hover:text-foreground">FAQ</Link>
            <Link href="/sign-in" className="hover:text-foreground">Staff Access</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
