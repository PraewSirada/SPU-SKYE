// ── Types ──────────────────────────────────────────────────────────────────

export type District =
  | "Bang Khen"
  | "Chatuchak"
  | "Din Daeng"
  | "Ratchathewi"
  | "Dusit"
  | "Pathum Wan"
  | "Lat Phrao"
  | "Huai Khwang"
  | "Phaya Thai"
  | "Bang Na";

export type ForecastHorizon = "24h" | "48h";

export type ThaiAqiTier =
  | "Very Good"
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive"
  | "Unhealthy";

export interface AqiTierMeta {
  tier: ThaiAqiTier;
  color: string;
  bgTint: string;
  thaiLabel: string;
  englishLabel: string;
  rangeLabel: string;
  adviceTh: string;
  adviceEn: string;
}

export interface HourlyDataPoint {
  hour: string;
  timestamp: string;
  actual: number | null;
  predicted: number;
}

export interface ShapFeature {
  feature: string;
  featureTh: string;
  value: number;
  unit: string;
}

export interface DailyForecastPoint {
  dayIndex: number;
  dayTh: string;
  dayEn: string;
  dateLabel: string;
  predictedPM25: number;
  peakPM25: number;
}

export interface DistrictStation {
  id: District;
  nameTh: string;
  nameEn: string;
  stationTh: string;
  stationEn: string;
  currentPM25: number;
  temperatureC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  lat: number;
  lon: number;
  mapX: number; // 0..100 percentage on Bangkok canvas
  mapY: number; // 0..100 percentage on Bangkok canvas
  distanceKm: number;
}

export interface ForecastResponse {
  district: District;
  horizon: ForecastHorizon;
  modelName?: string;
  dataSource?: string;
  fetchedAt: string;
  currentPM25: number;
  predictedPeak: number;
  predictedPeakHour: string;
  topShapFactor: string;
  modelRMSE: number;
  hourly: HourlyDataPoint[];
  shap: ShapFeature[];
  weekly?: DailyForecastPoint[];
}

// ── 5-Tier Thai AQI Metadata (Flat Solid Colors) ───────────────────────────

export const THAI_AQI_TIERS: AqiTierMeta[] = [
  {
    tier: "Very Good",
    color: "#00B0F0",
    bgTint: "#E0F2FE",
    thaiLabel: "คุณภาพอากาศดีมาก",
    englishLabel: "Very Good",
    rangeLabel: "0 to 15.0",
    adviceTh: "อากาศบริสุทธิ์ เหมาะกับทุกกิจกรรมกลางแจ้ง",
    adviceEn: "Clean air, suitable for all outdoor activities",
  },
  {
    tier: "Good",
    color: "#22C55E",
    bgTint: "#DCFCE7",
    thaiLabel: "คุณภาพอากาศดี",
    englishLabel: "Good",
    rangeLabel: "15.1 to 25.0",
    adviceTh: "คุณภาพอากาศดี สามารถทำกิจกรรมกลางแจ้งได้ปกติ",
    adviceEn: "Satisfactory air quality for outdoor activity",
  },
  {
    tier: "Moderate",
    color: "#EAB308",
    bgTint: "#FEF9C3",
    thaiLabel: "ปานกลาง",
    englishLabel: "Moderate",
    rangeLabel: "25.1 to 37.5",
    adviceTh: "คนทั่วไปทำกิจกรรมได้ปกติ กลุ่มเสี่ยงควรลดกิจกรรมหนัก",
    adviceEn: "Sensitive individuals should reduce prolonged exertion",
  },
  {
    tier: "Unhealthy for Sensitive",
    color: "#F97316",
    bgTint: "#FFEDD5",
    thaiLabel: "เริ่มมีผลกระทบ",
    englishLabel: "Sensitive",
    rangeLabel: "37.6 to 75.0",
    adviceTh: "ควรสวมหน้ากาก N95 เมื่ออยู่กลางแจ้งและลดเวลาอยู่นอกอาคาร",
    adviceEn: "Wear an N95 mask outdoors and limit outdoor exposure",
  },
  {
    tier: "Unhealthy",
    color: "#EF4444",
    bgTint: "#FEE2E2",
    thaiLabel: "มีผลกระทบต่อสุขภาพ",
    englishLabel: "Unhealthy",
    rangeLabel: "Above 75.0",
    adviceTh: "งดกิจกรรมกลางแจ้ง ปิดประตูหน้าต่างและเปิดเครื่องฟอกอากาศ",
    adviceEn: "Avoid outdoor activity and run indoor air filtration",
  },
];

