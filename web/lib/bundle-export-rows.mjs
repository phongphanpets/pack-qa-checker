export const bundleHeaders = ["Bundle Name", "Bundle Type", "Item Type", "Item ID", "Quantity", "Tier", "Position", "เรทสุ่ม", "เรทโชว์"];

function numeric(value) {
  if (value == null || String(value).trim() === "" || typeof value === "boolean") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function rewardIdentity(value, name = "") {
  const id = String(value ?? "").trim().replace(/\\_/g, "_");
  const normalized = id.toLowerCase().replace(/\s+/g, "_");
  const wallets = { popo_god_1: "God Coin", popo_fellow_1: "Fellow Coin", popo_kupo_1: "Kupole Coin", gsp: "Golden Seed Point" };
  if (Object.hasOwn(wallets, normalized)) return { type: "WALLET_DEBIT", id: wallets[normalized] };
  if (normalized === "player_exp") return { type: "PLAYER_EXPERIENCE", id: "Player Experience - tosm" };
  if (normalized === "currency") {
    if (/^gold$/i.test(String(name).trim())) return { type: "ITEM", id: "101147" };
    if (/^diamond$/i.test(String(name).trim())) return { type: "ITEM", id: "101146" };
    throw new Error("Currency ต้องระบุชื่อ Gold หรือ Diamond ให้ชัดเจน");
  }
  if (normalized === "gold_cur") return { type: "ITEM", id: "101147" };
  if (normalized === "diamond_cur") return { type: "ITEM", id: "101146" };
  if (!id || /^(not found|web only|#value!|#n\/a)$/i.test(id)) throw new Error("Item ID ไม่ครบหรือยังไม่ได้จับคู่");
  return { type: "ITEM", id };
}

export function prepareBundleRows(bundles, { mirrorChance = false, catalog = [] } = {}) {
  const rows = [], errors = [], warnings = [];
  const names = new Set();
  const catalogById = new Map(catalog.map(item => [String(item.id).trim().toLowerCase(), item]));
  if (!Array.isArray(bundles) || !bundles.length) return { rows, errors: ["ไม่มี Bundle สำหรับ Export"], warnings };
  for (const bundle of bundles) {
    const name = String(bundle.name || "").trim();
    if (!name || name === "Untitled Bundle") errors.push("กรอกชื่อ Bundle ก่อน Export");
    if (names.has(name)) errors.push(`${name}: ชื่อ Bundle ซ้ำ`);
    names.add(name);
    if (!Array.isArray(bundle.items) || !bundle.items.length) { errors.push(`${name}: ไม่มีไอเท็ม`); continue; }
    let chanceTotal = 0;
    bundle.items.forEach((item, index) => {
      const label = `${name} รายการ ${index + 1}`;
      try {
        const reward = rewardIdentity(item.item_id, item.name);
        const amount = numeric(item.amount);
        if (amount === null || amount <= 0) throw new Error("จำนวนต้องมากกว่า 0");
        const chance = bundle.is_gacha ? numeric(item.chance) : null;
        if (bundle.is_gacha && (chance === null || chance < 0 || chance > 100)) throw new Error("Chance ต้องเป็นตัวเลข 0–100");
        const display = bundle.is_gacha ? mirrorChance ? chance : numeric(item.secret_chance) : null;
        if (display !== null && (display < 0 || display > 100)) throw new Error("Secret Chance ต้องอยู่ในช่วง 0–100");
        if (!mirrorChance && bundle.is_gacha && item.secret_chance != null && String(item.secret_chance).trim() !== "" && display === null) throw new Error("Secret Chance ไม่ใช่ตัวเลข");
        const record = catalogById.get(reward.id.toLowerCase()) || catalogById.get(String(item.item_id).trim().toLowerCase());
        const tier = String(item.tier || record?.tier || "Trainee").trim();
        if (/^(true|false|#value!|not found)$/i.test(tier)) throw new Error("Tier ไม่ถูกต้อง");
        rows.push([name, bundle.is_gacha ? "RANDOM" : "FIXED", reward.type, reward.id, amount, tier, index + 1, chance, display]);
        chanceTotal += chance || 0;
      } catch (error) { errors.push(`${label}: ${error.message}`); }
    });
    if (bundle.is_gacha && Math.abs(chanceTotal - 100) > 0.000001) warnings.push(`${name}: ผลรวม Chance ${Number(chanceTotal.toFixed(8))}% (ควรเป็น 100%)`);
  }
  return { rows, errors, warnings };
}
