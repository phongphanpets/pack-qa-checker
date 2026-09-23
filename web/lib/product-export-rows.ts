import type { LocalProductDraft } from "./local-template-export";

export function productExportRows(drafts: LocalProductDraft[]) {
  const date = (value: string) => value.trim() ? value.trim().replace("T", " ").replace(/(?<=\d{2}:\d{2})$/, ":00") : "";
  return drafts.map(draft => ["GAME", draft.name, draft.nameEn ?? draft.name, draft.category, (draft.tags || []).join(", "), "", "", "", "", "", "", draft.displayOrder,
    date(draft.saleStart), date(draft.saleEnd), draft.purchaseLimit, "", "", "", "", "", "",
    "TRUE", "TRUE", "FALSE", draft.currency, draft.actualPrice, draft.fullPrice, "", "", "", "", "", "", draft.bundleNames[0], draft.bundleNames[1] || ""]);
}
