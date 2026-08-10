import type { PackFormDocument } from "@/components/PackForm";
import type { SpecBundle } from "@/lib/website-ocr";

export type ExcelPasteWarning = {
  code: "GENERATED_BUNDLE_ID" | "DATE_WITHOUT_YEAR";
  message: string;
};

export type ExcelPasteResult = {
  document: PackFormDocument;
  bundles: SpecBundle[];
  valid: boolean;
  warnings: ExcelPasteWarning[];
  summary: {
    bundleId: number | null;
    generatedBundleId: boolean;
    name: string | null;
    itemCount: number;
    seedPoint: number | null;
    gspEarn: number | null;
    purchaseLimit: number | null;
    isGacha: boolean;
    isPermanent: boolean;
    fixedItemCount: number;
    randomOutcomeCount: number;
    chanceTotal: number | null;
  };
};

export type AdminPasteResult = {
  admin: Record<string, unknown> | null;
  valid: boolean;
  summary: {
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    startRaw: string | null;
    endRaw: string | null;
    isPermanent: boolean | null;
  };
};

type Cell = {
  value: string;
  row: number;
  column: number;
};

type ParsedItem = {
  itemId: Cell;
  name: Cell;
  amount: Cell;
  amountValue: number;
  chance: Cell | null;
  chanceValue: number | null;
};

