export const starlightHeaders = ["Battery", "Image", "Item ID", "Item Name", "Stackable", "Amt", "Trade", "Limit"];

/**
 * @typedef {{id: string, imageUrl?: string | null}} StarlightCatalogItem
 * @typedef {{battery?: number | null, image?: string | null, stackable?: string | null, trade?: string | null, limit?: number | string | null, item_id?: string | null, name?: string | null, amount?: number | null}} StarlightItem
 * @typedef {{name?: string | null, seed_point?: number | null, purchase_limit?: number | null, items?: StarlightItem[]}} StarlightBundle
 */

function clean(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || "";
}

function numeric(value) {
  if (value == null || clean(value) === "") return null;
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function imageFor(item, catalogById) {
  const explicit = clean(item.image);
  if (explicit) return explicit;
  return clean(catalogById.get(clean(item.item_id).toLowerCase())?.imageUrl);
}

function tradeFor(item) {
  const explicit = clean(item.trade);
  if (explicit) {
    if (/non[- ]?trade|แลกเปลี่ยนไม่ได้|ไม่สามารถแลกเปลี่ยน/i.test(explicit)) return "Non-Trade";
    if (/tradable|tradeable|แลกเปลี่ยนได้/i.test(explicit)) return "Tradable";
    return explicit;
  }
  const name = clean(item.name);
  if (/แลกเปลี่ยนไม่ได้|non[- ]?trade/i.test(name)) return "Non-Trade";
  if (/แลกเปลี่ยนได้|tradable|tradeable/i.test(name)) return "Tradable";
  return "not found";
}

function limitFor(item, bundle) {
  if (item.limit != null && clean(item.limit) !== "") return item.limit;
  if (bundle.purchase_limit != null) return bundle.purchase_limit;
  return "No-Limit";
}

/** @param {StarlightBundle[]} bundles @param {{catalog?: StarlightCatalogItem[]}} [options] */
export function prepareStarlightRows(bundles, { catalog = [] } = {}) {
  const rows = [];
  const errors = [];
  const warnings = [];
  const catalogById = new Map(catalog.map((item) => [clean(item.id).toLowerCase(), item]));
  if (!Array.isArray(bundles) || !bundles.length) return { rows, errors: ["ไม่มี Bundle สำหรับ Export"], warnings };

  for (const bundle of bundles) {
    const name = clean(bundle?.name) || "Bundle";
    if (!Array.isArray(bundle?.items) || bundle.items.length !== 1) {
      errors.push(`${name}: Starlight Shop ต้องเป็น 1 Bundle ต่อ 1 แถว และมี Item เดียว`);
      continue;
    }
    const item = bundle.items[0];
    const battery = numeric(item.battery ?? bundle.seed_point);
    if (battery === null || battery < 0) {
      errors.push(`${name}: ไม่พบ Battery ที่ถูกต้อง`);
      continue;
    }
    const itemId = clean(item.item_id);
    const itemName = clean(item.name);
    const amount = numeric(item.amount);
    if (!itemId || !itemName || amount === null || amount <= 0) {
      errors.push(`${name}: ต้องมี Item ID, Item Name และ Amt ที่ถูกต้อง`);
      continue;
    }
    const stackable = clean(item.stackable) || "not found";
    if (stackable === "not found") warnings.push(`${name}: ไม่พบค่า Stackable จึงใส่ not found`);
    const trade = tradeFor(item);
    if (trade === "not found") warnings.push(`${name}: ไม่พบค่า Trade จึงใส่ not found`);
    rows.push([
      battery,
      imageFor(item, catalogById),
      itemId,
      itemName,
      stackable,
      amount,
      trade,
      limitFor(item, bundle),
    ]);
  }
  return { rows, errors, warnings };
}
