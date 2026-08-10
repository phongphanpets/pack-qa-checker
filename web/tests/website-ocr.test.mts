import assert from "node:assert/strict";
import test from "node:test";

import {
  attestFieldMatchesSpec,
  attestObservationMatchesSpec,
  bestNumericConsensus,
  bestDecimalConsensus,
  confirmField,
  confirmObservedField,
  decimalConsensus,
  itemNameSimilarity,
  numericConsensus,
  reviewFieldStatus,
  structureObservation,
} from "../lib/website-ocr.ts";

test("matches reordered and slightly misspelled Website item names", () => {
  assert.ok(
    itemNameSimilarity(
      "Mount Summoning Stone : Blue Ribbon Snake (แลกเปลี่ยนได้)",
      "Blue Ribbon Snake - Mount Summoning Stone x1",
    ) >= 0.75,
  );
  assert.ok(
    itemNameSimilarity(
      "Mount Summoning Stone : Loxodon",
      "Mount Summoing Stone : Loxodon x1",
    ) >= 0.8,
  );
  assert.ok(
    itemNameSimilarity("Fellow Coin", "Mystic Savior Costume Box x1") < 0.56,
  );
});

test("uses independent amount and chance evidence on a fuzzy-matched row", () => {
  const randomSpec = {
    ...spec,
    is_gacha: true,
    items: [
      {
        item_id: "1517310",
        name: "Mystic Savior Diamond Costume Selection Box",
        amount: 1,
        chance: 0.1,
      },
    ],
  };
  const observation = structureObservation(
    "random.png",
    randomSpec,
    `${randomSpec.name} 590 SP`,
    0.95,
    [
      {
        top: 420,
        bottom: 470,
        text: "Mystic Savior Diamond Costume Box",
        confidence: 0.88,
        numericValue: 1,
        numericConfidence: 0.9,
        numericRawText: "amount digit windows: 1/1",
        chanceValue: 0.1,
        chanceConfidence: 0.9,
        chanceRawText: "chance digit windows: 0.1/0.1",
      },
    ],
  );

  assert.equal(observation.items[0].amount.value, 1);
  assert.equal(observation.items[0].amount.confidence, 0.9);
  assert.equal(observation.items[0].chance.value, 0.1);
  assert.equal(observation.items[0].chance.confidence, 0.9);
});

test("accepts decimal chance only when preprocessing passes agree", () => {
  assert.equal(decimalConsensus("0.1%", "0.1"), 0.1);
  assert.equal(decimalConsensus("0.1", "0.7"), null);
  assert.equal(
    bestDecimalConsensus([
      ["unreadable", ""],
      ["58.45%", "58.45"],
    ]),
    58.45,
  );
});

const spec = {
  bundle_id: 113711,
  name: "เสว Sun : จุ่มเจเนต (ลด 40 %)",
  seed_point: 590,
  gsp_earn: 590,
  purchase_limit: 10,
  items: [
    { item_id: "Web-Currency", name: "Fellow Coin", amount: 1 },
    { item_id: "1315001", name: "Fellow Ticket", amount: 1 },
    { item_id: "Currency", name: "Gold", amount: 10 },
  ],
};

test("structures the real Website screenshot OCR bands", () => {
  const observation = structureObservation(
    "003_image1070.png",
    spec,
    "จะจบใน : 103:07:00 เสว Sun : จุ่มเจเนต (ลด 40 %) 590 SP",
    0.92,
    [
      {
        top: 370,
        bottom: 402,
        text: "จำกัดการซื้อต่อ ID 10 ครั้ง",
        confidence: 0.93,
      },
      {
        top: 466,
        bottom: 499,
        text: "Gold x10",
        confidence: 0.95,
      },
      {
        top: 514,
        bottom: 546,
        text: "Fellow Ticket x1",
        confidence: 0.82,
      },
      {
        top: 610,
        bottom: 643,
        text: "Fellow Coin x1",
        confidence: 0.87,
      },
      {
        top: 694,
        bottom: 726,
        text: "Golden Seed Point x590",
        confidence: 0.84,
      },
    ],
  );

  assert.equal(observation.name.value, spec.name);
  assert.equal(observation.seed_point.value, 590);
  assert.equal(observation.gsp_earn.value, 590);
  assert.equal(observation.purchase_limit.value, 10);
  assert.deepEqual(
    observation.items.map((item) => item.amount.value),
    [1, 1, 10],
  );
  assert.ok(
    observation.items.every(
      (item) => item.name.locator.startsWith("website-image:"),
    ),
  );
});

