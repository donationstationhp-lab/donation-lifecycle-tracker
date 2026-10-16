import type { NetworkEventInput } from "@workspace/api-zod";

export class NetworkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function chicagoDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
export function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    && Number.isFinite(Date.parse(`${day}T12:00:00Z`))
    && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
}
export function requireDay(day: string): void {
  if (!validDay(day)) throw new NetworkError(400, "Choose a valid calendar date.");
}
export function validateNetworkEvent(event: NetworkEventInput, today = chicagoDay()): void {
  requireDay(event.eventDate);
  if (event.recordingMode !== "scheduled" && event.eventDate > today)
    throw new NetworkError(400, "Future transfers must be scheduled.");
  if (event.recordingMode === "live" && event.eventDate !== today)
    throw new NetworkError(400, "Live events use today's Chicago date.");
  if (!event.items.length || event.items.some(i => !i.description.trim() || !i.unit.trim()))
    throw new NetworkError(400, "Describe each goods line and its unit.");
  if (event.kind === "internal_move") {
    if (!event.toAgentId || event.toAgentId === event.agentId)
      throw new NetworkError(400, "Choose two different agents.");
    if (event.organizationId || event.individualSource || event.direction)
      throw new NetworkError(400, "Internal moves connect our own agents only.");
  } else {
    if (event.toAgentId || !event.direction)
      throw new NetworkError(400, "Choose incoming or outgoing supply.");
    if (Boolean(event.organizationId) === Boolean(event.individualSource?.trim()))
      throw new NetworkError(400, "Choose one organization or an incoming first-name-only source.");
    if (event.individualSource && (event.direction !== "incoming"
      || !/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(event.individualSource.trim())))
      throw new NetworkError(400, "Individual sources are incoming only; enter a first name only, without contact details.");
  }
}
export function missingAgentDays(
  agents: Array<{ id: string; joinedOn: string }>,
  days: Array<{ agentId: string; day: string }>,
  today: string,
): Array<{ agentId: string; day: string }> {
  const logged = new Set(days.map(d => `${d.agentId}:${d.day}`));
  const missing: Array<{ agentId: string; day: string }> = [];
  for (const agent of agents) {
    for (let day = agent.joinedOn; day < today;) {
      if (!logged.has(`${agent.id}:${day}`)) missing.push({ agentId: agent.id, day });
      const date = new Date(`${day}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1);
      day = date.toISOString().slice(0, 10);
    }
  }
  return missing;
}
