import type Tesseract from "tesseract.js";

export type SpecItem = {
  item_id: string | null;
  name: string | null;
  amount: number | null;
  chance?: number | null;
};

export type SpecBundle = {
  bundle_id: number;
  name: string | null;
  seed_point: number | null;
  gsp_earn: number | null;
  purchase_limit: number | null;
  is_gacha?: boolean;
  is_permanent?: boolean;
  items: SpecItem[];
};

export type ObservedField = {
  value: string | number | null;
  confidence: number;
  raw_text: string | null;
  locator: string;
  human_confirmed: boolean;
};

export type WebsiteObservationDraft = {
  name: ObservedField;
  seed_point: ObservedField;
  gsp_earn: ObservedField;
  purchase_limit: ObservedField;
  items: Array<{
    name: ObservedField;
    amount: ObservedField;
    chance: ObservedField;
  }>;
};

export type ReviewFieldStatus = "match" | "mismatch" | "review";

export type OcrBand = {
  top: number;
  bottom: number;
  text: string;
  confidence: number;
  numericValue?: number;
  numericConfidence?: number;
  numericRawText?: string;
  chanceValue?: number;
  chanceConfidence?: number;
  chanceRawText?: string;
};

export async function createLocalOcrWorker(
  onProgress: (progress: number) => void,
): Promise<Tesseract.Worker> {
  const { createWorker, OEM } = await import("tesseract.js");
  return createWorker(["eng", "tha"], OEM.LSTM_ONLY, {
    workerPath: "/ocr/worker.min.js",
    langPath: "/ocr/lang",
    corePath: "/ocr/core",
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress(message.progress);
      }
    },
  });
}

