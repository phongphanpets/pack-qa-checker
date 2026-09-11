import type { PackFormDocument } from "@/components/PackForm";
import type { SpecBundle } from "@/lib/website-ocr";

export type ExcelPasteWarning = {
  code: "GENERATED_BUNDLE_ID" | "DATE_WITHOUT_YEAR" | "UNSUPPORTED_LAYOUT" | "INVALID_ITEM";
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
    playerExp: number | null;
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
  secretChanceValue?: number | null;
};

export function parseExcelPaste(input: string): ExcelPasteResult {
  const rows = table(input);
  const ambiguous = rows.some((row) =>
    row.filter((cell) => itemIdHeaders.map(normalize).includes(normalize(cell.value))).length > 1 ||
    row.filter((cell) => amountHeaders.map(normalize).includes(normalize(cell.value))).length > 1 ||
    row.filter((cell) => chanceHeaders.map(normalize).includes(normalize(cell.value))).length > 1);
  if (ambiguous) return { document: { bundles: [] }, bundles: [], valid: false, summary: emptySection().summary,
    warnings: [{ code: "UNSUPPORTED_LAYOUT", message: "พบหลายชุดข้อมูลในแนวนอน หรือหลายคอลัมน์จำนวน/เรท กรุณาแยกทีละวัน ทีละ Tier หรือ Paid/Free ก่อนแปลง เพื่อไม่ให้รายการตกหล่น" }] };
  const headerRows = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        findColumn(row, itemIdHeaders) >= 0 &&
        findColumn(row, itemNameHeaders) >= 0 &&
        findColumn(row, amountHeaders) >= 0,
    )
    .map(({ index }) => index);
  const sections = headerRows.map((headerRow, index) => {
    const nextHeader = headerRows[index + 1] ?? rows.length;
    const start = sectionStart(rows, headerRow, index === 0 ? 0 : headerRows[index - 1] + 1);
    const end = sectionEnd(rows, headerRow, nextHeader);
    return parseBundleSection(rows.slice(start, end), input, headerRow - start);
  });
  if (!sections.length) sections.push(parseBareItemSection(rows, input));
  const primary = sections[0] || emptySection();

  return {
    document: { bundles: sections.flatMap((section) => section.documentBundle ? [section.documentBundle] : []) },
    bundles: sections.flatMap((section) => section.bundle ? [section.bundle] : []),
    valid: sections.length > 0 && sections.every((section) => section.valid),
    warnings: sections.flatMap((section) => section.warnings),
    summary: primary.summary,
  };
}

function parseBareItemSection(rows: Cell[][], originalInput: string) {
  const items: ParsedItem[] = [];
  const itemWarnings: ExcelPasteWarning[] = [];
  for (const row of rows) {
    for (let index = 0; index <= row.length - 2; index += 1) {
      const [itemId, name, amount] = row.slice(index, index + 3);
      const amountValue = integer(amount?.value);
      if (looksLikeItemId(itemId?.value) && looksLikeItemName(name?.value) && amountValue === null) {
        itemWarnings.push({ code: "INVALID_ITEM", message: `แถว ${itemId.row}: จำนวนของ ${clean(name.value)} ไม่ถูกต้อง กรุณาตรวจต้นทาง` });
        break;
      }
      if (!looksLikeItemId(itemId?.value) || !looksLikeItemName(name?.value) || amountValue === null) continue;
      items.push({ itemId, name, amount, amountValue, chance: null, chanceValue: null });
      break;
    }
  }
  if (!items.length) return { ...emptySection(), warnings: itemWarnings };

  const name = clean(valueAfterLabel(rows, bundleNameLabels)?.value) || "Untitled Bundle";
  const bundleId = deterministicBundleId(originalInput + "\n" + name + "\nbare-item-list");
  const warnings: ExcelPasteWarning[] = [{
    code: "GENERATED_BUNDLE_ID",
    message: "ไม่พบหัวตารางหรือชื่อ Bundle ระบบอ่านรายการ Item ID / Name / Amt ได้แล้ว แต่ควรตั้งชื่อ Bundle ก่อน Export",
  }, ...itemWarnings];
  const documentItems = items.map((item) => ({
    item_id: field(item.itemId, clean(item.itemId.value)),
    name: field(item.name, clean(item.name.value)),
    amount: field(item.amount, item.amountValue),
  }));
  const documentBundle = {
    bundle_id: bundleId,
    spec: {
      bundle_id: { value: bundleId, source: "spec", confidence: 1, raw_text: "generated from bare item list", locator: "excel-paste:generated-bundle-id" },
      name: { value: name, source: "spec", confidence: 1, raw_text: name, locator: "excel-paste:generated-bundle-name" },
      is_gacha: false,
      items: documentItems,
    },
  };
  const bundle: SpecBundle = {
    bundle_id: bundleId,
    name,
    seed_point: null,
    gsp_earn: null,
    purchase_limit: null,
    is_gacha: false,
    is_permanent: false,
    items: items.map((item) => ({ item_id: clean(item.itemId.value), name: clean(item.name.value), amount: item.amountValue, chance: null })),
  };
  return {
    documentBundle,
    bundle,
    valid: itemWarnings.length === 0,
    warnings,
    summary: {
      bundleId,
      generatedBundleId: true,
      name,
      itemCount: items.length,
      seedPoint: null,
      gspEarn: null,
      purchaseLimit: null,
      isGacha: false,
      isPermanent: false,
      fixedItemCount: items.length,
      randomOutcomeCount: 0,
      chanceTotal: null,
    },
  };
}

