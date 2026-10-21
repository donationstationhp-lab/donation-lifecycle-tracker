export function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; constraint?: unknown };
    if (
      candidate.code === "23505"
      && (!constraintName || candidate.constraint === constraintName)
    ) {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return false;
}

export function isMissingColumn(error: unknown, columnName?: string): boolean {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; column?: unknown; message?: unknown };
    if (
      candidate.code === "42703"
      && (
        !columnName ||
        candidate.column === columnName ||
        (typeof candidate.message === "string" && candidate.message.includes(columnName))
      )
    ) {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return false;
}