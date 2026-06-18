import type { SopEntry } from "./sops";
import { buildSearchRecord } from "./sops";

export function buildSearchIndex(sops: SopEntry[]) {
  return sops.map(buildSearchRecord);
}

export function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
