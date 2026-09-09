const DEFAULT_PUBLIC_APP_URL =
  'https://donation-lifecycle-tracker.replit.app';

export function buildPublicTrackingUrl(
  trackingCode: string | null | undefined,
): string | null {
  if (!trackingCode) return null;

  const baseUrl = (
    import.meta.env.PUBLIC_APP_URL?.trim() || DEFAULT_PUBLIC_APP_URL
  ).replace(/\/+$/, '');

  return `${baseUrl}/track/${encodeURIComponent(trackingCode)}`;
}