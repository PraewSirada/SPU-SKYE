# คู่มือรัน SPU SKYE (PM2.5 Sentinel) สำหรับเพื่อน

ไม่ต้องติดตั้ง Python หรือ Node.js ในเครื่อง ขอแค่มีโปรแกรม **Docker Desktop** ก็รันได้ทันทีครับ

---

## ขั้นตอนที่ 1: ติดตั้งและเปิด Docker Desktop
* **สำหรับ Mac:**
  1. ดาวน์โหลด **Docker Desktop for Mac** (เลือก **Apple Silicon** สำหรับชิป M1/M2/M3/M4 หรือ **Intel Chip** สำหรับเครื่อง Intel)
  2. เปิดแอป **Docker Desktop** ทิ้งไว้จนขึ้นสถานะ **Engine running** (รูปวาฬมุมขวาบนหยุดหมุน)
* **สำหรับ Windows:**
  1. ดาวน์โหลดและเปิด **Docker Desktop for Windows** ทิ้งไว้จนสถานะเป็น Running

---

## ขั้นตอนที่ 2: แตกไฟล์ ZIP แล้วสั่งรัน

### วิธีใช้งานบน Mac
1. แตกไฟล์ ZIP นี้ (เช่น ไว้ใน `Downloads/SPU_SKYE_For_Friend`)
2. เปิดแอป **Terminal** (กด `Cmd + Space` แล้วพิมพ์ `Terminal`)
3. พิมพ์ `cd ` (มีเว้นวรรค 1 ครั้ง) แล้วลากโฟลเดอร์ `SPU_SKYE_For_Friend` มาวางใน Terminal จากนั้นกด **Enter**
4. สั่ง Build และรันระบบ (ครั้งแรกจะใช้เวลาประมาณ 1–3 นาทีเพื่อสร้าง Image ให้ตรงกับชิป Mac ของเครื่อง):
   ```bash
   docker compose up --build -d
   ```
   *(หรือสั่ง `bash run_mac.command` เพื่อรันและเปิดเว็บให้อัตโนมัติก็ได้)*

### วิธีใช้งานบน Windows
1. แตกไฟล์ ZIP นี้ แล้วเปิดโฟลเดอร์ `SPU_SKYE_For_Friend`
2. ดับเบิลคลิกไฟล์ `run_windows.bat` ได้เลย หรือเปิด Terminal/PowerShell ในโฟลเดอร์นี้แล้วสั่ง:
   ```bash
   docker compose up --build -d
   ```

---

## ขั้นตอนที่ 3: เปิดใช้งานหน้าเว็บ
เมื่อรันเสร็จแล้ว เปิดเบราว์เซอร์ (Safari / Chrome) แล้วไปที่:
* **หน้าเว็บหลัก:** `http://localhost:3000`
* **เช็กสถานะ API:** `http://localhost:8000/health`

---

## คำสั่งพื้นฐานเพิ่มเติม (รันในโฟลเดอร์นี้)
* **ปิดระบบทั้งหมด (หยุด Container):**
  ```bash
  docker compose down
  ```
* **เปิดใหม่อีกครั้งในรอบถัดไป (ไม่ต้องรอ Build ใหม่):**
  ```bash
  docker compose up -d
  ```
* **ดู Log การทำงาน:**
  ```bash
  docker compose logs -f
  ```