export async function recognizeWebsiteScreenshot(
  file: File,
  spec: SpecBundle,
  worker: Tesseract.Worker,
): Promise<WebsiteObservationDraft> {
  const bitmap = await createImageBitmap(file);
  try {
    const bands = detectLightBands(bitmap);
    const heroBand =
      bands.find(
        (band) => band.bottom - band.top > bitmap.height * 0.18,
      ) || { top: 0, bottom: Math.round(bitmap.height * 0.4) };
    const rowBands = bands.filter((band) => {
      const height = band.bottom - band.top;
      return (
        height >= bitmap.height * 0.025 &&
        height <= bitmap.height * 0.1 &&
        band.top > bitmap.height * 0.35
      );
    });

    await worker.setParameters({
      tessedit_pageseg_mode: "11" as Tesseract.PSM,
      preserve_interword_spaces: "1",
    });
    const heroCanvas = cropCanvas(bitmap, {
      left: 0,
      top: Math.max(0, heroBand.top - 4),
      width: Math.round(bitmap.width * 0.66),
      height: Math.min(
        bitmap.height - heroBand.top,
        heroBand.bottom - heroBand.top + 8,
      ),
    });
    const heroResult = await worker.recognize(heroCanvas);
    const heroText = cleanText(heroResult.data.text);
    const heroConfidence = probability(heroResult.data.confidence);

    await worker.setParameters({
      tessedit_pageseg_mode: "7" as Tesseract.PSM,
      preserve_interword_spaces: "1",
    });
    const recognizedBands: OcrBand[] = [];
    for (const band of rowBands) {
      const crop = {
        left: Math.round(bitmap.width * 0.035),
        top: Math.max(0, band.top - 4),
        width: Math.round(bitmap.width * 0.615),
        height: Math.min(
          bitmap.height - band.top,
          band.bottom - band.top + 8,
        ),
      };
      const result = await worker.recognize(
        cropCanvas(bitmap, crop),
      );
      let candidate: OcrBand = {
        ...band,
        text: cleanText(result.data.text),
        confidence: probability(result.data.confidence),
      };

      if (
        candidate.confidence < 0.8 ||
        !candidate.text
      ) {
        // The broad crop is useful for finding the row, but large item icons
        // and the search icon can confuse Tesseract. Retry the same row with
        // only the text/amount area before applying the harsher threshold pass.
        const focusedCrop = {
          left: Math.round(bitmap.width * 0.071),
          top: crop.top,
          width: Math.round(bitmap.width * 0.548),
          height: crop.height,
        };
        // Keep Thai enabled here. The old Latin-only whitelist made otherwise
        // readable Thai item names disappear during the focused retry.
        await worker.setParameters({
          tessedit_char_whitelist: "",
        });
        const focused = await worker.recognize(
          cropCanvas(bitmap, focusedCrop),
        );
        const focusedCandidate: OcrBand = {
          ...band,
          text: cleanText(focused.data.text),
          confidence: probability(focused.data.confidence),
        };
        if (
          bandCandidateScore(focusedCandidate, spec) >
          bandCandidateScore(candidate, spec)
        ) {
          candidate = focusedCandidate;
        }

        await worker.setParameters({
          tessedit_pageseg_mode: "13" as Tesseract.PSM,
          preserve_interword_spaces: "1",
          tessedit_char_whitelist: "",
        });
        const retry = await worker.recognize(
          cropCanvas(bitmap, crop, "threshold"),
        );
        const retryCandidate: OcrBand = {
          ...band,
          text: cleanText(retry.data.text),
          confidence: probability(retry.data.confidence),
        };
        if (
          bandCandidateScore(retryCandidate, spec) >
          bandCandidateScore(candidate, spec)
        ) {
          candidate = retryCandidate;
        }
        await worker.setParameters({
          tessedit_pageseg_mode: "7" as Tesseract.PSM,
          preserve_interword_spaces: "1",
        });
      }

      if (
        normalizeForMatch(candidate.text).includes(
          "goldenseedpoint",
        )
      ) {
        const numeric = await recognizeNumericDigits(
          bitmap,
          band,
          worker,
          "GSP",
        );
        if (numeric.value !== null) {
          candidate = {
            ...candidate,
            numericValue: numeric.value,
            numericConfidence: numeric.confidence,
            numericRawText: numeric.rawText,
          };
        }
      }
      recognizedBands.push(candidate);
    }

    // First identify rows from their names, then read the small numeric zones
    // independently. This avoids relying on the broad OCR pass seeing an `x`.
    const itemBandIndexes = matchItemBandIndexes(spec, recognizedBands);
    for (let itemIndex = 0; itemIndex < spec.items.length; itemIndex += 1) {
      const bandIndex = itemBandIndexes[itemIndex];
      if (bandIndex === null) continue;
      const band = recognizedBands[bandIndex];

      const amount = await recognizeRowAmount(bitmap, band, worker);
      if (amount.value !== null) {
        Object.assign(band, {
          numericValue: amount.value,
          numericConfidence: amount.confidence,
          numericRawText: amount.rawText,
        });
      }

      if (spec.items[itemIndex].chance !== null && spec.items[itemIndex].chance !== undefined) {
        const chance = await recognizeRowChance(bitmap, band, worker);
        if (chance.value !== null) {
          Object.assign(band, {
            chanceValue: chance.value,
            chanceConfidence: chance.confidence,
            chanceRawText: chance.rawText,
          });
        }
      }
    }

    return structureObservation(
      file.name,
      spec,
      heroText,
      heroConfidence,
      recognizedBands,
    );
  } finally {
    bitmap.close();
  }
}