function parseBundleSection(
  rows: Cell[][],
  originalInput: string,
  itemHeaderRow: number,
) {
  const warnings: ExcelPasteWarning[] = [];
  const nameCell = valueAfterLabel(rows, bundleNameLabels) || titleBeforeHeader(rows, itemHeaderRow);
  const seedPointCell = itemHeaderRow >= 0 ? valueBelowHeader(rows, itemHeaderRow, ["seed point", "seed_point"]) : null;
  const gspCell = itemHeaderRow >= 0 ? valueBelowHeader(rows, itemHeaderRow, ["gsp earn", "gsp", "gsp_earn"]) : null;
  const playerExpCell = itemHeaderRow >= 0 ? valueBelowHeader(rows, itemHeaderRow, ["exp rank earn", "player exp", "player experience", "exp"]) : null;
  const inlineLimitCell = valueAfterLabel(rows, purchaseLimitLabels);
  const limitCell =
    integer(inlineLimitCell?.value) !== null
      ? inlineLimitCell
      : valueAtLabelColumnOnNextRow(rows, purchaseLimitLabels);
  const resetCell = valueAfterLabel(rows, ["reset", "reset type", "reset_type"]) || valueAtLabelColumnOnNextRow(rows, ["reset", "reset type", "reset_type"]);
  const explicitBundleCell = valueAfterLabel(rows, bundleIdLabels) || valueAtLabelColumnOnNextRow(rows, bundleIdLabels);
  const items = itemHeaderRow >= 0 ? parseItems(rows, itemHeaderRow, warnings) : [];
  const randomItems = items.filter((item) => item.chanceValue !== null);
  const isGacha = randomItems.length > 0;
  const chanceTotal = isGacha ? randomItems.reduce((total, item) => total + (item.chanceValue || 0), 0) : null;
  const explicitBundleId = integer(explicitBundleCell?.value);
  // A three-column reward table is valid input even when its title is supplied
  // separately by the Request Hub. Keep it parseable so the UI can ask for a name.
  const name = clean(nameCell?.value) || (items.length ? "Untitled Bundle" : null);
  const generatedBundleId = explicitBundleId === null && Boolean(name && items.length);
  const bundleId = generatedBundleId ? deterministicBundleId(`${originalInput}\n${name}\n${itemHeaderRow}`) : explicitBundleId;
  if (generatedBundleId) warnings.push({ code: "GENERATED_BUNDLE_ID", message: `ไม่พบ bundle_id ของ ${name} ระบบสร้าง ID ชั่วคราวสำหรับการตรวจรอบนี้` });

  const startCell = valueAfterLabel(rows, ["start", "start date"]);
  const endCell = valueAfterLabel(rows, ["end", "end date"]);
  const startDate = normalizedDate(startCell?.value, true);
  const isPermanent = permanentLabel(endCell?.value);
  const endDate = normalizedDate(endCell?.value, true);
  if ([startCell, isPermanent ? null : endCell].some((cell) => cell && !containsFourDigitYear(cell.value))) {
    warnings.push({ code: "DATE_WITHOUT_YEAR", message: `วันที่ของ ${name} ไม่มีปี จึงยังไม่ใช้ตัดสินผล เพื่อป้องกันระบบเดาปีผิด` });
  }

  const seedPoint = decimal(seedPointCell?.value);
  const gspEarn = decimal(gspCell?.value);
  const playerExp = decimal(playerExpCell?.value);
  const purchaseLimit = integer(limitCell?.value);
  const valid = bundleId !== null && Boolean(name) && items.length > 0 && items.every((item) => Boolean(clean(item.itemId.value))) && !warnings.some(warning => warning.code === "INVALID_ITEM");
  const documentItems = items.map((item) => ({
    item_id: field(item.itemId, clean(item.itemId.value)),
    name: field(item.name, clean(item.name.value)),
    amount: field(item.amount, item.amountValue),
    ...(item.chance && item.chanceValue !== null ? { chance: field(item.chance, item.chanceValue) } : {}),
  }));
  const spec = compact({
    bundle_id: bundleId === null ? undefined : generatedBundleId ? { value: bundleId, source: "spec", confidence: 1, raw_text: "generated from pasted Excel block", locator: "excel-paste:generated-bundle-id" } : field(explicitBundleCell, bundleId),
    name: nameCell && name ? field(nameCell, name) : undefined,
    seed_point: seedPointCell && seedPoint !== null ? field(seedPointCell, seedPoint) : undefined,
    gsp_earn: gspCell && gspEarn !== null ? field(gspCell, gspEarn) : undefined,
    player_exp: playerExpCell && playerExp !== null ? field(playerExpCell, playerExp) : undefined,
    purchase_limit: limitCell && purchaseLimit !== null ? field(limitCell, purchaseLimit) : undefined,
    start_date: startCell && startDate ? field(startCell, startDate) : undefined,
    end_date: endCell && endDate ? field(endCell, endDate) : undefined,
    is_permanent: endCell && (isPermanent || endDate) ? field(endCell, isPermanent) : undefined,
    reset_type: resetCell && clean(resetCell.value) ? field(resetCell, clean(resetCell.value)) : undefined,
    is_gacha: isGacha,
    items: documentItems,
  });
  const documentBundle = bundleId === null ? null : {
    bundle_id: bundleId,
    spec,
    ...(isGacha ? { gacha: { bundle_id: field(explicitBundleCell, bundleId), is_gacha: true, items: randomItems.map((item) => ({ item_id: field(item.itemId, clean(item.itemId.value)), name: field(item.name, clean(item.name.value)), amount: field(item.amount, item.amountValue), chance: field(item.chance, item.chanceValue) })) } } : {}),
  };
  const bundle: SpecBundle | null = bundleId === null ? null : {
    bundle_id: bundleId, name, seed_point: seedPoint, gsp_earn: gspEarn, player_exp: playerExp, purchase_limit: purchaseLimit, is_gacha: isGacha, is_permanent: isPermanent,
    items: items.map((item) => ({ item_id: clean(item.itemId.value), name: clean(item.name.value), amount: item.amountValue, chance: item.chanceValue, ...(item.secretChanceValue !== undefined ? { secret_chance: item.secretChanceValue } : {}) })),
  };
  return { documentBundle, bundle, valid, warnings, summary: { bundleId, generatedBundleId, name, itemCount: items.length, seedPoint, gspEarn, playerExp, purchaseLimit, isGacha, isPermanent, fixedItemCount: items.length - randomItems.length, randomOutcomeCount: randomItems.length, chanceTotal } };
}

