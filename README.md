# ระบบสะสมแต้ม LINE Official Account (อัตรา 1 บาท = 1 แต้ม)

ระบบสะสมแต้มสำหรับร้านค้าที่เชื่อมต่อกับ **LINE Official Account (LINE OA)** โดยคำนวณแต้มสะสมตามยอดซื้อจริงแบบ **1 บาท = 1 แต้ม (1:1)**

---

## 🌟 ฟังก์ชันการทำงาน
- **คำนวณแต้ม 1:1 ตามยอดชำระจริง:** ซื้อ ฿349 ได้ 349 แต้ม, ซื้อ ฿1,250 ได้ 1,250 แต้ม
- **บัตรสมาชิกใน LINE (LIFF):** ลูกค้ากดดูจาก Rich Menu ใน LINE ได้ทันที ระบบดึงโปรไฟล์ LINE จริงอัตโนมัติ ไม่ต้องกรอกชื่อหรือจำรหัสผ่าน มี QR Code ส่วนตัวสำหรับยื่นให้ร้านสแกน
- **หน้าจอแคชเชียร์ (Staff Portal):** สแกน QR Code ของลูกค้า หรือค้นหาด้วยเบอร์โทรศัพท์ กรอกยอดซื้อแล้วแต้มเข้าทันที
- **แจ้งเตือนผ่าน LINE ทันที (Flex Message):** ยิงการ์ดใบเสร็จสรุปยอดเงินและแต้มคงเหลือเข้าแชท LINE ของลูกค้าอัตโนมัติ
- **ระบบแลกของรางวัล:** มี Reward Catalog ให้ลูกค้ากดใช้แต้มแลกรับส่วนลดหรือของรางวัล
- **แดชบอร์ดหลังบ้าน (Admin Overview):** สรุปจำนวนสมาชิกจริง ยอดขายรวม และประวัติการทำรายการทั้งหมด

---

## 📁 โครงสร้างโปรเจกต์

```
d:\แต้ม\
├── server.js              # เซิร์ฟเวอร์หลัก (Node.js HTTP Server & REST API)
├── db.js                  # ตัวจัดการฐานข้อมูล JSON และฟังก์ชันคำนวณแต้ม 1:1
├── lineService.js         # บริการยิง Flex Message แจ้งเตือนผ่าน LINE Messaging API
├── package.json           # การตั้งค่าโปรเจกต์
├── .env                   # ตั้งค่า LINE Token และ LIFF ID
├── data/
│   └── db.json            # ฐานข้อมูลเก็บสมาชิก, แต้ม, ประวัติบิล, และของรางวัล
└── public/
    ├── index.html         # แดชบอร์ดสรุปยอดสมาชิกและประวัติการทำรายการ
    ├── liff/
    │   └── index.html     # หน้าบัตรสมาชิกฝั่งลูกค้า (เปิดใน LINE OA)
    └── cashier/
        └── index.html     # หน้าจอพนักงาน/แคชเชียร์สำหรับสแกนและกรอกยอดซื้อ
```

---

## 🚀 วิธีเปิดใช้งาน

1. เปิด Terminal ในโฟลเดอร์นี้ แล้วสั่งรัน:
   ```bash
   node server.js
   ```
2. ลิงก์ระบบ:
   - **แดชบอร์ดหลัก:** [http://localhost:3000](http://localhost:3000)
   - **หน้าจอแคชเชียร์หน้าร้าน:** [http://localhost:3000/cashier/](http://localhost:3000/cashier/)
   - **หน้าบัตรสมาชิก LIFF:** [http://localhost:3000/liff/](http://localhost:3000/liff/)

---

## 📲 ขั้นตอนการเชื่อมต่อ LINE Official Account

### 1. ตั้งค่า LINE Developers Console
1. เข้าไปที่ [https://developers.line.biz/](https://developers.line.biz/)
2. สร้าง **Provider** และสร้าง 2 Channel:
   - **Messaging API Channel:**
     - เข้าแท็บ Messaging API คัดลอก `Channel access token` มาใส่ในไฟล์ `.env` ที่:
       ```env
       LINE_CHANNEL_ACCESS_TOKEN=your_token_here
       ```
   - **LINE Login Channel (LIFF):**
     - เข้าแท็บ LIFF กด **Add LIFF app**
     - Size: Full
     - Endpoint URL: ใส่ URL เว็บจริงของคุณที่ลงท้ายด้วย `/liff/` (เช่น `https://your-domain.com/liff/`)
     - นำ `LIFF ID` ที่ได้มาใส่ในไฟล์ `.env` ที่:
       ```env
       LINE_LIFF_ID=your_liff_id_here
       ```

### 2. ตั้งค่า Rich Menu ใน LINE OA
1. เข้าไปที่ [LINE Official Account Manager](https://manager.line.biz/)
2. ไปที่เมนู **Rich menus (ริชเมนู)**
3. สร้างปุ่มบนริชเมนู เช่น **"บัตรสมาชิก / เช็คแต้ม"**
4. กำหนด Action ของปุ่มให้เป็น **Link (ลิงก์)** แล้วใส่:
   ```
   https://liff.line.me/YOUR_LIFF_ID
   ```
   *(เมื่อลูกค้าแตะปุ่มนี้ใน LINE ระบบจะเปิดหน้าบัตรสมาชิกพร้อม QR Code ทันที)*