export function getThaiAqiMeta(pm25: number): AqiTierMeta {
  if (pm25 <= 15) return THAI_AQI_TIERS[0];
  if (pm25 <= 25) return THAI_AQI_TIERS[1];
  if (pm25 <= 37.5) return THAI_AQI_TIERS[2];
  if (pm25 <= 75) return THAI_AQI_TIERS[3];
  return THAI_AQI_TIERS[4];
}

// Legacy 4-tier helpers kept for compatibility with standalone chart/KPI components
export type AqiStatus =
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive"
  | "Unhealthy";

export function getAqiStatus(pm25: number): AqiStatus {
  if (pm25 <= 25) return "Good";
  if (pm25 <= 37.5) return "Moderate";
  if (pm25 <= 75) return "Unhealthy for Sensitive";
  return "Unhealthy";
}

export function getAqiColor(status: AqiStatus): string {
  switch (status) {
    case "Good":
      return "#10B981";
    case "Moderate":
      return "#F59E0B";
    case "Unhealthy for Sensitive":
      return "#F97316";
    case "Unhealthy":
      return "#EF4444";
  }
}

// ── Bangkok District Stations ──────────────────────────────────────────────

export const BANGKOK_STATIONS: DistrictStation[] = [
  {
    id: "Pathum Wan",
    nameTh: "เขตปทุมวัน",
    nameEn: "Pathum Wan",
    stationTh: "สถานีสวนลุมพินี ปทุมวัน",
    stationEn: "Lumphini Park Station",
    currentPM25: 13.8,
    temperatureC: 30.4,
    windSpeedMs: 4.2,
    windDirectionDeg: 195,
    lat: 13.7314,
    lon: 100.5414,
    mapX: 52,
    mapY: 64,
    distanceKm: 2.1,
  },
  {
    id: "Dusit",
    nameTh: "เขตดุสิต",
    nameEn: "Dusit",
    stationTh: "สถานีสำนักงานเขตดุสิต",
    stationEn: "Dusit District Office",
    currentPM25: 21.6,
    temperatureC: 31.1,
    windSpeedMs: 3.6,
    windDirectionDeg: 185,
    lat: 13.7772,
    lon: 100.5204,
    mapX: 38,
    mapY: 48,
    distanceKm: 3.4,
  },
  {
    id: "Ratchathewi",
    nameTh: "เขตราชเทวี",
    nameEn: "Ratchathewi",
    stationTh: "สถานีเขตราชเทวี พญาไท",
    stationEn: "Ratchathewi Station",
    currentPM25: 29.4,
    temperatureC: 32.0,
    windSpeedMs: 2.8,
    windDirectionDeg: 210,
    lat: 13.7588,
    lon: 100.5345,
    mapX: 48,
    mapY: 54,
    distanceKm: 1.5,
  },
  {
    id: "Bang Khen",
    nameTh: "เขตบางเขน",
    nameEn: "Bang Khen",
    stationTh: "สถานีวงเวียนบางเขน",
    stationEn: "Bang Khen Roundabout",
    currentPM25: 34.2,
    temperatureC: 31.8,
    windSpeedMs: 2.5,
    windDirectionDeg: 175,
    lat: 13.8739,
    lon: 100.5963,
    mapX: 55,
    mapY: 18,
    distanceKm: 8.6,
  },
  {
    id: "Chatuchak",
    nameTh: "เขตจตุจักร",
    nameEn: "Chatuchak",
    stationTh: "สถานีสวนจตุจักร",
    stationEn: "Chatuchak Park Station",
    currentPM25: 43.7,
    temperatureC: 32.6,
    windSpeedMs: 2.1,
    windDirectionDeg: 205,
    lat: 13.8025,
    lon: 100.5535,
    mapX: 49,
    mapY: 31,
    distanceKm: 5.2,
  },
  {
    id: "Din Daeng",
    nameTh: "เขตดินแดง",
    nameEn: "Din Daeng",
    stationTh: "สถานีริมถนนดินแดง",
    stationEn: "Din Daeng Roadside",
    currentPM25: 78.4,
    temperatureC: 33.9,
    windSpeedMs: 1.2,
    windDirectionDeg: 220,
    lat: 13.7697,
    lon: 100.5528,
    mapX: 58,
    mapY: 46,
    distanceKm: 2.8,
  },
  {
    id: "Lat Phrao",
    nameTh: "เขตลาดพร้าว",
    nameEn: "Lat Phrao",
    stationTh: "สถานีสำนักงานเขตลาดพร้าว",
    stationEn: "Lat Phrao Office",
    currentPM25: 39.8,
    temperatureC: 32.3,
    windSpeedMs: 2.3,
    windDirectionDeg: 190,
    lat: 13.8037,
    lon: 100.6067,
    mapX: 67,
    mapY: 28,
    distanceKm: 6.9,
  },
  {
    id: "Huai Khwang",
    nameTh: "เขตห้วยขวาง",
    nameEn: "Huai Khwang",
    stationTh: "สถานีสำนักงานเขตห้วยขวาง",
    stationEn: "Huai Khwang Station",
    currentPM25: 54.6,
    temperatureC: 33.1,
    windSpeedMs: 1.7,
    windDirectionDeg: 215,
    lat: 13.7768,
    lon: 100.5792,
    mapX: 69,
    mapY: 49,
    distanceKm: 4.1,
  },
  {
    id: "Phaya Thai",
    nameTh: "เขตพญาไท",
    nameEn: "Phaya Thai",
    stationTh: "สถานีกรมประชาสัมพันธ์ พญาไท",
    stationEn: "Phaya Thai Station",
    currentPM25: 36.1,
    temperatureC: 32.2,
    windSpeedMs: 2.4,
    windDirectionDeg: 200,
    lat: 13.7801,
    lon: 100.5446,
    mapX: 45,
    mapY: 41,
    distanceKm: 3.1,
  },
  {
    id: "Bang Na",
    nameTh: "เขตบางนา",
    nameEn: "Bang Na",
    stationTh: "สถานีอุตุนิยมวิทยาบางนา",
    stationEn: "Bang Na Weather Station",
    currentPM25: 19.3,
    temperatureC: 30.9,
    windSpeedMs: 3.9,
    windDirectionDeg: 165,
    lat: 13.6665,
    lon: 100.6056,
    mapX: 74,
    mapY: 78,
    distanceKm: 11.4,
  },
];