export function structureObservation(
  fileName: string,
  spec: SpecBundle,
  heroText: string,
  heroConfidence: number,
  bands: OcrBand[],
): WebsiteObservationDraft {
  const nameSimilarity = itemNameSimilarity(spec.name || "", heroText);
  const nameMatches = nameSimilarity >= 0.72;
  const seedMatch = heroText.match(/(\d[\d,]*)\s*SP\b/i);

  const limitBand = bands.find(
    (band) =>
      /\bID\b/i.test(band.text) ||
      normalizeForMatch(band.text).includes("จำกัดการซื้อ"),
  );
  const bonusBand = bands.find((band) =>
    normalizeForMatch(band.text).includes("goldenseedpoint"),
  );
  const gspValue = bonusBand
    ? bonusBand.numericValue ?? multiplier(bonusBand.text)
    : null;

  const locator = (part: string) =>
    `website-image:${fileName}#${part}`;

  const itemBandIndexes = matchItemBandIndexes(spec, bands);
  const items = spec.items.map((item, itemIndex) => {
    const bandIndex = itemBandIndexes[itemIndex];
    const band = bandIndex !== null ? bands[bandIndex] : undefined;
    const amount = band
      ? band.numericValue ?? multiplier(band.text)
      : null;
    const chance = band
      ? band.chanceValue ?? percentage(band.text)
      : null;
    const matchConfidence = band
      ? itemNameSimilarity(item.name || "", band.text)
      : 0;
    return {
      name: observed(
        band ? item.name : null,
        Math.min(band?.confidence || 0, matchConfidence),
        band?.text || null,
        locator(
          band
            ? `item-${item.item_id || item.name}-${band.top}-${band.bottom}`
            : `item-${item.item_id || item.name}-unreadable`,
        ),
      ),
      amount: observed(
        amount,
        band?.numericConfidence ?? band?.confidence ?? 0,
        band
          ? [band.text, band.numericRawText].filter(Boolean).join(" | ")
          : null,
        locator(
          band
            ? `item-${item.item_id || item.name}-${band.top}-${band.bottom}`
            : `item-${item.item_id || item.name}-unreadable`,
        ),
      ),
      chance: observed(
        chance,
        band?.chanceConfidence ?? band?.confidence ?? 0,
        band
          ? [band.text, band.chanceRawText].filter(Boolean).join(" | ")
          : null,
        locator(
          band
            ? `chance-${item.item_id || item.name}-${band.top}-${band.bottom}`
            : `chance-${item.item_id || item.name}-unreadable`,
        ),
      ),
    };
  });

  return {
    name: observed(
      nameMatches ? spec.name : null,
      nameMatches ? heroConfidence * nameSimilarity : 0,
      heroText || null,
      locator("name"),
    ),
    seed_point: observed(
      seedMatch ? integer(seedMatch[1]) : null,
      seedMatch ? heroConfidence : 0,
      heroText || null,
      locator("price"),
    ),
    gsp_earn: observed(
      gspValue,
      bonusBand?.numericConfidence ??
        bonusBand?.confidence ??
        0,
      bonusBand
        ? [
            bonusBand.text,
            bonusBand.numericRawText,
          ]
            .filter(Boolean)
            .join(" | ")
        : null,
      locator(
        bonusBand
          ? `gsp-${bonusBand.top}-${bonusBand.bottom}`
          : "gsp-unreadable",
      ),
    ),
    purchase_limit: observed(
      limitBand ? rightmostInteger(limitBand.text) : null,
      limitBand?.confidence || 0,
      limitBand?.text || null,
      locator(
        limitBand
          ? `purchase-limit-${limitBand.top}-${limitBand.bottom}`
          : "purchase-limit-unreadable",
      ),
    ),
    items,
  };
}

export function confirmField(
  field: ObservedField,
  value: string,
): ObservedField {
  const isBlank = value.trim() === "";
  return {
    ...field,
    value: isBlank ? null : value,
    confidence: 1,
    locator: humanConfirmedLocator(field.locator),
    human_confirmed: true,
  };
}

export function confirmObservedField(
  field: ObservedField,
): ObservedField {
  if (field.value === null) return field;
  return {
    ...field,
    confidence: 1,
    locator: humanConfirmedLocator(field.locator),
    human_confirmed: true,
  };
}

export function attestFieldMatchesSpec(
  field: ObservedField,
  expected: string | number | null,
): ObservedField {
  if (expected === null) return field;
  if (field.value === null) {
    return confirmField(field, String(expected));
  }
  if (comparable(field.value) !== comparable(expected)) {
    return field;
  }
  return confirmObservedField(field);
}

export function attestObservationMatchesSpec(
  observation: WebsiteObservationDraft,
  spec: SpecBundle,
): WebsiteObservationDraft {
  const attested = (
    field: ObservedField,
    value: string | number | null,
  ): ObservedField => {
    if (value === null || field.value !== null) return field;
    const evidence = `human confirmed image matches Spec: ${value}`;
    return {
      ...field,
      value,
      confidence: 1,
      raw_text: field.raw_text
        ? `${evidence} | OCR: ${field.raw_text}`
        : evidence,
      locator: humanConfirmedLocator(field.locator),
      human_confirmed: true,
    };
  };

  return {
    ...observation,
    name: attested(observation.name, spec.name),
    seed_point: attested(
      observation.seed_point,
      spec.seed_point,
    ),
    gsp_earn: attested(observation.gsp_earn, spec.gsp_earn),
    purchase_limit: attested(
      observation.purchase_limit,
      spec.purchase_limit,
    ),
    items: spec.items.map((item, index) => {
      const observedItem = observation.items[index] || {
        name: observed(
          null,
          0,
          null,
          `human-review:item-${item.item_id || index}`,
        ),
        amount: observed(
          null,
          0,
          null,
          `human-review:item-${item.item_id || index}`,
        ),
        chance: observed(
          null,
          0,
          null,
          `human-review:chance-${item.item_id || index}`,
        ),
      };
      return {
        name: attested(observedItem.name, item.name),
        amount: attested(observedItem.amount, item.amount),
        chance: attested(observedItem.chance, item.chance ?? null),
      };
    }),
  };
}

