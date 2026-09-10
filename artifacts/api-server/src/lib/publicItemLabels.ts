const publicCategories: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfood\b/i, label: "Food" },
  { pattern: /\bcloth(?:es|ing)?\b/i, label: "Clothing" },
  { pattern: /\bfurniture\b/i, label: "Furniture" },
  { pattern: /\belectronics?\b/i, label: "Electronics" },
  { pattern: /\b(household|home)\b/i, label: "Household" },
  { pattern: /\b(hygiene|toiletr(?:y|ies)|personal care)\b/i, label: "Hygiene" },
  { pattern: /\b(medical|health)\b/i, label: "Medical supply" },
  { pattern: /\b(school|education)\b/i, label: "School supply" },
];

const publicItemNames: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfrozen\b.*\bchicken\b|\bchicken\b.*\bfrozen\b/i, label: "Frozen chicken" },
  { pattern: /\bcanned\b.*\bsoup\b|\bsoup\b.*\bcanned\b/i, label: "Canned soup" },
  { pattern: /\bcanned goods?\b/i, label: "Canned goods" },
  { pattern: /\bproduce\b|\bvegetables?\b|\bfruit\b/i, label: "Fresh produce" },
  { pattern: /\brice\b/i, label: "Rice" },
  { pattern: /\bpasta\b/i, label: "Pasta" },
  { pattern: /\bcoat\b|\bjacket\b/i, label: "Coat or jacket" },
  { pattern: /\bshirt\b/i, label: "Shirt" },
  { pattern: /\bpants?\b|\btrousers?\b/i, label: "Pants" },
  { pattern: /\bshoes?\b|\bboots?\b/i, label: "Footwear" },
  { pattern: /\bblankets?\b/i, label: "Blanket" },
  { pattern: /\bsoap\b/i, label: "Soap" },
  { pattern: /\bdiapers?\b/i, label: "Diapers" },
];

const publicConditions: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
};

export function safeCategory(category: string): string {
  return publicCategories.find(({ pattern }) => pattern.test(category))?.label
    ?? "Donation";
}

export function safeItemName(name: string, category: string): string {
  return publicItemNames.find(({ pattern }) => pattern.test(name))?.label
    ?? `${safeCategory(category)} item`;
}

export function safeCondition(condition: string): string {
  return publicConditions[condition.toLowerCase()] ?? "Available";
}

export function buildPublicResourceCatalog(
  items: Array<{ name: string; category: string; condition: string }>,
) {
  const grouped = new Map<string, {
    name: string;
    category: string;
    condition: string;
    availableCount: number;
  }>();
  for (const item of items) {
    const category = safeCategory(item.category);
    const name = safeItemName(item.name, item.category);
    const condition = safeCondition(item.condition);
    const key = `${category}:${name}:${condition}`;
    const current = grouped.get(key);
    grouped.set(key, current
      ? { ...current, availableCount: current.availableCount + 1 }
      : { name, category, condition, availableCount: 1 });
  }
  return Array.from(grouped.values());
}
