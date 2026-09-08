import type { SpecBundle } from "@/lib/website-ocr";

export type CatalogItem = {
  id: string;
  name: string;
  tier: string | null;
  imageUrl: string | null;
  sourceName: string | null;
};

export type CatalogValidation = {
  catalogSize: number;
  checked: number;
  missing: Array<{ id: string; name: string; bundleName: string | null }>;
  nameMismatches: Array<{
    id: string;
    requestName: string;
    catalogName: string;
    bundleName: string | null;
  }>;
  mapped: Array<{ from: string; to: string; label: string }>;
};

const specialItems: Record<string, { id: string; label: string }> = {
  gold_cur: { id: "101147", label: "Gold" },
  currency: { id: "101147", label: "Gold" },
  diamond_cur: { id: "101146", label: "Diamond" },
};
const walletItems: Record<string, string> = {
  popo_god_1: "God Coin",
  popo_fellow_1: "Fellow Coin",
  popo_kupo_1: "Kupole Coin",
  web_only: "Royale Chamberkey",
};
const generatedRewardIds = new Set(["gsp", "player_exp"]);

export function parseItemCatalog(input: string): CatalogItem[] {
  const rows = input
    .replace(/\r/g, "")
    .split("\n")
    .map((row) => row.split("\t").map(clean));
  const headerRow = rows.findIndex((row) =>
    row.some((cell) => normalize(cell) === "item id"),
  );
  if (headerRow < 0) return [];

  const header = rows[headerRow];
  const idColumn = column(header, ["item id", "item_id", "item code", "id"]);
  const thaiNameColumn = column(header, ["item th", "item name th", "name th"]);
  const englishNameColumn = column(header, ["item en", "item name", "item name en", "name en"]);
  const gradeColumn = column(header, ["grade", "tier"]);
  const imageColumn = column(header, ["cdn url", "image url"]);
  if (idColumn < 0) return [];

  const items = new Map<string, CatalogItem>();
  for (const row of rows.slice(headerRow + 1)) {
    const id = clean(row[idColumn]);
    if (!id || normalize(id) === "item id") continue;
    const thaiName = thaiNameColumn >= 0 ? clean(row[thaiNameColumn]) : "";
    const englishName = englishNameColumn >= 0 ? clean(row[englishNameColumn]) : "";
    const name = englishName || thaiName;
    if (!name) continue;
    items.set(normalizeId(id), {
      id,
      name,
      tier: gradeColumn >= 0 ? clean(row[gradeColumn]) || null : null,
      imageUrl: imageColumn >= 0 ? clean(row[imageColumn]) || null : null,
      sourceName: thaiName || null,
    });
  }
  return [...items.values()];
}

export function validateCatalogItems(
  bundles: SpecBundle[],
  catalog: CatalogItem[],
): CatalogValidation {
  const catalogById = new Map(catalog.map((item) => [normalizeId(item.id), item]));
  const missing: CatalogValidation["missing"] = [];
  const nameMismatches: CatalogValidation["nameMismatches"] = [];
  const mapped: CatalogValidation["mapped"] = [];
  let checked = 0;

  for (const bundle of bundles) {
    for (const item of bundle.items) {
      const originalId = clean(item.item_id);
      if (!originalId) continue;
      if (generatedRewardIds.has(normalize(originalId))) continue;
      checked += 1;
      const wallet = walletItems[normalize(originalId)];
      if (wallet) {
        mapped.push({ from: originalId, to: "WALLET_DEBIT", label: wallet });
        continue;
      }
      const special = specialItems[normalize(originalId)];
      const resolvedId = special?.id || originalId;
      if (special) mapped.push({ from: originalId, to: special.id, label: special.label });
      const catalogItem = catalogById.get(normalizeId(resolvedId));
      if (!catalogItem) {
        missing.push({ id: resolvedId, name: item.name || "", bundleName: bundle.name });
        continue;
      }
      if (item.name && !namesMatch(item.name, catalogItem)) {
        nameMismatches.push({
          id: resolvedId,
          requestName: item.name,
          catalogName: catalogItem.name,
          bundleName: bundle.name,
        });
      }
    }
  }
  return { catalogSize: catalog.length, checked, missing, nameMismatches, mapped };
}

function column(header: string[], labels: string[]) {
  return header.findIndex((cell) => labels.includes(normalize(cell)));
}

function namesMatch(requestName: string, catalogItem: CatalogItem) {
  const request = normalizeName(requestName);
  return [catalogItem.name, catalogItem.sourceName]
    .filter(Boolean)
    .some((name) => normalizeName(name || "") === request);
}

function normalizeId(value: string) {
  return normalize(value).replace(/\s+/g, "");
}

function normalizeName(value: string) {
  return normalize(value).replace(/[\[\]()'":,.-]/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return clean(value).toLocaleLowerCase("en-US");
}

function clean(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}
