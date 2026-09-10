import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Package, Utensils, Shirt, Home, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";

type PublicResource = {
  name: string;
  category: string;
  condition: string;
  availableCount: number;
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Food: Utensils,
  Clothing: Shirt,
  Household: Home,
  Default: Package,
};

export default function PublicResources() {
  const { data: resources = [], isLoading, isError } = useQuery<PublicResource[]>({
    queryKey: ['public-resources'],
    queryFn: () => customFetch('/api/public/resources', { responseType: 'json' })
  });

  const [search, setSearch] = useState("");

  const filtered = resources.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full animate-fade-in">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Available Resources</h1>
        <p className="text-base font-medium text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Browse a privacy-safe preview of current community resources. Availability changes as staff review requests and complete matches.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild><Link href="/schedule">View market times</Link></Button>
          <Button asChild variant="outline"><Link href="/faq">How matching works</Link></Button>
        </div>
      </div>

      <div className="max-w-md mx-auto mb-10">
        <Input 
          placeholder="Search resources..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-12 bg-card shadow-sm"
        />
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="font-medium">Loading catalog...</p>
        </div>
      ) : isError ? (
        <div className="py-12 bg-destructive/10 text-destructive rounded-xl border border-destructive/20 flex flex-col items-center text-center max-w-lg mx-auto p-6">
          <AlertCircle className="w-10 h-10 mb-4" />
          <p className="font-bold text-lg">Unable to load resources</p>
          <p className="text-sm mt-2 opacity-90">Please try again later or contact support.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center bg-muted/20 rounded-xl border border-dashed border-border flex flex-col items-center max-w-2xl mx-auto">
          <Package className="w-10 h-10 text-muted-foreground/40 mb-4" />
          <p className="text-foreground font-bold text-lg">No resources found</p>
          <p className="text-sm font-medium text-muted-foreground mt-1">Check back later as reviewed donations become available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((r, i) => {
            const Icon = CATEGORY_ICONS[r.category] || CATEGORY_ICONS.Default;
            return (
              <Card key={i} className="overflow-hidden hover-elevate transition-all border-border shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 shrink-0">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground line-clamp-1" title={r.name}>{r.name}</h3>
                        <p className="text-sm font-medium text-muted-foreground">{r.category}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Condition</span>
                      <span className="text-sm font-semibold capitalize">{r.condition}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Available</span>
                      <Badge variant="secondary" className="mt-0.5 px-3 py-0.5 font-bold shadow-sm">
                        {r.availableCount}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  );
}
