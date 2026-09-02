# Pack QA Validation System — build brief

## Reusable skills

- [`skills/aztek-bundle-import`](skills/aztek-bundle-import/SKILL.md): แปลง Flash Sale
  เป็นไฟล์ Aztek Bundle Import โดยยึดไฟล์ import ที่ผ่านแล้วเป็น template และตรวจ
  Fixed/Random, GSP, Player EXP, Chance และ Secret Chance ก่อนส่ง

เครื่องมือตรวจ in-game pack โดยเทียบข้อมูลหลายแหล่งกับ Spec (ground truth) แล้วออกรีพอร์ต
เป้าหมายระยะยาว: แทนไฟล์ Excel "Approve งาน GM" ด้วยเว็บที่ตรวจให้ในตัว

## วิธีใช้ Pilot RC1

1. ดับเบิลคลิก `เปิด Pack QA.cmd` ตัวเปิดระบบจะตรวจ API และหน้าเว็บก่อนเปิด
   `http://localhost:3000` โดยอัตโนมัติ
2. Draft ที่ข้อมูลพร้อมแล้วจะบันทึกใน browser ของเครื่องนี้อัตโนมัติ
   ถ้าต้องย้ายเครื่องหรือส่งต่อ ให้กด **บันทึกงาน** และใช้ **เปิดงาน** กับไฟล์ JSON ที่ได้
3. หลังตรวจเสร็จ กด **Export Feedback** เพื่อรวม canonical input, Website observation,
   provenance, จุดที่คนยืนยัน, ผลตรวจ และภาพหลักฐานไว้ในไฟล์เดียว
4. ผลตรวจสำเร็จจะถูกบันทึกใน **ประวัติการตรวจ** อัตโนมัติ พร้อมผลและภาพหลักฐาน
   กดรายการเพื่อเปิดกลับมาดูหรือแก้ต่อได้ การเปิดไฟล์ Save/Feedback เดิมจะนำเข้า History
   และไม่สร้างรายการซ้ำ หลังเปิดประวัติสามารถเพิ่มภาพ Website ฉบับเต็มหรือ Receipt
   แล้วกด **บันทึกการแก้ไขลง History** เพื่อสร้าง revision ใหม่โดยไม่ทับรายการเดิม
   ถ้าภาพ Product มาทีหลังและต้องการให้ผลตรวจเปลี่ยน ให้กด
   **ตรวจ Website เพิ่มเพื่อเปลี่ยนผล** อ่าน/ยืนยัน OCR แล้วกด **เริ่มตรวจแพ็ก**
   ระบบจะรวมค่าที่อ่านใหม่กับค่าที่ตรวจไว้และบันทึกผลรอบใหม่อัตโนมัติ
5. เวอร์ชันนี้เป็นตัวช่วยตรวจเท่านั้น Excel ยังเป็นเอกสารอนุมัติหลัก

ถ้าเปิดระบบไม่สำเร็จ รายละเอียดจะอยู่ในโฟลเดอร์ `.runtime`

## หลักการออกแบบ (อย่าเปลี่ยน)

ทุก source แปลงเข้า **canonical pack model** (`packqa/model.py`) ก่อน
rule engine ทำงานกับ model นี้เท่านั้น ไม่รู้ว่าข้อมูลมาจาก xlsx / ฟอร์ม / OCR
→ เพิ่ม source ใหม่ = เขียน adapter ใหม่ 1 ตัว ไม่แตะ engine

**เส้นแบ่งที่สำคัญที่สุด:** ค่าที่อ่านไม่ออก = `UNVERIFIABLE` ไม่ใช่ `FAIL`
ถ้าเผลอยุบสองอันนี้รวมกัน รีพอร์ตจะเต็มไปด้วย FAIL ปลอมแล้วไม่มีใครใช้

## แต่ละ source เอาข้อมูลเข้ายังไง (สรุปหลังคุยจบ)

