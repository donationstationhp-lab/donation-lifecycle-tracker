import { randomBytes } from "node:crypto";

export function generateTrackingCode(): string {
  return `DS-${randomBytes(8).toString("hex").toUpperCase()}`;
}