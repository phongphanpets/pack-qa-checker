import { createSimpleXlsx } from "./bundle-import-xlsx.ts";
import type { SpecBundle } from "./website-ocr";

export type ItemCodeRequestDraft = {
  title: string;
  codeKind: string;
  serial: string;
  startAt: string;
  endAt: string;
  perUserLimit: string;
  redeemLimit: string;
  conditions: string[];
  bundles: SpecBundle[];
};

const headers = ["Code Serial", "Code Type", "Start to Use", "Expire Date", "Redeem Rule / User", "Redeem Limit", "Conditions (AND)", "Bundle", "Item ID", "Item Name", "Amt", "Chance"];

export function itemCodeRequestRows(draft: ItemCodeRequestDraft): Array<Array<string | number | null>> {
  const items = draft.bundles.flatMap((bundle) => bundle.items.map((item) => ({ bundle, item })));
  const rows = items.length ? items : [{ bundle: null, item: null }];
  return rows.map(({ bundle, item }) => [draft.serial, draft.codeKind, draft.startAt, draft.endAt, draft.perUserLimit, draft.redeemLimit, draft.conditions.join(" AND "), bundle?.name || draft.title, item?.item_id || "", item?.name || "", item?.amount ?? "", item?.chance ?? ""]);
}

export function createItemCodeRequestXlsx(draft: ItemCodeRequestDraft) { return createSimpleXlsx(headers, itemCodeRequestRows(draft), "Item Code Request"); }

export function downloadItemCodeRequestXlsx(draft: ItemCodeRequestDraft, filename: string) {
  const blob = new Blob([createItemCodeRequestXlsx(draft)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