// ── 7 Day Bangkok Average Forecast (Fallback) ───────────────────────────────

const THAI_WEEKDAYS = [
  "อา.",
  "จ.",
  "อ.",
  "พ.",
  "พฤ.",
  "ศ.",
  "ส.",
];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function build7DayBangkokForecast(): DailyForecastPoint[] {
  const basePattern = [36.8, 42.3, 49.6, 33.1, 24.4, 14.6, 21.8];
  const now = new Date();
  return basePattern.map((val, idx) => {
    const d = new Date(now.getTime() + idx * 86400 * 1000);
    const wd = d.getDay();
    return {
      dayIndex: idx,
      dayTh: idx === 0 ? "วันนี้" : THAI_WEEKDAYS[wd],
      dayEn: idx === 0 ? "Today" : EN_WEEKDAYS[wd],
      dateLabel: `${d.getDate()} ${EN_MONTHS[d.getMonth()]}`,
      predictedPM25: val,
      peakPM25: Math.round((val + 9.4) * 10) / 10,
    };
  });
}

// ── Mock Hourly & SHAP Data ────────────────────────────────────────────────

const DISTRICT_SEEDS: Record<District, number> = {
  "Pathum Wan": 13,
  Dusit: 23,
  Ratchathewi: 31,
  "Bang Khen": 17,
  Chatuchak: 29,
  "Din Daeng": 61,
  "Lat Phrao": 41,
  "Huai Khwang": 53,
  "Phaya Thai": 37,
  "Bang Na": 19,
};

