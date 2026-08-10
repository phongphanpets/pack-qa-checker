"""
Canonical Pack Model
─────────────────────
หัวใจของระบบ ทุก source (Spec / Admin / Website / Receipt / Gacha) แปลงเข้าโครงนี้
rule engine ทำงานกับ model นี้เท่านั้น — ไม่รู้และไม่แคร์ว่าข้อมูลมาจาก xlsx, ฟอร์มก๊อบวาง, หรือ OCR

หลักการที่ทำให้ระบบไม่พัง:
  1. ทุก field ไม่ได้เก็บแค่ "ค่า" แต่เก็บ "ค่า + มาจากไหน + มั่นใจแค่ไหน + ข้อความดิบ"
     → เวลารายงานถึงบอกได้ว่า "อ่านได้ '2' จากรูปเว็บ" ไม่ใช่แค่ "ผิด"
  2. ค่าที่อ่านไม่ออก = None + confidence 0 → กลายเป็น UNVERIFIABLE ไม่ใช่ FAIL
     นี่คือเส้นแบ่งที่กันไม่ให้รีพอร์ตเต็มไปด้วย FAIL ปลอมตอน OCR เพี้ยน
"""
from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Source(str, Enum):
    """แหล่งที่มาของค่า — ติดกับทุก field เพื่อให้รีพอร์ตชี้ได้ว่าใครผิด"""
    SPEC = "spec"          # ground truth — ก๊อบวาง confidence 1.0 เสมอ
    ADMIN = "admin"        # ก๊อบวาง (ชื่อ + วันที่เท่านั้น)
    WEBSITE = "website"    # OCR — แหล่งเดียวที่อ่านจากรูปจริง
    RECEIPT = "receipt"    # คนนับของครบมั้ย
    GACHA = "gacha"        # ก๊อบวาง (optional)


class Confidence(float, Enum):
    """
    ระดับความมั่นใจของค่า — ตัวตัดสินว่า field นี้เชื่อได้แค่ไหน
    rule engine ใช้ค่านี้ตัดสินว่าจะ FAIL หรือ UNVERIFIABLE
    """
    CERTAIN = 1.0     # ก๊อบวาง / อ่านจาก cell ตรงๆ / คนยืนยันแล้ว
    HIGH = 0.8        # OCR อ่านได้ชัด
    LOW = 0.4         # OCR อ่านได้แต่ก้ำกึ่ง → ควรให้คนยืนยัน
    NONE = 0.0        # อ่านไม่ออก / ไม่มีข้อมูล → UNVERIFIABLE


class Field_(BaseModel, Generic[T]):
    """
    หนึ่ง field = ค่า + provenance ไม่ใช่แค่ค่าเปล่าๆ
    นี่คือสิ่งที่ทำให้ทั้งระบบ debug ได้และไม่ FAIL มั่ว
    """
    value: T | None = None
    source: Source
    confidence: Confidence = Confidence.CERTAIN
    raw_text: str | None = None      # ข้อความดิบก่อน normalize เช่น "x490" ก่อนแปลงเป็น 490
    locator: str | None = None       # ชี้ตำแหน่ง เช่น "website img row 339" หรือ "cell B12"

    @property
    def is_verifiable(self) -> bool:
        return self.value is not None and self.confidence > Confidence.NONE


class Item(BaseModel):
    """ไอเทมหนึ่งชิ้นใน pack — ใช้ item_id เป็น key จับคู่ข้าม source (ไม่ใช่ชื่อ)"""
    item_id: Field_[str]             # 40146, 51201 — key ที่เชื่อถือได้ ไม่ใช่ชื่อที่อาจพิมพ์ต่างภาษา
    name: Field_[str]
    amount: Field_[int]
    chance: Field_[float] | None = None   # สำหรับ gacha เท่านั้น


class Pack(BaseModel):
    """
    หนึ่ง pack ที่ normalize แล้วจาก source เดียว
    ระบบสร้าง Pack หลายตัว (ตัวละ source) แล้วเอามาเทียบกันใน diff engine
    """
    bundle_id: Field_[int]           # 114434 — pack identity ตัวจริง แก้ปัญหา "จับคู่ pack ยังไง"
    name: Field_[str]
    seed_point: Field_[int]
    gsp_earn: Field_[int]
    purchase_limit: Field_[int]
    start_date: Field_[date]
    end_date: Field_[date]
    is_permanent: Field_[bool] | None = None
    reset_type: Field_[str]
    items: list[Item] = Field(default_factory=list)
    is_gacha: bool = False
    source: Source                    # source นี้คือของแหล่งไหน


class PackBundle(BaseModel):
    """
    รวมทุก source ของ pack เดียวกัน — สิ่งที่ rule engine รับเข้าไปตรวจ
    key ทุกตัวคือ bundle_id เดียวกัน
    """
    bundle_id: int
    spec: Pack
    admin: Pack | None = None
    website: Pack | None = None
    receipt: Pack | None = None
    gacha: Pack | None = None