test("leaves unreadable fields empty instead of copying Spec values", () => {
  const observation = structureObservation(
    "blurred.png",
    spec,
    "ข้อความอ่านไม่ออก",
    0.31,
    [],
  );

  assert.equal(observation.name.value, null);
  assert.equal(observation.seed_point.value, null);
  assert.equal(observation.gsp_earn.value, null);
  assert.equal(observation.purchase_limit.value, null);
  assert.ok(
    observation.items.every(
      (item) => item.name.value === null && item.amount.value === null,
    ),
  );
});

test("does not reuse one visible row for repeated random-pack outcomes", () => {
  const randomSpec = {
    ...spec,
    is_gacha: true,
    items: [
      { item_id: "10070", name: "Leticia Coin Ticket", amount: 2, chance: null },
      { item_id: "10070", name: "Leticia Coin Ticket", amount: 100, chance: 0.1 },
      { item_id: "10070", name: "Leticia Coin Ticket", amount: 1, chance: 58.45 },
      { item_id: "1517310", name: "Costume Box", amount: 1, chance: 0.1 },
    ],
  };
  const observation = structureObservation(
    "collapsed-random.png",
    randomSpec,
    "Leticia Random 690 SP",
    0.9,
    [
      {
        top: 400,
        bottom: 430,
        text: "Leticia Coin Ticket x2",
        confidence: 0.94,
      },
      {
        top: 440,
        bottom: 470,
        text: "Costume Box โอกาสได้รับ 0.1% x1",
        confidence: 0.91,
      },
    ],
  );

  assert.deepEqual(
    observation.items.map((item) => item.amount.value),
    [2, null, null, 1],
  );
  assert.equal(observation.items[3].chance.value, 0.1);
});

test("preserves spaces while a reviewer is typing", () => {
  const original = {
    value: "FellowCoin",
    confidence: 0.63,
    raw_text: "FellowCoin",
    locator: "website-image:test.png#item",
    human_confirmed: false,
  };

  const withSpace = confirmField(original, "Fellow ");

  assert.equal(withSpace.value, "Fellow ");
  assert.equal(withSpace.raw_text, "FellowCoin");
  assert.equal(withSpace.human_confirmed, true);
  assert.match(withSpace.locator, /human-confirmed$/);
});

test("records one-click Spec matching as explicit human evidence", () => {
  const unreadable = structureObservation(
    "blurred.png",
    spec,
    "",
    0,
    [],
  );

  const attested = attestObservationMatchesSpec(unreadable, spec);

  assert.equal(attested.name.value, spec.name);
  assert.equal(attested.seed_point.value, 590);
  assert.deepEqual(
    attested.items.map((item) => item.amount.value),
    [1, 1, 10],
  );
  assert.ok(attested.items.every((item) => item.amount.human_confirmed));
  assert.ok(
    attested.items.every((item) =>
      item.amount.locator.includes("human-confirmed"),
    ),
  );
  assert.match(
    attested.items[0].amount.raw_text || "",
    /human confirmed image matches Spec/,
  );
});

