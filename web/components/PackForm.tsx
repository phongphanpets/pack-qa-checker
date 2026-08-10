"use client";

import { useEffect, useState } from "react";

import type { SpecBundle } from "@/lib/website-ocr";

type FormItem = {
  key: string;
  itemId: string;
  name: string;
  amount: string;
  chance: string;
  receiptPresent: boolean;
};

type FormBundle = {
  key: string;
  bundleId: string;
  name: string;
  seedPoint: string;
  gspEarn: string;
  purchaseLimit: string;
  startDate: string;
  endDate: string;
  isPermanent: boolean;
  resetType: string;
  adminName: string;
  adminStartDate: string;
  adminEndDate: string;
  receiptMode: "unreviewed" | "complete" | "missing";
  gachaEnabled: boolean;
  items: FormItem[];
};

export type PackFormDocument = {
  bundles: Array<Record<string, unknown>>;
};

let nextFormKey = 0;

export default function PackForm({
  onChange,
}: {
  onChange: (
    document: PackFormDocument,
    bundles: SpecBundle[],
    valid: boolean,
  ) => void;
}) {
  const [bundles, setBundles] = useState<FormBundle[]>([
    emptyBundle(),
  ]);

  useEffect(() => {
    const result = buildDocument(bundles);
    onChange(result.document, result.snapshots, result.valid);
  }, [bundles, onChange]);

  function patchBundle(
    bundleKey: string,
    update: Partial<FormBundle>,
  ) {
    setBundles((current) =>
      current.map((bundle) =>
        bundle.key === bundleKey ? { ...bundle, ...update } : bundle,
      ),
    );
  }

  function patchItem(
    bundleKey: string,
    itemKey: string,
    update: Partial<FormItem>,
  ) {
    setBundles((current) =>
      current.map((bundle) =>
        bundle.key === bundleKey
          ? {
              ...bundle,
              items: bundle.items.map((item) =>
                item.key === itemKey ? { ...item, ...update } : item,
              ),
            }
          : bundle,
      ),
    );
  }

  return (
    <section className="pack-form">
      <div className="form-intro">
        <div>
          <strong>กรอกข้อมูลจาก Spec</strong>
          <span>
            ใช้ bundle_id และ item_id เป็นตัวจับคู่ ไม่ใช้ชื่อ
          </span>
        </div>
        <button
          type="button"
          onClick={() =>
            setBundles((current) => [...current, emptyBundle()])
          }
        >
          + เพิ่มแพ็ก
        </button>
      </div>

      <div className="bundle-form-list">
        {bundles.map((bundle, bundleIndex) => (
          <details
            className="bundle-form-card"
            key={bundle.key}
            open={bundleIndex === 0}
          >
            <summary>
              <span>
                แพ็ก {bundleIndex + 1}
                <small>
                  {bundle.bundleId || "ยังไม่มี bundle_id"}{" "}
                  {bundle.name ? `— ${bundle.name}` : ""}
                </small>
              </span>
              {bundles.length > 1 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setBundles((current) =>
                      current.filter(
                        (candidate) =>
                          candidate.key !== bundle.key,
                      ),
                    );
                  }}
                >
                  ลบ
                </button>
              )}
            </summary>

            <div className="bundle-form-body">
              <h3>Spec — Ground truth</h3>
              <div className="form-grid">
                <TextField
                  label="bundle_id *"
                  value={bundle.bundleId}
                  onChange={(bundleId) =>
                    patchBundle(bundle.key, { bundleId })
                  }
                  inputMode="numeric"
                />
                <TextField
                  label="ชื่อแพ็ก *"
                  value={bundle.name}
                  onChange={(name) =>
                    patchBundle(bundle.key, { name })
                  }
                  wide
                />
                <TextField
                  label="ราคา Seed Point"
                  value={bundle.seedPoint}
                  onChange={(seedPoint) =>
                    patchBundle(bundle.key, { seedPoint })
                  }
                  inputMode="numeric"
                />
                <TextField
                  label="GSP ที่ได้รับ"
                  value={bundle.gspEarn}
                  onChange={(gspEarn) =>
                    patchBundle(bundle.key, { gspEarn })
                  }
                  inputMode="numeric"
                />
                <TextField
                  label="จำกัดการซื้อ"
                  value={bundle.purchaseLimit}
                  onChange={(purchaseLimit) =>
                    patchBundle(bundle.key, { purchaseLimit })
                  }
                  inputMode="numeric"
                />
                <TextField
                  label="Reset type"
                  value={bundle.resetType}
                  onChange={(resetType) =>
                    patchBundle(bundle.key, { resetType })
                  }
                  placeholder="เช่น none / daily"
                />
                <TextField
                  label="วันเริ่ม"
                  value={bundle.startDate}
                  onChange={(startDate) =>
                    patchBundle(bundle.key, { startDate })
                  }
                  type="date"
                />
                {bundle.isPermanent ? (
                  <div className="form-field">
                    <span>วันจบ</span>
                    <strong>ถาวร</strong>
                  </div>
                ) : (
                  <TextField
                    label="วันจบ"
                    value={bundle.endDate}
                    onChange={(endDate) =>
                      patchBundle(bundle.key, { endDate })
                    }
                    type="date"
                  />
                )}
              </div>
              <label className="gacha-toggle">
                <input
                  type="checkbox"
                  checked={bundle.isPermanent}
                  onChange={(event) =>
                    patchBundle(bundle.key, {
                      isPermanent: event.target.checked,
                      ...(event.target.checked ? { endDate: "" } : {}),
                    })
                  }
                />
                <span>
                  แพ็กถาวร — ไม่มีวันจบใน Spec และตรวจว่า Aztek Tool ตั้งวันสิ้นสุดระยะยาว
                </span>
              </label>

              <div className="form-section-title">
                <h3>Items</h3>
                <button
                  type="button"
                  onClick={() =>
                    patchBundle(bundle.key, {
                      items: [...bundle.items, emptyItem()],
                    })
                  }
                >
                  + เพิ่มไอเทม
                </button>
              </div>
              <div className="form-items">
                {bundle.items.map((item, itemIndex) => (
                  <div
                    className={`form-item-row ${
                      bundle.gachaEnabled ? "with-chance" : ""
                    }`}
                    key={item.key}
                  >
                    <span>{itemIndex + 1}</span>
                    <TextField
                      label="item_id *"
                      value={item.itemId}
                      onChange={(itemId) =>
                        patchItem(bundle.key, item.key, { itemId })
                      }
                    />
                    <TextField
                      label="ชื่อไอเทม"
                      value={item.name}
                      onChange={(name) =>
                        patchItem(bundle.key, item.key, { name })
                      }
                    />
                    <TextField
                      label="จำนวน"
                      value={item.amount}
                      onChange={(amount) =>
                        patchItem(bundle.key, item.key, { amount })
                      }
                      inputMode="numeric"
                    />
                    {bundle.gachaEnabled && (
                      <TextField
                        label="Chance %"
                        value={item.chance}
                        onChange={(chance) =>
                          patchItem(bundle.key, item.key, { chance })
                        }
                        inputMode="decimal"
                      />
                    )}
                    <button
                      className="remove-form-item"
                      type="button"
                      disabled={bundle.items.length === 1}
                      onClick={() =>
                        patchBundle(bundle.key, {
                          items: bundle.items.filter(
                            (candidate) => candidate.key !== item.key,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <h3>Aztek Tool — กรอก 2 ช่องหลัก</h3>
              <div className="form-grid admin-grid">
                <TextField
                  label="ชื่อใน Aztek Tool"
                  value={bundle.adminName}
                  onChange={(adminName) =>
                    patchBundle(bundle.key, { adminName })
                  }
                  wide
                />
                <TextField
                  label="วันเริ่ม"
                  value={bundle.adminStartDate}
                  onChange={(adminStartDate) =>
                    patchBundle(bundle.key, { adminStartDate })
                  }
                  type="date"
                />
                <TextField
                  label={bundle.isPermanent ? "วันจบระยะยาวใน Aztek Tool" : "วันจบ"}
                  value={bundle.adminEndDate}
                  onChange={(adminEndDate) =>
                    patchBundle(bundle.key, { adminEndDate })
                  }
                  type="date"
                />
              </div>

              <h3>Receipt — คนนับของทุกแพ็ก</h3>
              <select
                className="receipt-mode"
                value={bundle.receiptMode}
                onChange={(event) =>
                  patchBundle(bundle.key, {
                    receiptMode: event.target
                      .value as FormBundle["receiptMode"],
                  })
                }
              >
                <option value="unreviewed">ยังไม่ได้ตรวจ</option>
                <option value="complete">ตรวจแล้ว ของครบ</option>
                <option value="missing">ตรวจแล้ว พบของขาด</option>
              </select>
              {bundle.receiptMode === "missing" && (
                <div className="receipt-checklist">
                  {bundle.items.map((item) => (
                    <label key={item.key}>
                      <input
                        type="checkbox"
                        checked={item.receiptPresent}
                        onChange={(event) =>
                          patchItem(bundle.key, item.key, {
                            receiptPresent: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {item.itemId || "ยังไม่มี item_id"} —{" "}
                        {item.name || "ไม่มีชื่อ"}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <label className="gacha-toggle">
                <input
                  type="checkbox"
                  checked={bundle.gachaEnabled}
                  onChange={(event) =>
                    patchBundle(bundle.key, {
                      gachaEnabled: event.target.checked,
                    })
                  }
                />
                <span>
                  แพ็กนี้มี Gacha — เปิดช่อง chance เพื่อตรวจผลรวม 100%
                </span>
              </label>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function emptyItem(): FormItem {
  return {
    key: formKey(),
    itemId: "",
    name: "",
    amount: "",
    chance: "",
    receiptPresent: true,
  };
}

function emptyBundle(): FormBundle {
  return {
    key: formKey(),
    bundleId: "",
    name: "",
    seedPoint: "",
    gspEarn: "",
    purchaseLimit: "",
    startDate: "",
    endDate: "",
    isPermanent: false,
    resetType: "",
    adminName: "",
    adminStartDate: "",
    adminEndDate: "",
    receiptMode: "unreviewed",
    gachaEnabled: false,
    items: [emptyItem()],
  };
}

function buildDocument(bundles: FormBundle[]) {
  let valid = bundles.length > 0;
  const snapshots: SpecBundle[] = [];
  const documentBundles = bundles.map((bundle) => {
    const bundleId = integer(bundle.bundleId);
    if (bundleId === null || !bundle.name.trim()) valid = false;

    const items = bundle.items.map((item) => {
      if (!item.itemId.trim()) valid = false;
      return compact({
        item_id: text(item.itemId),
        name: text(item.name),
        amount: integer(item.amount),
      });
    });
    const spec = compact({
      name: text(bundle.name),
      seed_point: integer(bundle.seedPoint),
      gsp_earn: integer(bundle.gspEarn),
      purchase_limit: integer(bundle.purchaseLimit),
      start_date: text(bundle.startDate),
      end_date: bundle.isPermanent ? null : text(bundle.endDate),
      is_permanent: bundle.isPermanent,
      reset_type: text(bundle.resetType),
      items,
    });
    const admin = compact({
      name: text(bundle.adminName),
      start_date: text(bundle.adminStartDate),
      end_date: text(bundle.adminEndDate),
      is_permanent:
        bundle.adminStartDate && bundle.adminEndDate
          ? permanentRange(bundle.adminStartDate, bundle.adminEndDate)
          : null,
    });

    let receipt: Record<string, unknown> | undefined;
    if (bundle.receiptMode !== "unreviewed") {
      receipt = {
        items: bundle.items
          .filter(
            (item) =>
              bundle.receiptMode === "complete" ||
              item.receiptPresent,
          )
          .map((item) => ({ item_id: text(item.itemId) })),
      };
    }

    let gacha: Record<string, unknown> | undefined;
    if (bundle.gachaEnabled) {
      gacha = {
        is_gacha: true,
        items: bundle.items.map((item) =>
          compact({
            item_id: text(item.itemId),
            name: text(item.name),
            amount: integer(item.amount),
            chance: decimal(item.chance),
          }),
        ),
      };
    }

    if (bundleId !== null) {
      snapshots.push({
        bundle_id: bundleId,
        name: text(bundle.name),
        seed_point: integer(bundle.seedPoint),
        gsp_earn: integer(bundle.gspEarn),
        purchase_limit: integer(bundle.purchaseLimit),
        is_permanent: bundle.isPermanent,
        items: bundle.items.map((item) => ({
          item_id: text(item.itemId),
          name: text(item.name),
          amount: integer(item.amount),
        })),
      });
    }

    return compact({
      bundle_id: bundleId,
      spec,
      admin: Object.keys(admin).length ? admin : undefined,
      receipt,
      gacha,
    });
  });

  return {
    document: { bundles: documentBundles },
    snapshots,
    valid,
  };
}

function compact(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

function text(value: string) {
  return value.trim() || null;
}

function integer(value: string) {
  if (!/^-?\d+$/.test(value.trim())) return null;
  return Number.parseInt(value, 10);
}

function decimal(value: string) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  return Number.parseFloat(value);
}

function permanentRange(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? end - start >= 365 * 9 * 24 * 60 * 60 * 1000
    : false;
}

function formKey() {
  nextFormKey += 1;
  return `pack-form-${nextFormKey}`;
}
