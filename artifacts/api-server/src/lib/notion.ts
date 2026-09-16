type NotionEnv = {
  apiKey: string;
  itemsDataSourceUrl: string;
  routesDataSourceUrl: string;
};

export function getNotionEnv(): NotionEnv {
  const apiKey = process.env["NOTION_API_KEY"];
  const itemsDataSourceUrl = process.env["NOTION_ITEMS_DATA_SOURCE_URL"];
  const routesDataSourceUrl = process.env["NOTION_ROUTES_DATA_SOURCE_URL"];

  const missing: string[] = [];
  if (!apiKey) missing.push("NOTION_API_KEY");
  if (!itemsDataSourceUrl) missing.push("NOTION_ITEMS_DATA_SOURCE_URL");
  if (!routesDataSourceUrl) missing.push("NOTION_ROUTES_DATA_SOURCE_URL");

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey!,
    itemsDataSourceUrl: itemsDataSourceUrl!,
    routesDataSourceUrl: routesDataSourceUrl!,
  };
}