test("never turns a confident OCR conflict into a pass", () => {
  const gsp = {
    value: 500,
    confidence: 0.91,
    raw_text: "Golden Seed Point x500",
    locator: "website-image:test.png#gsp",
    human_confirmed: false,
  };

  assert.equal(reviewFieldStatus(gsp, 590), "mismatch");
  assert.equal(
    reviewFieldStatus(confirmObservedField(gsp), 590),
    "mismatch",
  );
});

test("requires human review for low-confidence values before matching", () => {
  const amount = {
    value: 10,
    confidence: 0.63,
    raw_text: "Gold x10",
    locator: "website-image:test.png#gold",
    human_confirmed: false,
  };

  assert.equal(reviewFieldStatus(amount, 10), "review");
  assert.equal(
    reviewFieldStatus(confirmObservedField(amount), 10),
    "match",
  );
});

test("bulk Spec attestation cannot overwrite an OCR conflict", () => {
  const observation = structureObservation(
    "gsp-conflict.png",
    spec,
    `${spec.name} 590 SP`,
    0.94,
    [
      {
        top: 700,
        bottom: 730,
        text: "Golden Seed Point x500",
        confidence: 0.91,
      },
    ],
  );

  const attested = attestObservationMatchesSpec(observation, spec);

  assert.equal(attested.gsp_earn.value, 500);
  assert.equal(attested.gsp_earn.human_confirmed, false);
  assert.equal(reviewFieldStatus(attested.gsp_earn, 590), "mismatch");
});

test("random table attestation fills blanks but preserves conflicts", () => {
  const blank = {
    value: null,
    confidence: 0,
    raw_text: null,
    locator: "website-image:random.png#chance-unreadable",
    human_confirmed: false,
  };
  const conflict = {
    value: 20,
    confidence: 0.92,
    raw_text: "โอกาสได้รับ 20%",
    locator: "website-image:random.png#chance",
    human_confirmed: false,
  };
  const lowConfidenceMatch = {
    value: 10,
    confidence: 0.55,
    raw_text: "โอกาสได้รับ 10%",
    locator: "website-image:random.png#chance-low",
    human_confirmed: false,
  };

  const filled = attestFieldMatchesSpec(blank, 10);
  const preserved = attestFieldMatchesSpec(conflict, 10);
  const confirmedMatch = attestFieldMatchesSpec(
    lowConfidenceMatch,
    10,
  );

  assert.equal(filled.value, "10");
  assert.equal(filled.human_confirmed, true);
  assert.equal(preserved.value, 20);
  assert.equal(preserved.human_confirmed, false);
  assert.equal(confirmedMatch.value, 10);
  assert.equal(confirmedMatch.human_confirmed, true);
});

test("accepts GSP digits only when both preprocessing passes agree", () => {
  assert.equal(numericConsensus("590", "590"), 590);
  assert.equal(numericConsensus("500", "590"), null);
  assert.equal(numericConsensus("", "590"), null);
});

test("prefers the complete overlapping GSP window without using Spec", () => {
  assert.equal(
    bestNumericConsensus([
      ["90", "90"],
      ["590", "590"],
      ["590", "590"],
    ]),
    590,
  );
  assert.equal(
    bestNumericConsensus([
      ["500", "500"],
      ["590", "590"],
    ]),
    null,
  );
});

test("uses numeric GSP consensus while preserving the broad OCR text", () => {
  const observation = structureObservation(
    "gsp-digit-consensus.png",
    spec,
    `${spec.name} 590 SP`,
    0.94,
    [
      {
        top: 700,
        bottom: 730,
        text: "Golden Seed Point x500",
        confidence: 0.86,
        numericValue: 590,
        numericConfidence: 0.9,
        numericRawText: "GSP digits: 590 / 590",
      },
    ],
  );

  assert.equal(observation.gsp_earn.value, 590);
  assert.equal(observation.gsp_earn.confidence, 0.9);
  assert.match(
    observation.gsp_earn.raw_text || "",
    /x500.*590 \/ 590/,
  );
});
