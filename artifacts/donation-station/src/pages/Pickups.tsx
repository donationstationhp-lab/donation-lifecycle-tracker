import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Pickups() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pickups</h1>
        <p className="text-muted-foreground text-sm">
          Verify donation pickup requests before dispatch.
        </p>
      </div>

      <Card className="border-dashed shadow-sm">
        <CardContent className="p-12 text-center flex flex-col items-center">
          <ClipboardCheck className="w-12 h-12 mb-4 text-muted-foreground opacity-20" />
          <h2 className="text-lg font-medium text-foreground">No pickup requests yet</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Pickup verification requests will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}