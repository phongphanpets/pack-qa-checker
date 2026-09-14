import type { SpecBundle } from "./website-ocr.ts";

export function groupProductBundles(bundles: SpecBundle[]) {
  const groups = new Map<string, { key: string; bundle: SpecBundle; bundleNames: string[] }>();
  bundles.forEach((bundle, index) => {
    const key = bundle.product_group ?? `bundle:${index}`;
    const existing = groups.get(key);
    if (existing) existing.bundleNames.push(bundle.name || `Bundle #${index + 1}`);
    else groups.set(key, { key, bundle, bundleNames: [bundle.name || `Bundle #${index + 1}`] });
  });
  return [...groups.values()];
}