const SHAP_BY_DISTRICT: Record<District, ShapFeature[]> = {
  "Bang Khen": [
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -3.41, unit: "m/s" },
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 2.87, unit: "veh/km" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -1.93, unit: "%" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.54, unit: "°C" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -1.21, unit: "mm" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 0.98, unit: "index" },
  ],
  Chatuchak: [
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 4.12, unit: "veh/km" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -2.88, unit: "m/s" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 2.31, unit: "index" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.77, unit: "°C" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -1.44, unit: "mm" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -0.89, unit: "%" },
  ],
  "Din Daeng": [
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 7.42, unit: "index" },
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 5.86, unit: "veh/km" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 2.94, unit: "°C" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -1.97, unit: "m/s" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -1.03, unit: "mm" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -0.72, unit: "%" },
  ],
  Ratchathewi: [
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 3.18, unit: "veh/km" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -2.94, unit: "m/s" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -1.65, unit: "%" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.42, unit: "°C" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 1.19, unit: "index" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -0.94, unit: "mm" },
  ],
  Dusit: [
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -4.15, unit: "m/s" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -2.32, unit: "%" },
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 1.84, unit: "veh/km" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.12, unit: "°C" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 0.87, unit: "index" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -0.78, unit: "mm" },
  ],
  "Pathum Wan": [
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -4.68, unit: "m/s" },
    { feature: "Green canopy cover", featureTh: "พื้นที่สีเขียวโดยรอบ", value: -3.14, unit: "%" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -2.21, unit: "%" },
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 1.93, unit: "veh/km" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 0.96, unit: "°C" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 0.64, unit: "index" },
  ],
  "Lat Phrao": [
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 3.74, unit: "veh/km" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -2.65, unit: "m/s" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 2.18, unit: "index" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.62, unit: "°C" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -1.14, unit: "%" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -0.92, unit: "mm" },
  ],
  "Huai Khwang": [
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 4.88, unit: "veh/km" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 3.92, unit: "index" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 2.24, unit: "°C" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -2.11, unit: "m/s" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -1.28, unit: "%" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -0.84, unit: "mm" },
  ],
  "Phaya Thai": [
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 3.45, unit: "veh/km" },
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -2.79, unit: "m/s" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 1.88, unit: "index" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -1.52, unit: "%" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.39, unit: "°C" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -0.96, unit: "mm" },
  ],
  "Bang Na": [
    { feature: "Wind speed (m/s)", featureTh: "ความเร็วลม", value: -4.42, unit: "m/s" },
    { feature: "Relative humidity (%)", featureTh: "ความชื้นสัมพัทธ์", value: -2.47, unit: "%" },
    { feature: "Traffic density", featureTh: "ความหนาแน่นจราจร", value: 2.15, unit: "veh/km" },
    { feature: "Rainfall (mm)", featureTh: "ปริมาณน้ำฝน", value: -1.36, unit: "mm" },
    { feature: "Temperature (°C)", featureTh: "อุณหภูมิอากาศ", value: 1.04, unit: "°C" },
    { feature: "Road dust index", featureTh: "ดัชนีฝุ่นถนน", value: 0.79, unit: "index" },
  ],
};

function buildHourly(
  now: Date,
  count: number,
  basePM: number,
  seed: number,
  horizon: ForecastHorizon
): HourlyDataPoint[] {
  const points: HourlyDataPoint[] = [];
  const startMs = now.getTime();

  for (let i = 0; i < count; i++) {
    const pointDate = new Date(startMs + i * 3600 * 1000);
    const h = pointDate.getHours();
    const diurnal =
      Math.sin(((h - 7) * Math.PI) / 10) * 10.6 +
      Math.sin(((h - 19) * Math.PI) / 8) * 7.2;
    const noise = ((seed * (i + 1) * 7919) % 100) / 100 - 0.5;
    const predicted =
      i === 0 ? basePM : Math.max(5.4, basePM + diurnal + noise * 5.2);
    const actual =
      i < 7
        ? Math.max(5.2, predicted + ((seed * (i + 2) * 1031) % 7) - 3.1)
        : null;

    const hh = String(h).padStart(2, "0");
    const label =
      horizon === "48h" && i >= 24 ? `Day 2 ${hh}:00` : `${hh}:00`;

    points.push({
      hour: label,
      timestamp: pointDate.toISOString(),
      actual: actual !== null ? Math.round(actual * 10) / 10 : null,
      predicted: Math.round(predicted * 10) / 10,
    });
  }
  return points;
}