export function parseExcelPaste(input: string): ExcelPasteResult {
  const rows = table(input);
  const warnings: ExcelPasteWarning[] = [];
  const itemHeaderRow = rows.findIndex(
    (row) =>
      findColumn(row, ["item id", "item_id"]) >= 0 &&
      findColumn(row, ["item name", "item_name"]) >= 0 &&
      findColumn(row, ["amt", "amount"]) >= 0,
  );

  const nameCell = valueAfterLabel(rows, [
    "product name",
    "pack name",
    "ชื่อแพ็ก",
  ]);
  const seedPointCell =
    itemHeaderRow >= 0
      ? valueBelowHeader(rows, itemHeaderRow, [
          "seed point",
          "seed_point",
        ])
      : null;
  const gspCell =
    itemHeaderRow >= 0
      ? valueBelowHeader(rows, itemHeaderRow, [
          "gsp earn",
          "gsp",
          "gsp_earn",
        ])
      : null;
  const limitCell = valueAtLabelColumnOnNextRow(rows, [
    "limit (ครั้ง / id)",
    "limit",
    "purchase limit",
    "purchase_limit",
  ]);
  const resetCell =
    valueAfterLabel(rows, ["reset", "reset type", "reset_type"]) ||
    valueAtLabelColumnOnNextRow(rows, [
      "reset",
      "reset type",
      "reset_type",
    ]);
  const explicitBundleCell =
    valueAfterLabel(rows, [
      "bundle id",
      "bundle_id",
      "package id",
      "pack id",
    ]) ||
    valueAtLabelColumnOnNextRow(rows, [
      "bundle id",
      "bundle_id",
      "package id",
      "pack id",
    ]);

  const items =
    itemHeaderRow >= 0 ? parseItems(rows, itemHeaderRow) : [];
  const randomItems = items.filter((item) => item.chanceValue !== null);
  const isGacha = randomItems.length > 0;
  const chanceTotal = isGacha
    ? randomItems.reduce((total, item) => total + (item.chanceValue || 0), 0)
    : null;
  const explicitBundleId = integer(explicitBundleCell?.value);
  const generatedBundleId =
    explicitBundleId === null && Boolean(nameCell?.value && items.length);
  const bundleId = generatedBundleId
    ? deterministicBundleId(input)
    : explicitBundleId;

  if (generatedBundleId) {
    warnings.push({
      code: "GENERATED_BUNDLE_ID",
      message:
        "ไม่พบ bundle_id ในช่วงที่ก๊อบ ระบบสร้าง ID ชั่วคราวสำหรับการตรวจรอบนี้",
    });
  }

  const startCell = valueAfterLabel(rows, ["start", "start date"]);
  const endCell = valueAfterLabel(rows, ["end", "end date"]);
  const startDate = normalizedDate(startCell?.value, true);
  const isPermanent = permanentLabel(endCell?.value);
  const endDate = normalizedDate(endCell?.value, true);
  if (
    [startCell, isPermanent ? null : endCell].some(
      (cell) => cell && !containsFourDigitYear(cell.value),
    )
  ) {
    warnings.push({
      code: "DATE_WITHOUT_YEAR",
      message:
        "วันที่ไม่มีปีจึงยังไม่ใช้ตัดสินผล เพื่อป้องกันระบบเดาปีผิด",
    });
  }

  const name = clean(nameCell?.value);
  const seedPoint = integer(seedPointCell?.value);
  const gspEarn = integer(gspCell?.value);
  const purchaseLimit = integer(limitCell?.value);
  const valid =
    bundleId !== null &&
    Boolean(name) &&
    items.length > 0 &&
    items.every((item) => Boolean(clean(item.itemId.value)));

  const documentItems = items.map((item) => ({
    item_id: field(item.itemId, clean(item.itemId.value)),
    name: field(item.name, clean(item.name.value)),
    amount: field(item.amount, item.amountValue),
    ...(item.chance && item.chanceValue !== null
      ? { chance: field(item.chance, item.chanceValue) }
      : {}),
  }));

  const spec = compact({
    bundle_id:
      bundleId === null
        ? undefined
        : generatedBundleId
          ? {
              value: bundleId,
              source: "spec",
              confidence: 1,
              raw_text: "generated from pasted Excel block",
              locator: "excel-paste:generated-bundle-id",
            }
          : field(explicitBundleCell, bundleId),
    name: nameCell && name ? field(nameCell, name) : undefined,
    seed_point:
      seedPointCell && seedPoint !== null
        ? field(seedPointCell, seedPoint)
        : undefined,
    gsp_earn:
      gspCell && gspEarn !== null
        ? field(gspCell, gspEarn)
        : undefined,
    purchase_limit:
      limitCell && purchaseLimit !== null
        ? field(limitCell, purchaseLimit)
        : undefined,
    start_date:
      startCell && startDate ? field(startCell, startDate) : undefined,
    end_date:
      endCell && endDate ? field(endCell, endDate) : undefined,
    is_permanent:
      endCell && (isPermanent || endDate)
        ? field(endCell, isPermanent)
        : undefined,
    reset_type:
      resetCell && clean(resetCell.value)
        ? field(resetCell, clean(resetCell.value))
        : undefined,
    is_gacha: isGacha,
    items: documentItems,
  });

  const document: PackFormDocument = {
    bundles:
      bundleId === null
        ? []
        : [
            {
              bundle_id: bundleId,
              spec,
              ...(isGacha
                ? {
                    gacha: {
                      bundle_id: field(
                        explicitBundleCell,
                        bundleId,
                      ),
                      is_gacha: true,
                      items: randomItems.map((item) => ({
                        item_id: field(
                          item.itemId,
                          clean(item.itemId.value),
                        ),
                        name: field(item.name, clean(item.name.value)),
                        amount: field(item.amount, item.amountValue),
                        chance: field(item.chance, item.chanceValue),
                      })),
                    },
                  }
                : {}),
            },
          ],
  };
  const bundles: SpecBundle[] =
    bundleId === null
      ? []
      : [
          {
            bundle_id: bundleId,
            name,
            seed_point: seedPoint,
            gsp_earn: gspEarn,
            purchase_limit: purchaseLimit,
            is_gacha: isGacha,
            is_permanent: isPermanent,
            items: items.map((item) => ({
              item_id: clean(item.itemId.value),
              name: clean(item.name.value),
              amount: item.amountValue,
              chance: item.chanceValue,
            })),
          },
        ];

  return {
    document,
    bundles,
    valid,
    warnings,
    summary: {
      bundleId,
      generatedBundleId,
      name,
      itemCount: items.length,
      seedPoint,
      gspEarn,
      purchaseLimit,
      isGacha,
      isPermanent,
      fixedItemCount: items.length - randomItems.length,
      randomOutcomeCount: randomItems.length,
      chanceTotal,
    },
  };
}

