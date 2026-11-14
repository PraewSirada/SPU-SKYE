# ── Stage 1: Build Next.js Static Export ด้วย Node.js (รันบนสถาปัตยกรรมเครื่องหลักเพื่อให้ Build เร็ว) ──
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# คัดลอกไฟล์จัดการแพ็กเกจและติดตั้ง Dependencies
COPY package.json package-lock.json ./
RUN npm ci

# รับค่า URL ของ Backend API ตอน Build (ค่าเริ่มต้นชี้ไปที่ http://localhost:8000)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1

# คัดลอกซอร์สโค้ดทั้งหมดและสั่ง Build ออกมาเป็นไฟล์ Static ในโฟลเดอร์ out/
COPY . .
RUN npm run build

# ── Stage 2: เสิร์ฟหน้าเว็บด้วย Nginx น้ำหนักเบา ───────────────────────────────
FROM nginx:1.27-alpine

# นำการตั้งค่า Nginx และไฟล์ Static Build มาวาง (ทับ index.html เดิมโดยตรง ไม่ต้องรันคำสั่งข้ามสถาปัตยกรรม)
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html

# เปิดพอร์ต 80 ภายใน Container (จะ Map ออกพอร์ต 3000 ใน docker-compose.yml)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