| source | วิธี | ต้อง OCR? |
|--------|------|-----------|
| Spec | ก๊อบวางทั้งบล็อก | ไม่ |
| Aztek Tool (เดิม Admin) | OCR จากภาพตาราง (ชื่อ + วันที่) พร้อมช่องวางข้อความสำรอง | ไม่ |
| **Website** | **อ่านจากรูป** | **ใช่ — แหล่งเดียว** |
| Receipt | คนนับว่าของครบมั้ย (presence เฉยๆ) | ไม่ |
| Gacha | ก๊อบ + เช็ค sum = 100% | ไม่ |

OCR เหลือแหล่งเดียว ที่เหลือคือ input ที่เชื่อถือได้ตั้งแต่ต้นทาง

## Current product decisions

- **Receipt:** ไม่ทำ OCR และยังไม่พัฒนา automated check ในรอบนี้
  ใช้เป็นรูปหลักฐานแนบให้ PM เปิดดูและยืนยันว่าซื้อแพ็กแล้วของเข้าเกมจริงเท่านั้น
  เก็บ requirement เรื่อง receipt presence ไว้สำหรับรอบถัดไป
- **Aztek Tool (source key เดิม `admin`):** เป็น source ที่จำเป็นใน flow ปัจจุบัน เพราะใช้ยืนยันชื่อแพ็ก
  และวันเวลาเปิด–ปิด โดยอ่านจากภาพตามคอลัมน์จริงเป็นหลัก และมีช่องวางข้อความสำรอง
- **แพ็กถาวร:** Spec ใช้ `is_permanent: true` แทนวันจบ ส่วน Aztek Tool ยังต้องมีวันสิ้นสุด
  ทางเทคนิคแบบระยะยาว ระบบถือว่าเป็นถาวรเมื่อช่วง Start–End อย่างน้อย 9 ปี
  และจะไม่เทียบวันจบแบบ exact date กับ Spec

## ลำดับการสร้าง (สำคัญ — อย่าข้าม)

**Step 1 — YAML adapter ก่อน ไม่ใช่ OCR**
adapter ตัวแรกอ่าน pack จากไฟล์ YAML ที่คนกรอก → แปลงเป็น canonical model
ทำแบบนี้เพื่อพิสูจน์ rule engine โดยไม่ต้องรอ OCR
(OCR จะมาเป็น adapter ตัวท้ายสุด หลัง engine นิ่งแล้ว)

**Step 2 — rule engine**
อ่าน `pack_rules.yaml` → ตรวจ `PackBundle` → คืน list ของ finding
finding แต่ละอันมี: check / field / source / expected / actual / status / severity / message

**Step 3 — diff + report**
diff เทียบ field ข้าม source (ดู DeepDiff เฉพาะถ้าช่วยจริง — ส่วนใหญ่เทียบเองชัดกว่า)
report เป็น HTML ตารางเดียวด้วย Jinja2 ยังไม่ต้องทำ dashboard

## เกณฑ์ผ่าน (definition of done ของรอบแรก)

รันกับ golden dataset แล้ว:
1. จับ **[TIP] Aura Black 3 vs 2** ได้ (cross-source, ชนิด A) — ตอนนี้ใช้ synthetic reconstruction เพราะไฟล์ xlsx จริงไม่ได้อยู่ใน workspace นี้
2. จับ **GSP x49 ควรเป็น x490** ได้ (invariant, ชนิด B) — synthetic case
3. pack ที่ปกติ 6 ตัว **ต้องไม่มี FAIL แม้แต่ตัวเดียว** (กัน false positive)
4. cell "เดิมมี ..." ต้องถูกข้าม ไม่กลายเป็น FAIL ปลอม

ผ่านครบ 4 ข้อ = rule engine เชื่อถือได้ ค่อยไปต่อ Step 4 (OCR + เว็บ)

## golden dataset