function emptySection() {
  return { documentBundle: null, bundle: null, valid: false, warnings: [], summary: { bundleId: null, generatedBundleId: false, name: null, itemCount: 0, seedPoint: null, gspEarn: null, playerExp: null, purchaseLimit: null, isGacha: false, isPermanent: false, fixedItemCount: 0, randomOutcomeCount: 0, chanceTotal: null } };
}

function sectionStart(rows: Cell[][], headerRow: number, fallback: number) {
  for (let index = headerRow - 1; index >= fallback; index -= 1) {
    if (findColumn(rows[index], bundleNameLabels) >= 0) {
      let start = index;
      while (start > fallback && rows[start - 1].some((cell) => Boolean(clean(cell.value)))) {
        start -= 1;
      }
      return start;
    }
  }
  return fallback;
}

function sectionEnd(rows: Cell[][], headerRow: number, nextHeader: number) {
  for (let index = headerRow + 1; index < nextHeader; index += 1) {
    if (findColumn(rows[index], bundleNameLabels) >= 0) return index;
  }
  return nextHeader;
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
  return rows
    .map((parsedRow) => {
      const joined = parsedRow.join("\t").trim();
      if (!joined.startsWith("|") || !joined.includes("|")) return parsedRow;
      return parseMarkdownRow(joined);
    })
    .filter((parsedRow) => !isMarkdownDivider(parsedRow));
}