function humanConfirmedLocator(locator: string) {
  return locator.includes("human-confirmed")
    ? locator
    : `${locator}:human-confirmed`;
}

export function reviewFieldStatus(
  field: ObservedField,
  expected: string | number | null,
): ReviewFieldStatus {
  if (field.value === null || expected === null) return "review";
  if (field.human_confirmed && !field.locator.includes("#gsp")) {
    return "match";
  }
  if (!field.human_confirmed && field.confidence < 0.75) {
    return "review";
  }
  return comparable(field.value) === comparable(expected)
    ? "match"
    : "mismatch";
}

function observed(
  value: string | number | null,
  confidence: number,
  rawText: string | null,
  locator: string,
): ObservedField {
  return {
    value,
    confidence: clamp(confidence),
    raw_text: rawText,
    locator,
    human_confirmed: false,
  };
}

function detectLightBands(bitmap: ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) throw new Error("เปิดตัวอ่านภาพในเบราว์เซอร์ไม่ได้");
  context.drawImage(bitmap, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const xStart = Math.round(canvas.width * 0.03);
  const xEnd = Math.round(canvas.width * 0.65);
  const step = Math.max(2, Math.floor(canvas.width / 300));
  const active: boolean[] = [];

  for (let y = 0; y < canvas.height; y += 1) {
    let light = 0;
    let total = 0;
    for (let x = xStart; x < xEnd; x += step) {
      const index = (y * canvas.width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const spread =
        Math.max(red, green, blue) - Math.min(red, green, blue);
      if (
        red >= 230 &&
        red <= 250 &&
        green >= 230 &&
        green <= 250 &&
        blue >= 230 &&
        blue <= 250 &&
        spread < 7
      ) {
        light += 1;
      }
      total += 1;
    }
    active.push(light / Math.max(1, total) > 0.48);
  }

  const bands: Array<{ top: number; bottom: number }> = [];
  let start: number | null = null;
  [...active, false].forEach((isActive, y) => {
    if (isActive && start === null) start = y;
    if (!isActive && start !== null) {
      if (y - start >= 10) {
        bands.push({ top: start, bottom: y - 1 });
      }
      start = null;
    }
  });
  return bands;
}

function cropCanvas(
  bitmap: ImageBitmap,
  crop: { left: number; top: number; width: number; height: number },
  mode: "contrast" | "threshold" = "contrast",
) {
  const scale = mode === "threshold" ? 4 : 3;
  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("สร้างพื้นที่อ่านภาพไม่ได้");
  context.filter =
    mode === "threshold"
      ? "grayscale(1) contrast(1.2)"
      : "grayscale(1) contrast(1.45)";
  context.drawImage(
    bitmap,
    crop.left,
    crop.top,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (mode === "threshold") {
    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    for (let index = 0; index < pixels.data.length; index += 4) {
      const luminance =
        pixels.data[index] * 0.299 +
        pixels.data[index + 1] * 0.587 +
        pixels.data[index + 2] * 0.114;
      const value = luminance < 205 ? 0 : 255;
      pixels.data[index] = value;
      pixels.data[index + 1] = value;
      pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
  }
  return canvas;
}

export function matchItemBandIndexes(
  spec: SpecBundle,
  bands: OcrBand[],
): Array<number | null> {
  const used = new Set<number>();
  return spec.items.map((item) => {
    let bestIndex: number | null = null;
    let bestScore = 0;
    bands.forEach((band, index) => {
      if (used.has(index)) return;
      const score = itemNameSimilarity(item.name || "", band.text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex === null || bestScore < 0.56) return null;
    used.add(bestIndex);
    return bestIndex;
  });
}

export function itemNameSimilarity(expected: string, observed: string) {
  const expectedCompact = normalizeForMatch(expected);
  const observedCompact = normalizeForMatch(observed);
  if (!expectedCompact || !observedCompact) return 0;
  if (observedCompact.includes(expectedCompact)) return 1;

  const expectedTokens = matchTokens(expected);
  const observedTokens = matchTokens(observed);
  if (!expectedTokens.length || !observedTokens.length) return 0;

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const expectedToken of expectedTokens) {
    const weight = Math.max(2, expectedToken.length);
    totalWeight += weight;
    const best = Math.max(
      ...observedTokens.map((token) => tokenSimilarity(expectedToken, token)),
    );
    if (best >= 0.68) matchedWeight += weight * best;
  }
  return totalWeight ? matchedWeight / totalWeight : 0;
}

function matchTokens(value: string) {
  return cleanText(value)
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/\b(?:chance|amount|item|random)\b/gi, " ")
    .replace(/[xX]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function tokenSimilarity(first: string, second: string) {
  if (first === second) return 1;
  if (first.length >= 4 && (first.includes(second) || second.includes(first))) {
    return Math.min(first.length, second.length) / Math.max(first.length, second.length);
  }
  const distance = levenshtein(first, second);
  return 1 - distance / Math.max(first.length, second.length);
}

function levenshtein(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = previous[0];
    previous[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const above = previous[secondIndex];
      previous[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + 1,
        diagonal + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

async function recognizeRowAmount(
  bitmap: ImageBitmap,
  band: { top: number; bottom: number },
  worker: Tesseract.Worker,
) {
  return recognizeTargetedNumber(
    bitmap,
    band,
    worker,
    "amount",
    [
      { left: 0.54, width: 0.1, topRatio: 0, heightRatio: 1 },
      { left: 0.57, width: 0.07, topRatio: 0, heightRatio: 1 },
    ],
    false,
  );
}

async function recognizeRowChance(
  bitmap: ImageBitmap,
  band: { top: number; bottom: number },
  worker: Tesseract.Worker,
) {
  return recognizeTargetedNumber(
    bitmap,
    band,
    worker,
    "chance",
    [
      { left: 0.065, width: 0.28, topRatio: 0.32, heightRatio: 0.68 },
      { left: 0.08, width: 0.24, topRatio: 0.3, heightRatio: 0.7 },
    ],
    true,
  );
}

async function recognizeTargetedNumber(
  bitmap: ImageBitmap,
  band: { top: number; bottom: number },
  worker: Tesseract.Worker,
  label: string,
  windows: Array<{ left: number; width: number; topRatio: number; heightRatio: number }>,
  decimal: boolean,
) {
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as Tesseract.PSM,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: decimal ? "0123456789.%" : "0123456789xX",
  });
  const bandHeight = Math.max(1, band.bottom - band.top);
  const readings: Array<[string, string]> = [];
  for (const window of windows) {
    const top = Math.max(0, Math.round(band.top + bandHeight * window.topRatio) - 3);
    const crop = {
      left: Math.round(bitmap.width * window.left),
      top,
      width: Math.round(bitmap.width * window.width),
      height: Math.min(
        bitmap.height - top,
        Math.round(bandHeight * window.heightRatio) + 6,
      ),
    };
    const contrast = await worker.recognize(cropCanvas(bitmap, crop));
    const threshold = await worker.recognize(cropCanvas(bitmap, crop, "threshold"));
    readings.push([cleanText(contrast.data.text), cleanText(threshold.data.text)]);
  }
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as Tesseract.PSM,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "",
  });

  const value = decimal
    ? bestDecimalConsensus(readings)
    : bestNumericConsensus(readings);
  return {
    value,
    confidence: value === null ? 0 : 0.9,
    rawText: `${label} digit windows: ${readings
      .map(([first, second]) => `${first || "unreadable"}/${second || "unreadable"}`)
      .join(" ; ")}`,
  };
}

export function bestDecimalConsensus(readings: Array<[string, string]>) {
  const candidates = readings
    .map(([first, second]) => decimalConsensus(first, second))
    .filter((value): value is number => value !== null);
  return candidates.length && new Set(candidates).size === 1 ? candidates[0] : null;
}

export function decimalConsensus(first: string, second: string) {
  const firstValue = rightmostDecimal(first);
  const secondValue = rightmostDecimal(second);
  return firstValue !== null && firstValue === secondValue ? firstValue : null;
}

async function recognizeNumericDigits(
  bitmap: ImageBitmap,
  band: { top: number; bottom: number },
  worker: Tesseract.Worker,
  label: string,
) {
  const cropWindows = [
    { left: 0.54, width: 0.09 },
    { left: 0.56, width: 0.07 },
    { left: 0.575, width: 0.06 },
  ];
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as Tesseract.PSM,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "0123456789",
  });
  const readings: Array<[string, string]> = [];
  for (const window of cropWindows) {
    const crop = {
      left: Math.round(bitmap.width * window.left),
      top: Math.max(0, band.top - 4),
      width: Math.round(bitmap.width * window.width),
      height: Math.min(
        bitmap.height - band.top,
        band.bottom - band.top + 8,
      ),
    };
    const contrast = await worker.recognize(
      cropCanvas(bitmap, crop),
    );
    const threshold = await worker.recognize(
      cropCanvas(bitmap, crop, "threshold"),
    );
    readings.push([
      cleanText(contrast.data.text),
      cleanText(threshold.data.text),
    ]);
  }
  await worker.setParameters({
    tessedit_pageseg_mode: "7" as Tesseract.PSM,
    preserve_interword_spaces: "1",
    tessedit_char_whitelist: "",
  });

  const value = bestNumericConsensus(readings);
  return {
    value,
    confidence: value === null ? 0 : 0.9,
    rawText: `${label} digit windows: ${readings
      .map(
        ([contrast, threshold]) =>
          `${contrast || "unreadable"}/${threshold || "unreadable"}`,
      )
      .join(" ; ")}`,
  };
}

export function bestNumericConsensus(
  readings: Array<[string, string]>,
): number | null {
  const candidates = readings
    .map(([first, second]) => numericConsensus(first, second))
    .filter((value): value is number => value !== null);
  if (!candidates.length) return null;

  const longestLength = Math.max(
    ...candidates.map((value) => String(Math.abs(value)).length),
  );
  const longest = candidates.filter(
    (value) => String(Math.abs(value)).length === longestLength,
  );
  return new Set(longest).size === 1 ? longest[0] : null;
}

export function numericConsensus(
  first: string,
  second: string,
): number | null {
  const firstValue = rightmostInteger(first);
  const secondValue = rightmostInteger(second);
  return firstValue !== null && firstValue === secondValue
    ? firstValue
    : null;
}

function bandCandidateScore(band: OcrBand, spec: SpecBundle) {
  const normalized = normalizeForMatch(band.text);
  let score = band.confidence;
  if (multiplier(band.text) !== null) score += 0.2;
  const bestItemSimilarity = Math.max(
    0,
    ...spec.items.map((item) => itemNameSimilarity(item.name || "", band.text)),
  );
  score += bestItemSimilarity * 0.5;
  if (
    normalized.includes("goldenseedpoint") ||
    /\bID\b/i.test(band.text)
  ) {
    score += 0.25;
  }
  return score;
}

function normalizeForMatch(value: string) {
  return cleanText(value)
    .normalize("NFC")
    .replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, "$1")
    .replace(/[\s:()[\]{}%_-]+/g, "")
    .toLocaleLowerCase();
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function comparable(value: string | number) {
  const normalized = String(value).replaceAll(",", "").trim();
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return `number:${Number(normalized)}`;
  }
  return `text:${normalized
    .replace(/\s+/g, " ")
    .toLocaleLowerCase()}`;
}

function multiplier(value: string): number | null {
  const matches = [
    ...value.matchAll(/[xX×%]\s*(\d[\d,]*)/g),
  ];
  return matches.length ? integer(matches[matches.length - 1][1]) : null;
}

function percentage(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number.parseFloat(match[1]) : null;
}

function rightmostDecimal(value: string): number | null {
  const matches = [...value.matchAll(/\d+(?:\.\d+)?/g)];
  return matches.length ? Number.parseFloat(matches[matches.length - 1][0]) : null;
}

function rightmostInteger(value: string): number | null {
  const matches = [...value.matchAll(/\d[\d,]*/g)];
  return matches.length ? integer(matches[matches.length - 1][0]) : null;
}

function integer(value: string) {
  return Number.parseInt(value.replaceAll(",", ""), 10);
}

function probability(value: number) {
  return clamp(value / 100);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
