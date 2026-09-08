import assert from "node:assert/strict";
import test from "node:test";

import { itemCodeRequestRows } from "../lib/item-code-request-xlsx.ts";

test("repeats Item Code metadata with every requested reward", () => {
  const rows = itemCodeRequestRows({ title: "Streamer itemcode 6/9 #1", codeKind: "MASTER", serial: "TOSM9F4H2Y", startAt: "6 Sep 18.30 น.", endAt: "9 Sep 12.00 น.", perUserLimit: "1", redeemLimit: "1020", conditions: ["Last Logged In After or Equal"], bundles: [{ bundle_id: 0, name: "Streamer itemcode 6/9 #1", is_gacha: false, is_permanent: false, items: [{ item_id: "1315001", name: "Fellow Ticket", amount: 2, chance: null }, { item_id: "52001", name: "Memory Stone Key Selection", amount: 2, chance: null }] }] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], "TOSM9F4H2Y");
  assert.equal(rows[1][8], "52001");
  assert.equal(rows[0][6], "Last Logged In After or Equal");
});
