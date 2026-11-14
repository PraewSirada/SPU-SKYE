import type { NextConfig } from "next";

// ตั้งค่าให้ Next.js ส่งออกเป็นไฟล์ Static (โฟลเดอร์ out/) เพื่อนำไปเสิร์ฟผ่าน Nginx ใน Docker ได้อย่างรวดเร็ว
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