export function parseAdminPaste(input: string): AdminPasteResult {
  const rows = table(input);
  const nameCell = valueAfterLabel(rows, [
    "product name",
    "pack name",
    "package name",
    "name",
    "ชื่อแพ็ก",
  ]);
  const startCell = valueAfterLabel(rows, [
    "start",
    "start date",
    "sale start",
    "open",
    "open date",
  ]);
  const endCell = valueAfterLabel(rows, [
    "end",
    "end date",
    "sale end",
    "close",
    "close date",
  ]);
  const name = clean(nameCell?.value);
  const startDate = normalizedDate(startCell?.value);
  const endDate = normalizedDate(endCell?.value);
  const isPermanent =
    startDate && endDate
      ? isPermanentDateRange(startDate, endDate)
      : null;
  const valid = Boolean(name && startDate && endDate);

  return {
    admin: rows.length
      ? compact({
          name:
            nameCell && name
              ? adminField(nameCell, name)
              : undefined,
          start_date:
            startCell && startDate
              ? adminField(startCell, startDate)
              : undefined,
          end_date:
            endCell && endDate
              ? adminField(endCell, endDate)
              : undefined,
          is_permanent:
            startCell && endCell && isPermanent !== null
              ? adminPermanentField(
                  startCell,
                  endCell,
                  isPermanent,
                )
              : undefined,
        })
      : null,
    valid,
    summary: {
      name,
      startDate,
      endDate,
      startRaw: clean(startCell?.value),
      endRaw: clean(endCell?.value),
      isPermanent,
    },
  };
}

export function isPermanentDateRange(
  startDate: string,
  endDate: string,
) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const days = (end - start) / 86_400_000;
  return days >= 365 * 9;
}

export function attachAdminPaste(
  document: PackFormDocument,
  admin: AdminPasteResult,
): PackFormDocument {
  if (!admin.admin || !Object.keys(admin.admin).length) return document;
  return {
    bundles: document.bundles.map((bundle) => ({
      ...bundle,
      admin: admin.admin,
    })),
  };
}

function table(input: string): Cell[][] {
  return parseExcelTsv(input)
    .filter((row) => row.some((value) => value.trim()))
    .map((values, row) =>
      values.map((value, column) => ({
        value: clean(value) || "",
        row: row + 1,
        column: column + 1,
      })),
    );
}

function parseExcelTsv(input: string): string[][] {
  const text = input.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  const pushValue = () => {
    row.push(value);
    value = "";
  };
  const pushRow = () => {
    pushValue();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value === "") {
      quoted = true;
    } else if (character === "\t") {
      pushValue();
    } else if (character === "\n") {
      pushRow();
    } else {
      value += character;
    }
  }
  if (value || row.length) pushRow();
  return rows;
}

function parseItems(rows: Cell[][], headerRow: number): ParsedItem[] {
  const idColumn = findColumn(rows[headerRow], ["item id", "item_id"]);
  const nameColumn = findColumn(rows[headerRow], [
    "item name",
    "item_name",
  ]);
  const amountColumn = findColumn(rows[headerRow], ["amt", "amount"]);
  const chanceColumn = findColumn(rows[headerRow], ["chance", "rate", "%"]);
  const items: ParsedItem[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const itemId = row[idColumn];
    const name = row[nameColumn];
    const amount = row[amountColumn];
    const chance = chanceColumn >= 0 ? row[chanceColumn] : null;
    const amountValue = integer(amount?.value);
    const chanceValue = decimal(chance?.value);
    if (!itemId?.value && !name?.value && amountValue === null) continue;
    if (!itemId?.value || amountValue === null) continue;
    items.push({
      itemId,
      name: name || blankCell(itemId.row, nameColumn + 1),
      amount,
      amountValue,
      chance,
      chanceValue,
    });
  }
  return items;
}

function valueAfterLabel(
  rows: Cell[][],
  labels: string[],
): Cell | null {
  for (const row of rows) {
    const column = findColumn(row, labels);
    if (column < 0) continue;
    const value = row
      .slice(column + 1)
      .find((cell) => Boolean(clean(cell.value)));
    if (value) return value;
  }
  return null;
}

