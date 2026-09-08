import type { SpecBundle } from "./website-ocr.ts";

type Defaults = { seedPoint: number; playerExp: number };

export function expandBundleRewards(source: SpecBundle[], defaults?: Defaults | null): SpecBundle[] {
  return source.flatMap(bundle => {
    const fixedItems = bundle.items.filter(item => item.chance == null);
    const randomItems = bundle.items.filter(item => item.chance != null);
    const seed = bundle.seed_point ?? defaults?.seedPoint ?? null;
    const gsp = bundle.gsp_earn ?? seed;
    const exp = bundle.player_exp ?? (bundle.seed_point != null ? bundle.seed_point / 10 : defaults?.playerExp ?? (seed == null ? null : seed / 10));
    const rewards = [
      { item_id: "GSP", name: "Golden Seed Point", amount: gsp, chance: null },
      { item_id: "PLAYER_EXP", name: "Player EXP", amount: exp, chance: null },
    ].filter(item => item.amount != null && item.amount > 0 && !bundle.items.some(existing => existing.item_id?.trim().toUpperCase() === item.item_id));
    const fixed = [...fixedItems, ...rewards];
    const base = { ...bundle, seed_point: seed, gsp_earn: gsp, player_exp: exp };
    if (!randomItems.length) return [{ ...base, is_gacha: false, items: fixed }];
    return [
      ...(fixed.length ? [{ ...base, name: `${bundle.name || "Bundle"} - Fixed`, is_gacha: false, items: fixed }] : []),
      { ...base, name: `${bundle.name || "Bundle"} - Random`, is_gacha: true, items: randomItems },
    ];
  });
}