คู่ไฟล์ `<pack>.xlsx` + `<pack>.expected.yaml` (เฉลยเขียนด้วยมือโดยคน)
เฉลยคือ "ข้อสอบพร้อมเฉลย" — โปรแกรมต้องรายงานตรงกับเฉลยจึงผ่าน
ไฟล์ xlsx จริงที่อ้างใน hand-off ไม่ได้อยู่ใน workspace นี้ รอบแรกจึงใช้
`fixtures/dao_167.regression.yaml` + `fixtures/dao_167.expected.yaml`
เป็น synthetic reconstruction (7 packs, pack 3 มี 1 FAIL) และแยกเคส GSP ไว้ที่
`fixtures/gsp_x49.synthetic.yaml` + `fixtures/gsp_x49.expected.yaml`

## implementation รอบแรก

- YAML adapter: `packqa/adapters/yaml_adapter.py`
- rule engine: `packqa/rules/engine.py`
- report JSON/HTML: `packqa/reporting.py`
- CLI: `python -m packqa validate <input.yaml> --rules pack_rules.yaml --output report.html`
- รันทดสอบ: `python -m pytest -q`

CLI จะเขียนทั้ง `report.html` และ `report.json` และคืน exit code `1` เมื่อพบ
`FAIL` (`UNVERIFIABLE` ไม่ถูกนับเป็น `FAIL`)

synthetic regressions ที่ครอบคลุมตอนนี้:

- Aura Black amount 3 → 2
- GSP 490 → 49
- Admin pack name ถูกก๊อบผิด
- Website purchase limit ผิด

real workbook fixture:

- `fixtures/dao_225.real.yaml` ถอดข้อมูลด้วยมือจากแท็บ `ดาว 225 TOSM`
  ใน `Approve งาน GM (4).xlsx`
- metadata ที่เป็น cell ใช้ locator แบบ cell address
- หลักฐาน Spec/Admin/Website/Receipt ที่เป็นรูปใช้ locator แบบ embedded image
- Website ไม่มี item ID จึง resolve ID จาก Spec และเก็บ provenance ของ ID เป็น
  `source: spec` โดย amount/name ยังเป็น `source: website`

## Website OCR boundary

`packqa/adapters/website_ocr.py` เป็น adapter boundary ที่ไม่ผูกกับ OCR provider:

- รับ value + confidence + raw_text + locator
- confidence ต่ำกว่า 0.75 จะไม่ถูกนำไปตัดสิน FAIL
- resolve item ID จากชื่อที่ตรงกับ Spec แบบ unique เท่านั้น
- ชื่อที่จับคู่ไม่ได้หรือคลุมเครือเป็น `UNVERIFIABLE`
- item ที่หายจริงและ observed item อื่นมี ID ครบยังเป็น `FAIL`

ตัวอย่างรัน observation จากรูป Website ของแท็บจริง:

```powershell
python -m packqa validate fixtures\dao_225.real.yaml `
  --website-ocr fixtures\dao_225.website_ocr.yaml `
  --rules pack_rules.yaml `
  --output reports\dao_225_ocr.html
```

แยกรูปหลักฐานจาก Excel แบบ read-only สำหรับย้าย golden dataset:

```powershell
python -m packqa extract-evidence "Approve งาน GM (4).xlsx" `
  --sheet "ดาว 225 TOSM" `
  --output "evidence\dao_225"
```

คำสั่งนี้ไม่สร้าง canonical data และไม่เข้า rule engine โดยตรง แต่เขียนรูป
พร้อม `manifest.json` ที่ระบุ worksheet part, media part และ anchor ของรูป
เพื่อส่งรูป Website ให้ OCR adapter โดยไม่ทำให้ engine รู้จัก XLSX

## Stack

Python 3.13 · Pydantic · openpyxl · Jinja2 · pytest
Clean-ish architecture: adapters / model / rules / report แยกชั้น
เขียนให้เทสง่ายก่อน สวยทีหลัง

## สิ่งที่ยัง**ไม่**ทำ (อย่าเพิ่งแตะ)

Plugin architecture เต็มรูป · OpenCV · performance tuning · Admin API adapter · dashboard
ทั้งหมดนี้เก็บไว้ มันจะโผล่มาเองตอนจำเป็นจริง ตอนนี้ทำให้ core ตรวจถูกก่อน
