import { getNotionEnv } from "./notion";
import { initializeNotionItemLogSchema } from "./notionItemLogSchema";

export type NotionProperty = {
  type?: string; title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null; status?: { name?: string } | null;
  date?: { start?: string } | null; checkbox?: boolean; number?: number | null;
  unique_id?: { prefix?: string | null; number?: number };
};
export type NotionItemPage = {
  id: string; url: string; last_edited_time: string;
  properties: Record<string, NotionProperty>;
};

export function propertyText(property: NotionProperty | undefined): string {
  if (!property) return "";
  if (property.type === "unique_id" && property.unique_id) {
    return `${property.unique_id.prefix ? property.unique_id.prefix + "-" : ""}${property.unique_id.number ?? ""}`;
  }
  return (property.title ?? property.rich_text)?.map((part) => part.plain_text ?? "").join("")
    ?? property.select?.name ?? property.status?.name ?? property.date?.start ?? "";
}

// This client deliberately exposes only the read-only data-source query.
// Notion uses POST for querying; no page/property/block write API is called.
export async function readAllNotionItems(): Promise<NotionItemPage[]> {
  const schema = await initializeNotionItemLogSchema();
  const env = getNotionEnv();
  const pages: NotionItemPage[] = [];
  const seen = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(`https://api.notion.com/v1/data_sources/${schema.dataSourceId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.apiKey}`, "Notion-Version": "2025-09-03",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || (response.status !== 429 && response.status < 500)) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve,
        Math.min(10_000, Math.max(500, Number(response!.headers.get("retry-after") ?? 2) * 1000))));
    }
    if (!response?.ok) throw new Error(`Notion read failed (${response?.status ?? "unavailable"}); no import performed`);
    const body = await response.json() as {
      results?: NotionItemPage[]; has_more?: boolean; next_cursor?: string | null;
    };
    if (!Array.isArray(body.results)) throw new Error("Notion query returned invalid records");
    for (const page of body.results) {
      if (!page.id || !page.properties) throw new Error("Notion returned an invalid item page");
      if (!seen.has(page.id)) { pages.push(page); seen.add(page.id); }
    }
    const next = body.has_more ? body.next_cursor : null;
    if (body.has_more && (!next || cursors.has(next))) throw new Error("Notion pagination did not advance");
    if (next) cursors.add(next);
    cursor = next ?? undefined;
  } while (cursor);
  return pages;
}