function valueAtLabelColumnOnNextRow(
  rows: Cell[][],
  labels: string[],
): Cell | null {
  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    const column = findColumn(rows[rowIndex], labels);
    if (column < 0) continue;
    const value = rows[rowIndex + 1][column];
    if (value && clean(value.value)) return value;
  }
  return null;
}

function valueBelowHeader(
  rows: Cell[][],
  headerRow: number,
  labels: string[],
): Cell | null {
  const column = findColumn(rows[headerRow], labels);
  if (column < 0) return null;
  for (const row of rows.slice(headerRow + 1)) {
    const value = row[column];
    if (value && clean(value.value)) return value;
  }
  return null;
}

function findColumn(row: Cell[], labels: string[]) {
  const normalizedLabels = labels.map(normalize);
  return row.findIndex((cell) =>
    normalizedLabels.includes(normalize(cell.value)),
  );
}

function field(cell: Cell | null | undefined, value: unknown) {
  return {
    value,
    source: "spec",
    confidence: 1,
    raw_text: cell?.value ?? String(value),
    locator: cell
      ? `excel-paste:R${cell.row}C${cell.column}`
      : "excel-paste:unknown",
  };
}

function adminField(cell: Cell, value: unknown) {
  return {
    value,
    source: "admin",
    confidence: 1,
    raw_text: cell.value,
    locator: `admin-paste:R${cell.row}C${cell.column}`,
  };
}

function adminPermanentField(
  startCell: Cell,
  endCell: Cell,
  value: boolean,
) {
  return {
    value,
    source: "admin",
    confidence: 1,
    raw_text: `${startCell.value} → ${endCell.value}`,
    locator: `admin-paste:R${startCell.row}C${startCell.column}-R${endCell.row}C${endCell.column}:derived-permanence`,
  };
}

function deterministicBundleId(input: string) {
  let hash = 2166136261;
  for (const character of input.trim()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 900_000_000 + ((hash >>> 0) % 99_999_999);
}

function integer(value: string | null | undefined): number | null {
  const normalized = clean(value)?.replaceAll(",", "");
  if (!normalized || !/^-?\d+$/.test(normalized)) return null;
  return Number.parseInt(normalized, 10);
}

function decimal(value: string | null | undefined): number | null {
  const normalized = clean(value)
    ?.replaceAll(",", "")
    .replace(/%$/, "")
    .trim();
  if (!normalized || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return null;
  }
  return Number.parseFloat(normalized);
}

function clean(value: string | null | undefined): string | null {
  const normalized = value
    ?.replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function permanentLabel(value: string | null | undefined) {
  const normalized = normalize(value || "");
  return [
    "ถาวร",
    "permanent",
    "no end",
    "no end date",
    "ไม่มีวันสิ้นสุด",
  ].includes(normalized);
}

function normalize(value: string) {
  return (clean(value) || "")
    .toLocaleLowerCase()
    .replace(/[_\s]+/g, " ");
}

function containsFourDigitYear(value: string) {
  return /\b(?:19|20)\d{2}\b/.test(value);
}

function normalizedDate(
  value: string | null | undefined,
  inferCurrentYear = false,
): string | null {
  const text = clean(value);
  if (!text) return null;
  if (!containsFourDigitYear(text) && !inferCurrentYear) return null;

  const iso = text.match(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;

  const slash = text.match(
    /\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})\b/,
  );
  if (slash) {
    return `${slash[3]}-${pad(slash[2])}-${pad(slash[1])}`;
  }

  const short = inferCurrentYear
    ? text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\b/)
    : null;
  if (short) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const month = months[short[2].slice(0, 3).toLowerCase()];
    if (month) return `${new Date().getFullYear()}-${month}-${pad(short[1])}`;
  }

  const parsed = new Date(text.replace(/\bน\.\s*$/u, "").trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return [
    parsed.getFullYear(),
    pad(String(parsed.getMonth() + 1)),
    pad(String(parsed.getDate())),
  ].join("-");
}

function pad(value: string) {
  return value.padStart(2, "0");
}

function blankCell(row: number, column: number): Cell {
  return { value: "", row, column };
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}
