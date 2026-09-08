import { createSimpleXlsx } from "./bundle-import-xlsx.ts";

export type ProductImportDraft = {
  name: string;
  category: string;
  displayOrder: string;
  saleStart: string;
  saleEnd: string;
  purchaseLimit: string;
  currency: string;
  actualPrice: string;
  fullPrice: string;
  bundleNames: string[];
};

const headers = [
  "เซิฟเวอร์เกม", "ชื่อสินค้า (ไทย)", "ชื่อสินค้า (อังกฤษ)", "หมวดหมู่", "Tag(s)",
  "รายละเอียด (ไทย)", "รายละเอียด (อังกฤษ)", "Thumbnail thai", "Banner thai", "Thumbnail en", "Banner en",
  "ลำดับการแสดง", "เวลาเริ่มขาย", "เวลาหยุดขาย", "จำกัดการซื้อต่อ Player", "Server", "Character", "Product",
  "promotion reset count", "last reset", "next reset", "active", "test mode", "hidden", "currency 1", "actual price", "full price",
  "currency 2", "actual price 2", "full price 2", "currency 3", "actual price 3", "full price 3", "Bundle Item 1 คำค้นหา",
];

export function productImportRows(draft: ProductImportDraft): Array<Array<string | number | null>> {
  return [[
    "GAME", draft.name, draft.name, draft.category, "", "", "", "", "", "", "",
    draft.displayOrder, draft.saleStart, draft.saleEnd, draft.purchaseLimit, "", "", "", "", "", "",
    "TRUE", "TRUE", "FALSE", draft.currency, draft.actualPrice, draft.fullPrice,
    "", "", "", "", "", "", draft.bundleNames.join(", "),
  ]];
}

export function createProductImportXlsx(draft: ProductImportDraft) {
  return createSimpleXlsx(headers, productImportRows(draft), "Products");
}

export function downloadProductImportXlsx(draft: ProductImportDraft, filename = "product-import.xlsx") {
  const blob = new Blob([createProductImportXlsx(draft)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
