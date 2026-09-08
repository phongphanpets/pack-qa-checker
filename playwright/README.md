# Product Request Checker

Playwright test suite สำหรับตรวจว่าสินค้าบนเว็บตรงกับ request ที่คาดหวังหรือไม่ เช่น ชื่อสินค้า ราคา SKU และสถานะสินค้า

## วิธีใช้ง่ายที่สุด

ไม่ต้องติดตั้ง `pnpm`

1. ดับเบิลคลิก `login-tosm.cmd` แล้วล็อกอิน TOSM ในหน้าต่าง Microsoft Edge ที่เปิดขึ้น
2. เมื่อหน้าต่างแจ้งว่าบันทึกการล็อกอินแล้ว ให้ดับเบิลคลิก `check-rank-flash-sale.cmd` เพื่อตรวจ Flash Sale

## Aztek Tools: Fellow Coin

สำหรับตรวจจากหลังบ้านโดยไม่ต้องผ่าน Cloudflare:

1. ดับเบิลคลิก `login-aztek.cmd` แล้วล็อกอิน Aztek Tools หนึ่งครั้ง
2. ดับเบิลคลิก `check-aztek-fellow-coin.cmd` เพื่อตรวจ Products และ Bundles ของ `STEP GOD GACHA #3 : Fellow Coin DC Upto 71%`

รายการที่ใช้เทียบอยู่ใน `requests/aztek-fellow-coin.json`

หากต้องการดูตัวตรวจทำงานทีละขั้น ให้ดับเบิลคลิก `inspect-aztek-fellow-coin.cmd`

หากต้องการคลิกสอน Playwright ให้บันทึกขั้นตอนใหม่ ให้ดับเบิลคลิก `record-aztek.cmd`

## Aztek Tools: 1 Sep Pack QA

ดับเบิลคลิก `check-aztek-sep-1-pack-qa.cmd` เพื่อตรวจว่า Google Sheet `ปอ 1/9 - TOSM` ยังตรงกับรายการ QA ก่อนตรวจ Skibidi, ขึ้นเขาระเบิด และติดหวาน 79% ใน Aztek.

รายการที่ต้องรอหลักฐานเพิ่มถูกบันทึกไว้ใน `requests/aztek-sep-1-pack-qa.json`

เมื่อทำงานเสร็จ ระบบจะเปิด `qa-reports/latest.html` ซึ่งแสดงผลทุกจุดตรวจเป็น:

- `PASS`: ค่าตรงกับ Request
- `FAIL`: ค่าจริงไม่ตรงกับ Request
- `REVIEW`: ยังต้องเพิ่มหลักฐานหรือให้คนยืนยัน
- `BLOCKED`: เข้าถึงหรืออ่านแหล่งข้อมูลไม่ได้

ระบบจะสร้าง `qa-reports/latest.json` สำหรับนำไปต่อระบบแจ้งเตือนภายหลัง และเก็บ Screenshot เฉพาะกรณีที่ Aztek ตรวจไม่ผ่านหรือถูกบล็อก การตรวจนี้เป็นแบบอ่านอย่างเดียว ไม่แก้ Google Sheet, ไม่แก้ Aztek และไม่ซื้อสินค้า

## Aztek DOM read-back → Pack QA canonical model

`aztek-dom-readback.spec.ts` อ่าน Product/Bundle แบบ **read-only** โดยรับ target
จาก Product UUID และ Bundle ID โดยตรง ไม่ค้นหาจากชื่อสินค้า และไม่กด Save/Import/Delete
ผลลัพธ์เป็น JSON ที่ `packqa.adapters.aztek_dom` รับเข้า rule engine ได้ พร้อม
`raw_text`, `locator` และ `confidence` ต่อ field.

1. สำเนา `requests/aztek-dom-targets.example.json` เป็นไฟล์งานของคุณ แล้วใส่เฉพาะ UUID/Bundle ID ที่ต้องตรวจ
2. ล็อกอิน Aztek ด้วย `pnpm run auth:aztek` ตามปกติ
3. รัน:

```powershell
$env:AZTEK_DOM_TARGETS="requests/aztek-dom-targets.local.json"
pnpm run read:aztek-dom
```

จะได้ `qa-reports/aztek-dom/latest.json` สำหรับส่งเป็น `aztek_dom_observations`
พร้อม `aztek_dom_targets` ไปยัง Local API ของ Pack QA. ค่าที่ collector อ่านไม่ได้จะไม่ถูกเดา และ adapter จะส่งต่อเป็น `UNVERIFIABLE`.

## ติดตั้ง

```powershell
pnpm install
.\node_modules\.bin\playwright.cmd install chromium
```

## ตั้งค่า request

แก้ไฟล์ `requests/products.json` แล้วใส่สินค้าที่ต้องการตรวจ:

```json
{
  "products": [
    {
      "id": "sku-001",
      "url": "/products/my-product",
      "selectors": {
        "name": "[data-testid='product-name']",
        "price": "[data-testid='product-price']",
        "sku": "[data-testid='product-sku']",
        "availability": "[data-testid='product-availability']"
      },
      "expected": {
        "name": "My Product",
        "priceText": "฿1,990",
        "sku": "SKU-001",
        "inStock": true
      }
    }
  ]
}
```

ถ้า `url` เป็น path แบบ `/products/my-product` ให้ส่ง base URL ผ่าน `SITE_URL`

```powershell
$env:SITE_URL="https://example.com"
pnpm test
```

ถ้าต้องการใช้ request file อื่น:

```powershell
$env:PRODUCT_REQUEST_FILE="requests/staging-products.json"
pnpm test
```

## รันแบบเห็น browser

```powershell
pnpm run test:headed
```

## หมายเหตุ

- ใส่ `skip: true` ใน product request ได้ ถ้าต้องการพักเคสนั้นไว้ชั่วคราว
- แนะนำให้ใช้ selector ที่เสถียร เช่น `data-testid` แทน CSS class ที่เปลี่ยนได้ง่าย
- `inStock` รองรับคำพื้นฐาน เช่น `in stock`, `available`, `พร้อมส่ง`, `มีสินค้า`, `out of stock`, `sold out`, `หมด`, `ไม่มีสินค้า`

## TOSM Fellow Coin

ไฟล์ `requests/products.json` ตอนนี้ใส่ request ของ `STEP GOD GACHA #3 : Fellow Coin DC Upto 71%` แล้ว

เว็บ TOSM ต้อง login ก่อนถึงจะเห็นหน้าสินค้า ให้บันทึก session ด้วยคำสั่งนี้:

```powershell
pnpm run auth:tosm
```

Browser จะเปิดขึ้นมา ให้ login ด้วยตัวเอง แล้วรอจนเห็นหน้า shop จากนั้น Playwright จะบันทึก session ไว้ที่ `playwright/.auth/tosm.json`

หลังจากนั้นรันตรวจสินค้า:

```powershell
$env:STORAGE_STATE="playwright/.auth/tosm.json"
pnpm test
```

## TOSM Rank Flash Sale

ไฟล์ `requests/rank-flash-sale.json` ใช้ตรวจ section `Flash Sale` บนหน้า `https://tosm-portal.exe.in.th/shop/rank`

รันเฉพาะ Flash Sale:

```powershell
$env:STORAGE_STATE="playwright/.auth/tosm.json"
pnpm run test:rank-flash-sale
```

รันแบบเห็น browser:

```powershell
$env:STORAGE_STATE="playwright/.auth/tosm.json"
pnpm run test:rank-flash-sale:headed
```