export function buildMockForecast(
  district: District,
  horizon: ForecastHorizon
): ForecastResponse {
  const station =
    BANGKOK_STATIONS.find((s) => s.id === district) ?? BANGKOK_STATIONS[0];
  const seed = DISTRICT_SEEDS[district] ?? 17;
  const now = new Date();
  const count = horizon === "24h" ? 24 : 48;
  const hourly = buildHourly(now, count, station.currentPM25, seed, horizon);

  const peakPoint = hourly.reduce((a, b) =>
    b.predicted > a.predicted ? b : a
  );
  const shap = SHAP_BY_DISTRICT[district] ?? SHAP_BY_DISTRICT["Bang Khen"];
  const topFactor = [...shap].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value)
  )[0];

  return {
    district,
    horizon,
    fetchedAt: now.toISOString(),
    currentPM25: station.currentPM25,
    predictedPeak: peakPoint.predicted,
    predictedPeakHour: peakPoint.hour,
    topShapFactor: topFactor.feature,
    modelRMSE: Math.round((4.18 + (seed % 11) / 10) * 100) / 100,
    hourly,
    shap,
  };
}

// ── API Client ─────────────────────────────────────────────────────────────

// กำหนด URL ของ FastAPI Backend โดยรองรับค่าจาก Environment Variable และใช้ localhost:8000 เป็นค่าเริ่มต้น
const RAW_API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const API_BASE = RAW_API_ORIGIN.endsWith("/api/v1")
  ? RAW_API_ORIGIN
  : `${RAW_API_ORIGIN}/api/v1`;
const FETCH_TIMEOUT_MS =
  RAW_API_ORIGIN.includes("localhost") || RAW_API_ORIGIN.includes("127.0.0.1")
    ? 8000
    : 30000;

export type FetchStatus = "idle" | "loading" | "success" | "error";

export interface LiveStationReading {
  id: District;
  currentPM25: number;
  temperatureC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
}

export interface LiveStationsResponse {
  source: string;
  fetchedAt: string;
  stations: LiveStationReading[];
}

export async function fetchLiveStations(
  forceRefresh = false,
  externalSignal?: AbortSignal
): Promise<DistrictStation[] | null> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);
  const onExternalAbort = () => timeoutController.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    const query = forceRefresh ? "?refresh=true" : "";
    const res = await fetch(`${API_BASE}/stations${query}`, {
      signal: timeoutController.signal,
    });
    if (!res.ok) return null;
    const payload: LiveStationsResponse = await res.json();
    const byId = new Map(payload.stations.map((item) => [item.id, item]));
    return BANGKOK_STATIONS.map((base) => {
      const live = byId.get(base.id);
      if (!live) return base;
      return {
        ...base,
        currentPM25: live.currentPM25,
        temperatureC: live.temperatureC,
        windSpeedMs: live.windSpeedMs,
        windDirectionDeg: live.windDirectionDeg,
      };
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

export interface ForecastResult {
  data: ForecastResponse | null;
  status: FetchStatus;
  error: string | null;
  isOffline: boolean;
}

export async function fetchForecast(
  district: District,
  horizon: ForecastHorizon,
  externalSignal?: AbortSignal,
  forceRefresh = false
): Promise<ForecastResult> {
  const timeoutController = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);

  const onExternalAbort = () => timeoutController.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  try {
    const refreshParam = forceRefresh ? "&refresh=true" : "";
    const res = await fetch(
      `${API_BASE}/forecast?district=${encodeURIComponent(district)}&horizon=${horizon}${refreshParam}`,
      { signal: timeoutController.signal }
    );

    if (!res.ok) {
      return {
        data: null,
        status: "error",
        error: `Forecast server returned status ${res.status}. Retry or load simulated Bangkok data.`,
        isOffline: false,
      };
    }

    const data: ForecastResponse = await res.json();
    return { data, status: "success", error: null, isOffline: false };
  } catch (err) {
    if (externalSignal?.aborted && !timedOut) {
      throw err;
    }

    return {
      data: buildMockForecast(district, horizon),
      status: "success",
      error: null,
      isOffline: true,
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