function parseItems(rows: Cell[][], headerRow: number, warnings: ExcelPasteWarning[]): ParsedItem[] {
  const idColumn = findColumn(rows[headerRow], itemIdHeaders);
  const nameColumn = findColumn(rows[headerRow], itemNameHeaders);
  const amountColumn = findColumn(rows[headerRow], amountHeaders);
  const chanceColumn = findColumn(rows[headerRow], chanceHeaders);
  const secretChanceColumn = findColumn(rows[headerRow], ["secret chance", "secret_chance", "display chance", "เรทโชว์"]);
  const items: ParsedItem[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const directItemId = row[idColumn];
    const directName = row[nameColumn];
    const directAmount = row[amountColumn];
    const directLooksValid =
      looksLikeItemId(directItemId?.value) &&
      looksLikeItemName(directName?.value) &&
      integer(directAmount?.value) !== null;
    const detected = directLooksValid ? null : findShiftedItem(row);
    const itemId = detected?.itemId || directItemId;
    const name = detected?.name || directName;
    const amount = detected?.amount || directAmount;
    const offset = detected ? detected.itemId.column - idColumn - 1 : 0;
    const chance = chanceColumn >= 0 ? row[chanceColumn + offset] : null;
    const amountValue = integer(amount?.value);
    const chanceValue = decimal(chance?.value);
    if (!clean(itemId?.value) && looksLikeItemName(name?.value) && amountValue !== null) {
      warnings.push({ code: "INVALID_ITEM", message: `แถว ${name.row}: ไม่พบ Item ID ของ ${clean(name.value)} กรุณาตรวจต้นทาง` });
    }
    if (looksLikeItemId(itemId?.value) && looksLikeItemName(name?.value) && amountValue === null) {
      warnings.push({ code: "INVALID_ITEM", message: `แถว ${itemId.row}: จำนวนของ ${clean(name.value)} ไม่ถูกต้อง กรุณาตรวจต้นทาง` });
    }
    if (!itemId?.value && !name?.value && amountValue === null) continue;
    if (!itemId?.value || amountValue === null) continue;
    const secretChanceCell = secretChanceColumn >= 0 ? row[secretChanceColumn + offset] : null;
    if (clean(secretChanceCell?.value) && decimal(secretChanceCell?.value) === null) {
      warnings.push({ code: "INVALID_ITEM", message: `แถว ${itemId.row}: Secret Chance ของ ${clean(name?.value)} ไม่ใช่ตัวเลข` });
    }
    if (chanceColumn >= 0 && chanceValue === null && !/fixed|ได้ด้วยเสมอ/i.test(chance?.value || "")) {
      warnings.push({ code: "INVALID_ITEM", message: `แถว ${itemId.row}: Chance ของ ${clean(name?.value)} ว่างหรือไม่ใช่ตัวเลข ระบุ Fixed หากได้แน่นอน` });
    }
    items.push({
      itemId,
      name: name || blankCell(itemId.row, nameColumn + 1),
      amount,
      amountValue,
      chance,
      chanceValue,
      ...(secretChanceColumn >= 0 ? { secretChanceValue: decimal(row[secretChanceColumn + (detected ? detected.itemId.column - idColumn - 1 : 0)]?.value) } : {}),
    });
  }
  return items;
}

