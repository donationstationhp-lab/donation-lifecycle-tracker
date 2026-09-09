// artifacts/donation-station/src/pages/PublicTrack.tsx
import { useEffect, useState } from "react";

export default function PublicTrack({ trackingCode }: { trackingCode: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError(null);
        const res = await fetch(`/api/public/track/${encodeURIComponent(trackingCode)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load tracking");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [trackingCode]);

  if (error) return <div className="p-4">Tracking error: {error}</div>;
  if (!data) return <div className="p-4">Loading…</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Tracking</h1>
      <div>Code: {trackingCode}</div>

      {/* Render your public-safe fields here */}
      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>

      <button disabled className="opacity-60">
        Verify to show exact window (SMS coming soon)
      </button>
    </div>
  );
}
