import { bundleHeaders, prepareBundleRows } from './bundle-export-rows.mjs';

export const starlightHeaders = bundleHeaders;

// Battery and purchase limits belong to future Products, not bundle rewards.
export function prepareStarlightRows(bundles, options = {}) {
  if (!Array.isArray(bundles) || !bundles.length) return prepareBundleRows([], options);
  const invalid = bundles.filter(bundle => bundle.items?.length !== 1);
  if (invalid.length) return { rows: [], warnings: [], errors: invalid.map(bundle => `${bundle.name}: Starlight Shop ต้องมี 1 Item ต่อ Bundle`) };
  return prepareBundleRows(bundles.map(bundle => ({
    ...bundle,
    is_gacha: false,
    items: bundle.items.map(item => ({ ...item, tier: 'Trainee' })),
  })), options);
}