function findShiftedItem(row: Cell[]): {
  itemId: Cell;
  name: Cell;
  amount: Cell;
  chance: Cell | null;
} | null {
  for (let index = 0; index <= row.length - 3; index += 1) {
    const [itemId, name, amount] = row.slice(index, index + 3);
    if (
      looksLikeItemId(itemId?.value) &&
      looksLikeItemName(name?.value) &&
      integer(amount?.value) !== null
    ) {
      return { itemId, name, amount, chance: row[index + 3] || null };
    }
  }
  return null;
}

function looksLikeItemId(value: string | null | undefined): boolean {
  const normalized = clean(value);
  if (!normalized) return false;
  return (
    /^\d{4,}$/.test(normalized) ||
    /^(?:popo_[a-z]+_\d+|gold_cur|diamond_cur|currency|web only)$/i.test(
      normalized,
    )
  );
}

function looksLikeItemName(value: string | null | undefined): boolean {
  const normalized = clean(value);
  return Boolean(normalized && /[\p{L}]/u.test(normalized));
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

function titleBeforeHeader(rows: Cell[][], headerRow: number): Cell | null {
  if (headerRow <= 0) return null;
  for (let index = headerRow - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const filled = row.filter((cell) => Boolean(clean(cell.value)));
    if (filled.length !== 1) continue;
    const cell = filled[0];
    if (!bundleNameLabels.map(normalize).includes(normalize(cell.value))) {
      return cell;
    }
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
  const row = rows.slice(headerRow + 1).find(row => row.some(cell => clean(cell.value)));
  if (!row) return null;
  const idColumn = findColumn(rows[headerRow], itemIdHeaders);
  const nameColumn = findColumn(rows[headerRow], itemNameHeaders);
  const direct = looksLikeItemId(row[idColumn]?.value) && looksLikeItemName(row[nameColumn]?.value);
  const shifted = direct ? null : findShiftedItem(row);
  const offset = shifted ? shifted.itemId.column - idColumn - 1 : 0;
  const value = row[column + offset];
  return value && clean(value.value) ? value : null;
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
  const match = normalized?.match(/^(?:x|×)?\s*(-?\d+)$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
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
    .replace(/[_\s]+/g, " ")
    .replace(/[：:]/g, "")
    .trim();
}

const itemIdHeaders = [
  "item id",
  "item_id",
  "item code",
  "item_code",
  "id",
  "รหัสไอเท็ม",
];
const itemNameHeaders = [
  "item name",
  "item_name",
  "display name",
  "display_name",
  "ชื่อไอเท็ม",
];
const amountHeaders = ["amt", "amount", "qty", "quantity", "จำนวน"];
const chanceHeaders = [
  "chance",
  "rate",
  "%",
  "cost chance",
  "paid chance",
  "free chance",
  "random chance",
  "เรทสุ่ม",
  "อัตราสุ่ม",
];
const bundleNameLabels = [
  "product name",
  "bundle name",
  "pack name",
  "package name",
  "ชื่อแพ็ก",
  "ชื่อบันเดิ้ล",
];
const purchaseLimitLabels = [
  "limit (ครั้ง / id)",
  "limit",
  "purchase limit",
  "purchase_limit",
  "purchase limit per player",
  "per-player purchase limit",
  "จำกัดการซื้อต่อ player",
];
const bundleIdLabels = ["bundle id", "bundle_id", "package id", "pack id"];

function parseMarkdownRow(line: string): string[] {
  const content = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let value = "";
  let escaped = false;
  for (const character of content) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function isMarkdownDivider(row: string[]): boolean {
  return row.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
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
