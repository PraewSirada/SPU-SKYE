# ใช้ Python 3.12 Slim ให้ตรงกับสภาพแวดล้อมที่ใช้สร้างไฟล์โมเดล (.joblib) และช่วยลดขนาด Image
FROM python:3.12-slim

# ป้องกันการสร้างไฟล์ .pyc, ให้ Log แสดงผลทันที และจำกัดเธรดของไลบรารีคำนวณเพื่อความเสถียร
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1

WORKDIR /app

# ติดตั้งไลบรารีจาก requirements.txt ก่อนเพื่อใช้ประโยชน์จาก Docker Layer Cache
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# คัดลอกโค้ด Backend และไฟล์โมเดล (.joblib / evaluation_report.json) เข้าสู่ Container
COPY main.py live_data.py ./
COPY models/ ./models/
COPY training/ ./training/

# เปิดพอร์ต 8000 สำหรับให้บริการ FastAPI
EXPOSE 8000

# ตรวจสอบสถานะความพร้อมของ API และโมเดลอัตโนมัติ (รองรับพอร์ตจาก Environment Variable เช่น Render)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health', timeout=5)" || exit 1

# เริ่มรันเซิร์ฟเวอร์ Uvicorn โดยใช้ PORT จากระบบ (เช่น 10000 บน Render) หรือค่าเริ่มต้น 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

