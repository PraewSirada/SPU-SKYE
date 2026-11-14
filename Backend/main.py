"""FastAPI prediction service for Bangkok PM2.5 air quality forecasting."""

import os

# Limit native BLAS thread allocation to prevent memory reservation failures on Windows
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import logging
import math
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from live_data import (
    BKK_TZ,
    STATION_META_BY_ID,
    STATION_METADATA,
    _compute_wind_components,
    _pm25_to_us_aqi,
    get_live_snapshot,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("pm25_api")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
BASELINE_MODEL_PATH = os.path.join(MODELS_DIR, "PM25_model_bundle.joblib")
CALIBRATED_MODEL_PATH = os.path.join(MODELS_DIR, "PM25_bkk_calibrated_bundle.joblib")
EVALUATION_REPORT_PATH = os.path.join(MODELS_DIR, "evaluation_report.json")

# Map clean request schema keys to the exact column names expected by the baseline /predict model
FEATURE_MAPPING: Dict[str, str] = {
    "pm25": "ฝุ่น PM2.5",
    "pm10": "ฝุ่น PM10",
    "us_aqi": "ดัชนีคุณภาพอากาศ US AQI",
    "month": "เดือน",
    "temp_mean": "อุณหภูมิเฉลี่ย (°C)",
    "temp_max": "อุณหภูมิสูงสุด (°C)",
    "temp_min": "อุณหภูมิต่ำสุด (°C)",
    "rain_sum": "ปริมาณฝนรวม (mm)",
    "humidity_mean": "ความชื้นสัมพัทธ์เฉลี่ย (%)",
    "wind_speed_mean": "ความเร็วลมเฉลี่ย (km/h)",
    "wind_speed_max": "ความเร็วลมสูงสุด (km/h)",
    "wind_u": "องค์ประกอบลมแกนตะวันออก-ตะวันตก",
    "wind_v": "องค์ประกอบลมแกนเหนือ-ใต้",
    "cloud_cover_mean": "เมฆปกคลุมเฉลี่ย (%)",
    "surface_pressure_mean": "ความกดอากาศพื้นผิวเฉลี่ย (hPa)",
    "sea_level_pressure_mean": "ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)",
    "weather_code": "รหัสสภาพอากาศที่พบบ่อยสุด (wmo code)",
    "wind_direction_mean": "ทิศทางลมเฉลี่ย (°)",
    "pm25_lag_1": "pm25_lag_1",
    "pm25_lag_2": "pm25_lag_2",
    "pm25_lag_3": "pm25_lag_3",
    "pm25_lag_7": "pm25_lag_7",
    "pm25_lag_14": "pm25_lag_14",
    "pm25_rolling_3": "pm25_rolling_3",
    "pm25_rolling_7": "pm25_rolling_7",
    "pm25_rolling_14": "pm25_rolling_14",
    "month_sin": "month_sin",
    "month_cos": "month_cos",
    "weekday_number": "weekday_number",
}

# Offline meteorological fallback baselines when live Open-Meteo queries are unavailable
DISTRICT_PROFILES: Dict[str, Dict[str, float]] = {
    "Pathum Wan": {
        "pm25": 13.8,
        "temp_mean": 30.4,
        "wind_ms": 4.2,
        "wind_deg": 195.0,
        "humidity_mean": 78.0,
        "rain_sum": 1.6,
        "rmse": 4.28,
    },
    "Dusit": {
        "pm25": 21.6,
        "temp_mean": 31.1,
        "wind_ms": 3.6,
        "wind_deg": 185.0,
        "humidity_mean": 75.0,
        "rain_sum": 0.9,
        "rmse": 4.41,
    },
    "Ratchathewi": {
        "pm25": 29.4,
        "temp_mean": 32.0,
        "wind_ms": 2.8,
        "wind_deg": 210.0,
        "humidity_mean": 71.0,
        "rain_sum": 0.4,
        "rmse": 4.62,
    },
    "Bang Khen": {
        "pm25": 34.2,
        "temp_mean": 31.8,
        "wind_ms": 2.5,
        "wind_deg": 175.0,
        "humidity_mean": 70.0,
        "rain_sum": 0.2,
        "rmse": 4.58,
    },
    "Chatuchak": {
        "pm25": 43.7,
        "temp_mean": 32.6,
        "wind_ms": 2.1,
        "wind_deg": 205.0,
        "humidity_mean": 67.0,
        "rain_sum": 0.0,
        "rmse": 4.74,
    },
    "Din Daeng": {
        "pm25": 78.4,
        "temp_mean": 33.9,
        "wind_ms": 1.2,
        "wind_deg": 220.0,
        "humidity_mean": 60.0,
        "rain_sum": 0.0,
        "rmse": 5.12,
    },
    "Lat Phrao": {
        "pm25": 39.8,
        "temp_mean": 32.3,
        "wind_ms": 2.3,
        "wind_deg": 190.0,
        "humidity_mean": 68.0,
        "rain_sum": 0.1,
        "rmse": 4.69,
    },
    "Huai Khwang": {
        "pm25": 54.6,
        "temp_mean": 33.1,
        "wind_ms": 1.7,
        "wind_deg": 215.0,
        "humidity_mean": 64.0,
        "rain_sum": 0.0,
        "rmse": 4.95,
    },
    "Phaya Thai": {
        "pm25": 36.1,
        "temp_mean": 32.2,
        "wind_ms": 2.4,
        "wind_deg": 200.0,
        "humidity_mean": 69.0,
        "rain_sum": 0.2,
        "rmse": 4.65,
    },
    "Bang Na": {
        "pm25": 19.3,
        "temp_mean": 30.9,
        "wind_ms": 3.9,
        "wind_deg": 165.0,
        "humidity_mean": 77.0,
        "rain_sum": 1.2,
        "rmse": 4.35,
    },
}

CALIBRATED_ATTRIBUTION_FEATURES: List[Tuple[str, str, str, str]] = [
    ("ฝุ่น PM2.5", "Current PM2.5 baseline", "ค่าฝุ่น PM2.5 ตั้งต้น", "ug/m3"),
    ("pm25_lag_1", "Previous day PM2.5 lag", "ฝุ่นสะสมวันก่อนหน้า", "ug/m3"),
    ("pm25_rolling_3", "3 day rolling PM2.5 average", "ค่าเฉลี่ยสะสม 3 วัน", "ug/m3"),
    ("fc_boundary_layer_height_mean", "Boundary layer height", "ความสูงชั้นผสมอากาศ", "m"),
    ("fc_ความเร็วลมเฉลี่ย (km/h)", "Forecast wind speed", "ความเร็วลมคาดการณ์", "km/h"),
    ("fc_ความชื้นสัมพัทธ์เฉลี่ย (%)", "Forecast humidity", "ความชื้นสัมพัทธ์", "%"),
    ("fc_อุณหภูมิเฉลี่ย (°C)", "Forecast temperature", "อุณหภูมิอากาศ", "°C"),
    ("fc_ปริมาณฝนรวม (mm)", "Forecast rainfall", "ปริมาณน้ำฝน", "mm"),
]

BASELINE_ATTRIBUTION_FEATURES: List[Tuple[str, str, str, str]] = [
    ("ฝุ่น PM2.5", "Current PM2.5 baseline", "ค่าฝุ่น PM2.5 ตั้งต้น", "ug/m3"),
    ("pm25_lag_1", "Previous day PM2.5 lag", "ฝุ่นสะสมวันก่อนหน้า", "ug/m3"),
    ("pm25_rolling_3", "3 day rolling PM2.5 average", "ค่าเฉลี่ยสะสม 3 วัน", "ug/m3"),
    ("ความเร็วลมเฉลี่ย (km/h)", "Wind speed (km/h)", "ความเร็วลม", "km/h"),
    ("ความชื้นสัมพัทธ์เฉลี่ย (%)", "Relative humidity (%)", "ความชื้นสัมพัทธ์", "%"),
    ("อุณหภูมิเฉลี่ย (°C)", "Temperature (°C)", "อุณหภูมิอากาศ", "°C"),
    ("ปริมาณฝนรวม (mm)", "Rainfall (mm)", "ปริมาณน้ำฝน", "mm"),
]

THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]
EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
EN_MONTHS = [
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
]

model_state: Dict[str, Any] = {
    "model": None,
    "features": list(FEATURE_MAPPING.values()),
    "fill_values": {},
    "model_name": None,
    "calibrated_bundle": None,
    "evaluation_report": None,
}


def load_model_artifacts() -> None:
    """Load the baseline .joblib model, calibrated multi-horizon bundle, and evaluation report."""
    if not os.path.isfile(BASELINE_MODEL_PATH):
        raise FileNotFoundError(f"Baseline model file not found at path: {BASELINE_MODEL_PATH}")

    artifact = joblib.load(BASELINE_MODEL_PATH)
    if isinstance(artifact, dict):
        estimator = artifact.get("model")
        if estimator is None:
            raise ValueError("Loaded baseline bundle does not contain a 'model' key.")
        raw_features = artifact.get("features")
        feature_list = (
            [str(col) for col in raw_features]
            if raw_features is not None
            else list(FEATURE_MAPPING.values())
        )
        model_state["model"] = estimator
        model_state["features"] = feature_list
        model_state["fill_values"] = dict(artifact.get("fill_values", {}))
        model_state["model_name"] = artifact.get("model_name") or "Tuned Random Forest"
    else:
        feature_list = (
            [str(col) for col in artifact.feature_names_in_]
            if hasattr(artifact, "feature_names_in_")
            else list(FEATURE_MAPPING.values())
        )
        model_state["model"] = artifact
        model_state["features"] = feature_list
        model_state["fill_values"] = {}
        model_state["model_name"] = "Tuned Random Forest"

    logger.info(
        "Baseline model loaded from %s (%d features)",
        BASELINE_MODEL_PATH,
        len(model_state["features"]),
    )

    if os.path.isfile(CALIBRATED_MODEL_PATH):
        model_state["calibrated_bundle"] = joblib.load(CALIBRATED_MODEL_PATH)
        logger.info("Calibrated multi-horizon + hourly bundle loaded from %s", CALIBRATED_MODEL_PATH)
    else:
        model_state["calibrated_bundle"] = None

    if os.path.isfile(EVALUATION_REPORT_PATH):
        with open(EVALUATION_REPORT_PATH, "r", encoding="utf-8") as fh:
            model_state["evaluation_report"] = json.load(fh)
    else:
        model_state["evaluation_report"] = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize model resources at startup and warm live Bangkok snapshot."""
    try:
        load_model_artifacts()
        get_live_snapshot(force_refresh=False)
    except Exception as exc:
        logger.exception("Failed during application startup: %s", exc)
        raise
    yield
    model_state["model"] = None
    model_state["calibrated_bundle"] = None


app = FastAPI(
    title="PM2.5 Prediction API",
    description="Machine learning prediction API for Bangkok PM2.5 air quality forecasting.",
    version="2.0.0",
    lifespan=lifespan,
)

# Enable CORS for all origins so frontend clients can send requests directly
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    """Schema defining numerical weather, temporal, and PM2.5 lag inputs."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "pm25": 34.2,
                "pm10": 56.0,
                "us_aqi": 98.0,
                "month": 11,
                "temp_mean": 30.5,
                "temp_max": 34.2,
                "temp_min": 26.8,
                "rain_sum": 0.0,
                "humidity_mean": 68.0,
                "wind_speed_mean": 8.4,
                "wind_speed_max": 14.5,
                "wind_u": -1.2,
                "wind_v": 2.4,
                "cloud_cover_mean": 42.0,
                "surface_pressure_mean": 1011.5,
                "sea_level_pressure_mean": 1012.2,
                "weather_code": 2,
                "wind_direction_mean": 185.0,
                "pm25_lag_1": 31.8,
                "pm25_lag_2": 29.4,
                "pm25_lag_3": 28.0,
                "pm25_lag_7": 25.5,
                "pm25_lag_14": 24.1,
                "pm25_rolling_3": 29.7,
                "pm25_rolling_7": 27.6,
                "pm25_rolling_14": 26.0,
                "month_sin": -0.5,
                "month_cos": 0.866,
                "weekday_number": 3,
            }
        },
    )

    pm25: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("pm25", "ฝุ่น PM2.5"),
        description="Current day PM2.5 concentration (ug/m3).",
    )
    pm10: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("pm10", "ฝุ่น PM10"),
        description="Current day PM10 concentration (ug/m3).",
    )
    us_aqi: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("us_aqi", "ดัชนีคุณภาพอากาศ US AQI"),
        description="US AQI index value.",
    )
    month: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("month", "เดือน"),
        description="Calendar month number (1 to 12).",
    )
    temp_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("temp_mean", "อุณหภูมิเฉลี่ย (°C)"),
        description="Mean daily temperature in Celsius.",
    )
    temp_max: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("temp_max", "อุณหภูมิสูงสุด (°C)"),
        description="Maximum daily temperature in Celsius.",
    )
    temp_min: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("temp_min", "อุณหภูมิต่ำสุด (°C)"),
        description="Minimum daily temperature in Celsius.",
    )
    rain_sum: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("rain_sum", "ปริมาณฝนรวม (mm)"),
        description="Total daily rainfall in millimeters.",
    )
    humidity_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("humidity_mean", "ความชื้นสัมพัทธ์เฉลี่ย (%)"),
        description="Mean relative humidity percentage.",
    )
    wind_speed_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("wind_speed_mean", "ความเร็วลมเฉลี่ย (km/h)"),
        description="Mean wind speed in km/h.",
    )
    wind_speed_max: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("wind_speed_max", "ความเร็วลมสูงสุด (km/h)"),
        description="Maximum wind speed in km/h.",
    )
    wind_u: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("wind_u", "องค์ประกอบลมแกนตะวันออก-ตะวันตก"),
        description="East-west wind vector component.",
    )
    wind_v: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("wind_v", "องค์ประกอบลมแกนเหนือ-ใต้"),
        description="North-south wind vector component.",
    )
    cloud_cover_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("cloud_cover_mean", "เมฆปกคลุมเฉลี่ย (%)"),
        description="Mean cloud cover percentage.",
    )
    surface_pressure_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices(
            "surface_pressure_mean", "ความกดอากาศพื้นผิวเฉลี่ย (hPa)"
        ),
        description="Mean surface atmospheric pressure in hPa.",
    )
    sea_level_pressure_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices(
            "sea_level_pressure_mean", "ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)"
        ),
        description="Mean sea-level atmospheric pressure in hPa.",
    )
    weather_code: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices(
            "weather_code", "รหัสสภาพอากาศที่พบบ่อยสุด (wmo code)"
        ),
        description="Dominant WMO weather condition code.",
    )
    wind_direction_mean: Optional[float] = Field(
        default=None,
        validation_alias=AliasChoices("wind_direction_mean", "ทิศทางลมเฉลี่ย (°)"),
        description="Mean wind direction in degrees.",
    )
    pm25_lag_1: Optional[float] = Field(default=None, description="PM2.5 lag 1 day.")
    pm25_lag_2: Optional[float] = Field(default=None, description="PM2.5 lag 2 days.")
    pm25_lag_3: Optional[float] = Field(default=None, description="PM2.5 lag 3 days.")
    pm25_lag_7: Optional[float] = Field(default=None, description="PM2.5 lag 7 days.")
    pm25_lag_14: Optional[float] = Field(default=None, description="PM2.5 lag 14 days.")
    pm25_rolling_3: Optional[float] = Field(
        default=None, description="3 day rolling average PM2.5."
    )
    pm25_rolling_7: Optional[float] = Field(
        default=None, description="7 day rolling average PM2.5."
    )
    pm25_rolling_14: Optional[float] = Field(
        default=None, description="14 day rolling average PM2.5."
    )
    month_sin: Optional[float] = Field(
        default=None, description="Cyclical sine encoding of month."
    )
    month_cos: Optional[float] = Field(
        default=None, description="Cyclical cosine encoding of month."
    )
    weekday_number: Optional[float] = Field(
        default=None, description="Day of week numeric index."
    )


def build_feature_dataframe(payload: PredictRequest) -> pd.DataFrame:
    """Convert validated request payload into an ordered single-row DataFrame."""
    payload_dict = payload.model_dump()
    fill_values: Dict[str, Any] = model_state.get("fill_values", {})
    expected_features: List[str] = model_state["features"]

    row_by_model_col: Dict[str, float] = {}
    for field_name, model_col in FEATURE_MAPPING.items():
        value = payload_dict.get(field_name)
        if value is not None:
            if not math.isfinite(float(value)):
                raise ValueError(f"Non-finite numeric value provided for '{field_name}'.")
            row_by_model_col[model_col] = float(value)

    ordered_row: Dict[str, float] = {}
    for col in expected_features:
        if col in row_by_model_col:
            ordered_row[col] = row_by_model_col[col]
        elif col in fill_values and fill_values[col] is not None:
            ordered_row[col] = float(fill_values[col])
        else:
            raise ValueError(f"Missing required model feature '{col}' with no default value.")

    return pd.DataFrame([ordered_row], columns=expected_features)


def _offline_daily_row(district: str, target_dt: datetime) -> Dict[str, float]:
    """Build fallback daily meteorological row when live API snapshot is unavailable."""
    profile = DISTRICT_PROFILES[district]
    pm25 = profile["pm25"]
    wind_kmh = profile["wind_ms"] * 3.6
    wind_u, wind_v = _compute_wind_components(wind_kmh, profile["wind_deg"])
    month_angle = 2.0 * math.pi * (target_dt.month / 12.0)

    return {
        "pm25": pm25,
        "pm10": round(pm25 * 1.48, 2),
        "us_aqi": _pm25_to_us_aqi(pm25),
        "temp_mean": profile["temp_mean"],
        "temp_max": round(profile["temp_mean"] + 3.6, 2),
        "temp_min": round(profile["temp_mean"] - 3.4, 2),
        "rain_sum": profile["rain_sum"],
        "humidity_mean": profile["humidity_mean"],
        "wind_speed_mean": round(wind_kmh, 2),
        "wind_speed_max": round(wind_kmh * 1.65, 2),
        "wind_u": wind_u,
        "wind_v": wind_v,
        "cloud_cover_mean": 45.0,
        "surface_pressure_mean": 1011.2 if pm25 > 35 else 1009.1,
        "sea_level_pressure_mean": 1012.2 if pm25 > 35 else 1010.1,
        "weather_code": 2.0,
        "wind_direction_mean": profile["wind_deg"],
        "boundary_layer_height_mean": 540.0 if pm25 > 35 else 780.0,
        "boundary_layer_height_min": 210.0 if pm25 > 35 else 350.0,
        "month": float(target_dt.month),
        "month_sin": math.sin(month_angle),
        "month_cos": math.cos(month_angle),
        "weekday_number": float(target_dt.weekday()),
    }


def _build_calibrated_day_row(
    district: str,
    dist_idx: int,
    now_bkk: datetime,
    target_dt: datetime,
    station_snap: Optional[Dict[str, Any]],
) -> Dict[str, float]:
    """Assemble base day features plus target-day forecasted weather features."""
    today_str = now_bkk.strftime("%Y-%m-%d")
    target_str = target_dt.strftime("%Y-%m-%d")
    meta = STATION_META_BY_ID[district]

    if station_snap is not None:
        wx_daily = station_snap["wx_daily"]
        aq_daily = station_snap["aq_daily"]
        base_wx = wx_daily.get(today_str) or next(iter(wx_daily.values()))
        target_wx = wx_daily.get(target_str) or base_wx

        current_pm25 = float(station_snap["current_pm25"])
        today_pm25 = float(aq_daily.get(today_str, {}).get("pm25", current_pm25))
        today_pm10 = float(aq_daily.get(today_str, {}).get("pm10", current_pm25 * 1.35))
        today_aqi = float(aq_daily.get(today_str, {}).get("us_aqi", _pm25_to_us_aqi(today_pm25)))

        def past_pm25(days_back: int) -> float:
            key = (now_bkk.date() - timedelta(days=days_back)).isoformat()
            return float(aq_daily.get(key, {}).get("pm25", today_pm25))

        hist_14 = [past_pm25(d) for d in range(1, 15)]
    else:
        base_wx = _offline_daily_row(district, now_bkk)
        target_wx = _offline_daily_row(district, target_dt)
        today_pm25 = base_wx["pm25"]
        today_pm10 = base_wx["pm10"]
        today_aqi = base_wx["us_aqi"]
        hist_14 = [round(today_pm25 * (0.96 - 0.012 * idx), 2) for idx in range(14)]

    base_month_angle = 2.0 * math.pi * (now_bkk.month / 12.0)
    target_month_angle = 2.0 * math.pi * (target_dt.month / 12.0)

    row: Dict[str, float] = {
        "ฝุ่น PM2.5": today_pm25,
        "ฝุ่น PM10": today_pm10,
        "ดัชนีคุณภาพอากาศ US AQI": today_aqi,
        "เดือน": float(now_bkk.month),
        "อุณหภูมิเฉลี่ย (°C)": base_wx["temp_mean"],
        "อุณหภูมิสูงสุด (°C)": base_wx["temp_max"],
        "อุณหภูมิต่ำสุด (°C)": base_wx["temp_min"],
        "ปริมาณฝนรวม (mm)": base_wx["rain_sum"],
        "ความชื้นสัมพัทธ์เฉลี่ย (%)": base_wx["humidity_mean"],
        "ความเร็วลมเฉลี่ย (km/h)": base_wx["wind_speed_mean"],
        "ความเร็วลมสูงสุด (km/h)": base_wx["wind_speed_max"],
        "องค์ประกอบลมแกนตะวันออก-ตะวันตก": base_wx["wind_u"],
        "องค์ประกอบลมแกนเหนือ-ใต้": base_wx["wind_v"],
        "เมฆปกคลุมเฉลี่ย (%)": base_wx["cloud_cover_mean"],
        "ความกดอากาศพื้นผิวเฉลี่ย (hPa)": base_wx["surface_pressure_mean"],
        "ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)": base_wx["sea_level_pressure_mean"],
        "รหัสสภาพอากาศที่พบบ่อยสุด (wmo code)": base_wx["weather_code"],
        "ทิศทางลมเฉลี่ย (°)": base_wx["wind_direction_mean"],
        "pm25_lag_1": hist_14[0],
        "pm25_lag_2": hist_14[1],
        "pm25_lag_3": hist_14[2],
        "pm25_lag_7": hist_14[6],
        "pm25_lag_14": hist_14[13],
        "pm25_rolling_3": round(sum(hist_14[:3]) / 3.0, 2),
        "pm25_rolling_7": round(sum(hist_14[:7]) / 7.0, 2),
        "pm25_rolling_14": round(sum(hist_14) / 14.0, 2),
        "month_sin": math.sin(base_month_angle),
        "month_cos": math.cos(base_month_angle),
        "weekday_number": float(now_bkk.weekday()),
        "boundary_layer_height_mean": base_wx["boundary_layer_height_mean"],
        "boundary_layer_height_min": base_wx["boundary_layer_height_min"],
        "temp_range": round(base_wx["temp_max"] - base_wx["temp_min"], 2),
        "is_roadside": float(meta["is_roadside"]),
        "district_idx": float(dist_idx),
        "fc_อุณหภูมิเฉลี่ย (°C)": target_wx["temp_mean"],
        "fc_ปริมาณฝนรวม (mm)": target_wx["rain_sum"],
        "fc_ความชื้นสัมพัทธ์เฉลี่ย (%)": target_wx["humidity_mean"],
        "fc_ความเร็วลมเฉลี่ย (km/h)": target_wx["wind_speed_mean"],
        "fc_องค์ประกอบลมแกนตะวันออก-ตะวันตก": target_wx["wind_u"],
        "fc_องค์ประกอบลมแกนเหนือ-ใต้": target_wx["wind_v"],
        "fc_boundary_layer_height_mean": target_wx["boundary_layer_height_mean"],
        "fc_boundary_layer_height_min": target_wx["boundary_layer_height_min"],
        "fc_month_sin": math.sin(target_month_angle),
        "fc_month_cos": math.cos(target_month_angle),
    }
    return row


def _build_hourly_ml_forecast(
    district: str,
    dist_idx: int,
    horizon: Literal["24h", "48h"],
    now_bkk: datetime,
    station_snap: Optional[Dict[str, Any]],
    bundle: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Run autoregressive multi-step hourly ML forecasting using real hourly weather."""
    hourly_model = bundle["hourly_model"]
    hourly_features: List[str] = bundle["hourly_features"]
    hourly_fill: Dict[str, Any] = bundle.get("hourly_fill_values", {})
    meta = STATION_META_BY_ID[district]

    if station_snap is not None:
        wx_hourly = station_snap["wx_hourly"]
        aq_hourly = station_snap["aq_hourly"]
        current_pm25 = float(station_snap["current_pm25"])
    else:
        wx_hourly = {}
        aq_hourly = {}
        current_pm25 = float(DISTRICT_PROFILES[district]["pm25"])

    # Build 24-hour historical PM2.5 buffer ordered from t-24h up to t-0h
    pm_buffer: List[float] = []
    for back_h in range(24, -1, -1):
        ts_key = (now_bkk - timedelta(hours=back_h)).strftime("%Y-%m-%dT%H:00")
        val = aq_hourly.get(ts_key, current_pm25 if back_h == 0 else None)
        if val is None:
            val = pm_buffer[-1] if pm_buffer else current_pm25
        pm_buffer.append(float(val))

    hour_count = 24 if horizon == "24h" else 48
    hourly_points: List[Dict[str, Any]] = []

    for step in range(hour_count):
        point_dt = now_bkk + timedelta(hours=step)
        ts_key = point_dt.strftime("%Y-%m-%dT%H:00")

        if step == 0:
            pred_val = round(current_pm25, 1)
        else:
            prev_dt = now_bkk + timedelta(hours=step - 1)
            prev_key = prev_dt.strftime("%Y-%m-%dT%H:00")
            wx_row = wx_hourly.get(prev_key, {})

            month_angle = 2.0 * math.pi * (prev_dt.month / 12.0)
            hour_angle = 2.0 * math.pi * (prev_dt.hour / 24.0)
            is_rush = 1.0 if prev_dt.hour in (7, 8, 9, 17, 18, 19, 20) else 0.0

            feature_row = {
                "pm25_current": pm_buffer[-1],
                "pm25_lag_1h": pm_buffer[-2],
                "pm25_lag_2h": pm_buffer[-3],
                "pm25_lag_3h": pm_buffer[-4],
                "pm25_lag_6h": pm_buffer[-7],
                "pm25_lag_12h": pm_buffer[-13],
                "pm25_lag_24h": pm_buffer[-25],
                "pm25_roll_6h": sum(pm_buffer[-6:]) / 6.0,
                "pm25_roll_24h": sum(pm_buffer[-24:]) / 24.0,
                "temperature_2m": float(wx_row.get("temperature_2m", hourly_fill.get("temperature_2m", 29.0))),
                "relative_humidity_2m": float(wx_row.get("relative_humidity_2m", hourly_fill.get("relative_humidity_2m", 72.0))),
                "rain": float(wx_row.get("rain", hourly_fill.get("rain", 0.0))),
                "wind_speed_10m": float(wx_row.get("wind_speed_10m", hourly_fill.get("wind_speed_10m", 8.0))),
                "wind_u": float(wx_row.get("wind_u", hourly_fill.get("wind_u", 0.0))),
                "wind_v": float(wx_row.get("wind_v", hourly_fill.get("wind_v", 0.0))),
                "cloud_cover": float(wx_row.get("cloud_cover", hourly_fill.get("cloud_cover", 50.0))),
                "surface_pressure": float(wx_row.get("surface_pressure", hourly_fill.get("surface_pressure", 1010.0))),
                "pressure_msl": float(wx_row.get("pressure_msl", hourly_fill.get("pressure_msl", 1011.0))),
                "weather_code": float(wx_row.get("weather_code", hourly_fill.get("weather_code", 3.0))),
                "boundary_layer_height": float(wx_row.get("boundary_layer_height", hourly_fill.get("boundary_layer_height", 600.0))),
                "hour_sin": math.sin(hour_angle),
                "hour_cos": math.cos(hour_angle),
                "weekday_number": float(prev_dt.weekday()),
                "month_sin": math.sin(month_angle),
                "month_cos": math.cos(month_angle),
                "is_rush_hour": is_rush,
                "is_roadside": float(meta["is_roadside"]),
                "district_idx": float(dist_idx),
            }
            df_step = pd.DataFrame([feature_row], columns=hourly_features)
            raw_pred = float(hourly_model.predict(df_step)[0])
            pred_val = round(max(2.0, raw_pred), 1)
            pm_buffer.append(pred_val)

        # Include Open-Meteo observed/nowcast curve on first 6 steps for visual comparison
        actual_val: Optional[float] = None
        if step < 6:
            obs = aq_hourly.get(ts_key)
            actual_val = round(float(obs), 1) if obs is not None else round(pred_val, 1)

        hh = f"{point_dt.hour:02d}"
        hour_label = f"Day 2 {hh}:00" if horizon == "48h" and step >= 24 else f"{hh}:00"
        hourly_points.append(
            {
                "hour": hour_label,
                "timestamp": point_dt.isoformat(),
                "actual": actual_val,
                "predicted": pred_val,
            }
        )

    return hourly_points


def _build_weekly_calibrated_forecast(
    now_bkk: datetime,
    snapshot: Optional[Dict[str, Any]],
    bundle: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Run Direct Multi-Horizon models (t+1..t+7) across all 10 Bangkok stations."""
    daily_models: Dict[int, Any] = bundle["daily_models"]
    daily_features: List[str] = bundle["daily_features"]
    stations_map = snapshot["stations"] if snapshot else {}

    weekly_points: List[Dict[str, Any]] = []
    station_ids = [item["id"] for item in STATION_METADATA]

    for day_offset in range(7):
        target_dt = now_bkk + timedelta(days=day_offset)
        display_wd = (target_dt.weekday() + 1) % 7
        day_th = "วันนี้" if day_offset == 0 else THAI_WEEKDAYS[display_wd]
        day_en = "Today" if day_offset == 0 else EN_WEEKDAYS[display_wd]
        date_label = f"{target_dt.day} {EN_MONTHS[target_dt.month - 1]}"

        if day_offset == 0:
            current_vals = [
                float(stations_map[sid]["current_pm25"])
                if sid in stations_map
                else float(DISTRICT_PROFILES[sid]["pm25"])
                for sid in station_ids
            ]
            avg_val = round(sum(current_vals) / len(current_vals), 1)
            peak_val = round(max(current_vals), 1)
        else:
            batch_rows = [
                _build_calibrated_day_row(
                    sid,
                    dist_idx,
                    now_bkk,
                    target_dt,
                    stations_map.get(sid),
                )
                for dist_idx, sid in enumerate(station_ids)
            ]
            batch_df = pd.DataFrame(batch_rows, columns=daily_features)
            model_h = daily_models[day_offset]
            day_preds = [max(2.0, float(v)) for v in model_h.predict(batch_df)]
            avg_val = round(sum(day_preds) / len(day_preds), 1)
            peak_val = round(max(day_preds), 1)

        weekly_points.append(
            {
                "dayIndex": day_offset,
                "dayTh": day_th,
                "dayEn": day_en,
                "dateLabel": date_label,
                "predictedPM25": avg_val,
                "peakPM25": peak_val,
            }
        )

    return weekly_points


def _build_legacy_forecast(
    district: str,
    horizon: Literal["24h", "48h"],
    now_bkk: datetime,
) -> Dict[str, Any]:
    """Fallback forecast path using baseline PM25_model_bundle.joblib when calibrated bundle is absent."""
    model = model_state["model"]
    features: List[str] = model_state["features"]
    fill_values: Dict[str, Any] = model_state.get("fill_values", {})

    def offline_row(d_name: str, dt: datetime) -> Dict[str, float]:
        wx = _offline_daily_row(d_name, dt)
        pm25 = wx["pm25"]
        return {
            col: float(fill_values.get(col, 0.0)) for col in features
        } | {
            "ฝุ่น PM2.5": pm25,
            "ฝุ่น PM10": wx["pm10"],
            "ดัชนีคุณภาพอากาศ US AQI": wx["us_aqi"],
            "เดือน": wx["month"],
            "อุณหภูมิเฉลี่ย (°C)": wx["temp_mean"],
            "อุณหภูมิสูงสุด (°C)": wx["temp_max"],
            "อุณหภูมิต่ำสุด (°C)": wx["temp_min"],
            "ปริมาณฝนรวม (mm)": wx["rain_sum"],
            "ความชื้นสัมพัทธ์เฉลี่ย (%)": wx["humidity_mean"],
            "ความเร็วลมเฉลี่ย (km/h)": wx["wind_speed_mean"],
            "ความเร็วลมสูงสุด (km/h)": wx["wind_speed_max"],
            "องค์ประกอบลมแกนตะวันออก-ตะวันตก": wx["wind_u"],
            "องค์ประกอบลมแกนเหนือ-ใต้": wx["wind_v"],
            "ความกดอากาศพื้นผิวเฉลี่ย (hPa)": wx["surface_pressure_mean"],
            "ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)": wx["sea_level_pressure_mean"],
            "ทิศทางลมเฉลี่ย (°)": wx["wind_direction_mean"],
            "pm25_lag_1": round(pm25 * 0.94, 2),
            "pm25_lag_2": round(pm25 * 0.90, 2),
            "pm25_lag_3": round(pm25 * 0.87, 2),
            "pm25_lag_7": round(pm25 * 0.82, 2),
            "pm25_lag_14": round(pm25 * 0.78, 2),
            "pm25_rolling_3": round(pm25 * 0.91, 2),
            "pm25_rolling_7": round(pm25 * 0.86, 2),
            "pm25_rolling_14": round(pm25 * 0.82, 2),
            "month_sin": wx["month_sin"],
            "month_cos": wx["month_cos"],
            "weekday_number": wx["weekday_number"],
        }

    base_row = offline_row(district, now_bkk)
    day1_pred = float(model.predict(pd.DataFrame([base_row], columns=features))[0])

    batch_rows = [base_row]
    for col, _, _, _ in BASELINE_ATTRIBUTION_FEATURES:
        perturbed = dict(base_row)
        perturbed[col] = float(fill_values.get(col, base_row[col]))
        batch_rows.append(perturbed)

    batch_preds = [float(v) for v in model.predict(pd.DataFrame(batch_rows, columns=features))]
    shap_items = sorted(
        [
            {
                "feature": label_en,
                "featureTh": label_th,
                "value": round(day1_pred - batch_preds[idx + 1], 2),
                "unit": unit,
            }
            for idx, (_, label_en, label_th, unit) in enumerate(BASELINE_ATTRIBUTION_FEATURES)
        ],
        key=lambda item: abs(item["value"]),
        reverse=True,
    )

    current_pm25 = DISTRICT_PROFILES[district]["pm25"]
    hour_count = 24 if horizon == "24h" else 48
    hourly = []
    for step in range(hour_count):
        point_dt = now_bkk + timedelta(hours=step)
        anchor = current_pm25 + (day1_pred - current_pm25) * (step / max(1, hour_count - 1))
        val = round(current_pm25 if step == 0 else max(4.0, anchor), 1)
        hh = f"{point_dt.hour:02d}"
        hourly.append(
            {
                "hour": f"Day 2 {hh}:00" if horizon == "48h" and step >= 24 else f"{hh}:00",
                "timestamp": point_dt.isoformat(),
                "actual": val if step < 6 else None,
                "predicted": val,
            }
        )

    peak_point = max(hourly, key=lambda item: item["predicted"])
    weekly_points = []
    for d_off in range(7):
        t_dt = now_bkk + timedelta(days=d_off)
        wd = (t_dt.weekday() + 1) % 7
        weekly_points.append(
            {
                "dayIndex": d_off,
                "dayTh": "วันนี้" if d_off == 0 else THAI_WEEKDAYS[wd],
                "dayEn": "Today" if d_off == 0 else EN_WEEKDAYS[wd],
                "dateLabel": f"{t_dt.day} {EN_MONTHS[t_dt.month - 1]}",
                "predictedPM25": round(current_pm25 if d_off == 0 else day1_pred, 1),
                "peakPM25": round(day1_pred + 4.0, 1),
            }
        )

    return {
        "district": district,
        "horizon": horizon,
        "modelName": model_state.get("model_name") or "Tuned Random Forest",
        "dataSource": "offline_baseline",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "currentPM25": round(current_pm25, 1),
        "predictedPeak": peak_point["predicted"],
        "predictedPeakHour": peak_point["hour"],
        "topShapFactor": shap_items[0]["feature"] if shap_items else "Current PM2.5 baseline",
        "modelRMSE": DISTRICT_PROFILES[district]["rmse"],
        "hourly": hourly,
        "shap": shap_items,
        "weekly": weekly_points,
    }


@app.get("/health")
def health_check() -> Dict[str, Any]:
    """Return service health, loaded model metadata, and live data readiness."""
    calibrated = model_state.get("calibrated_bundle")
    return {
        "status": "ok" if model_state["model"] is not None else "unavailable",
        "model_loaded": model_state["model"] is not None,
        "calibrated_bundle_loaded": calibrated is not None,
        "model_name": (calibrated.get("model_name") if calibrated else model_state.get("model_name")),
        "feature_count": len(model_state.get("features", [])),
    }


@app.get("/api/v1/evaluation")
def get_evaluation_report() -> Dict[str, Any]:
    """Return chronological backtest and multi-horizon validation metrics."""
    report = model_state.get("evaluation_report")
    if report is None:
        raise HTTPException(status_code=404, detail="Evaluation report has not been generated.")
    return report


@app.get("/api/v1/stations")
def get_live_stations(refresh: bool = Query(default=False, description="Force refresh Open-Meteo snapshot.")) -> Dict[str, Any]:
    """Return current PM2.5, temperature, and wind conditions for all 10 Bangkok stations."""
    snapshot = get_live_snapshot(force_refresh=refresh)
    stations_out: List[Dict[str, Any]] = []

    if snapshot is not None:
        for meta in STATION_METADATA:
            sid = meta["id"]
            st = snapshot["stations"][sid]
            stations_out.append(
                {
                    "id": sid,
                    "currentPM25": round(float(st["current_pm25"]), 1),
                    "temperatureC": round(float(st["current_temp_c"]), 1),
                    "windSpeedMs": round(float(st["current_wind_ms"]), 1),
                    "windDirectionDeg": round(float(st["current_wind_deg"]), 0),
                }
            )
        return {
            "source": snapshot["source"],
            "fetchedAt": snapshot["fetched_at"],
            "stations": stations_out,
        }

    for meta in STATION_METADATA:
        sid = meta["id"]
        prof = DISTRICT_PROFILES[sid]
        stations_out.append(
            {
                "id": sid,
                "currentPM25": prof["pm25"],
                "temperatureC": prof["temp_mean"],
                "windSpeedMs": prof["wind_ms"],
                "windDirectionDeg": prof["wind_deg"],
            }
        )
    return {
        "source": "offline_baseline",
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "stations": stations_out,
    }


@app.post("/predict")
def predict(request: PredictRequest) -> Dict[str, float]:
    """Run PM2.5 inference from weather and lag features using the baseline .joblib model."""
    model = model_state.get("model")
    if model is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")

    try:
        input_df = build_feature_dataframe(request)
        raw_prediction = model.predict(input_df)
        predicted_value = float(raw_prediction[0])
        return {"prediction": round(predicted_value, 4)}
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError) as exc:
        logger.warning("Invalid prediction input: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Model prediction failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Internal error occurred while generating prediction.",
        ) from exc


@app.get("/api/v1/forecast")
def get_district_forecast(
    district: str = Query(default="Bang Khen", description="Bangkok district name."),
    horizon: Literal["24h", "48h"] = Query(default="24h", description="Forecast window."),
    refresh: bool = Query(default=False, description="Force refresh live weather and air quality."),
) -> Dict[str, Any]:
    """Generate live multi-horizon daily + hourly ML forecasts and feature sensitivities."""
    if model_state.get("model") is None:
        raise HTTPException(status_code=503, detail="Prediction model is not loaded.")

    if district not in DISTRICT_PROFILES:
        raise HTTPException(status_code=400, detail=f"Unsupported district: {district}")

    try:
        now_bkk = datetime.now(BKK_TZ).replace(minute=0, second=0, microsecond=0)
        calibrated = model_state.get("calibrated_bundle")

        if calibrated is None:
            return _build_legacy_forecast(district, horizon, now_bkk)

        snapshot = get_live_snapshot(force_refresh=refresh)
        station_snap = snapshot["stations"].get(district) if snapshot else None
        dist_idx = next(
            idx for idx, meta in enumerate(STATION_METADATA) if meta["id"] == district
        )

        daily_models = calibrated["daily_models"]
        daily_features: List[str] = calibrated["daily_features"]
        daily_fill: Dict[str, Any] = calibrated.get("daily_fill_values", {})

        # Compute Day+1 baseline prediction and local feature sensitivity attributions
        tomorrow_dt = now_bkk + timedelta(days=1)
        base_day_row = _build_calibrated_day_row(
            district, dist_idx, now_bkk, tomorrow_dt, station_snap
        )
        batch_rows = [base_day_row]
        for col, _, _, _ in CALIBRATED_ATTRIBUTION_FEATURES:
            perturbed = dict(base_day_row)
            perturbed[col] = float(daily_fill.get(col, base_day_row[col]))
            batch_rows.append(perturbed)

        batch_preds = [
            float(v)
            for v in daily_models[1].predict(pd.DataFrame(batch_rows, columns=daily_features))
        ]
        day1_pred = batch_preds[0]

        shap_items: List[Dict[str, Any]] = []
        for idx, (_, label_en, label_th, unit) in enumerate(CALIBRATED_ATTRIBUTION_FEATURES):
            shap_items.append(
                {
                    "feature": label_en,
                    "featureTh": label_th,
                    "value": round(day1_pred - batch_preds[idx + 1], 2),
                    "unit": unit,
                }
            )
        shap_items.sort(key=lambda item: abs(item["value"]), reverse=True)

        hourly = _build_hourly_ml_forecast(
            district, dist_idx, horizon, now_bkk, station_snap, calibrated
        )
        weekly = _build_weekly_calibrated_forecast(now_bkk, snapshot, calibrated)

        current_pm25 = (
            float(station_snap["current_pm25"])
            if station_snap is not None
            else float(DISTRICT_PROFILES[district]["pm25"])
        )
        peak_point = max(hourly, key=lambda item: item["predicted"])
        top_factor = shap_items[0]["feature"] if shap_items else "Current PM2.5 baseline"

        district_metrics = calibrated.get("district_metrics", {})
        measured_rmse = float(
            district_metrics.get(district, {}).get("rmse")
            or DISTRICT_PROFILES[district]["rmse"]
        )

        return {
            "district": district,
            "horizon": horizon,
            "modelName": calibrated.get("model_name") or "Bangkok Multi Horizon GBDT",
            "dataSource": snapshot["source"] if snapshot else "offline_baseline",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "currentPM25": round(current_pm25, 1),
            "predictedPeak": peak_point["predicted"],
            "predictedPeakHour": peak_point["hour"],
            "topShapFactor": top_factor,
            "modelRMSE": round(measured_rmse, 2),
            "hourly": hourly,
            "shap": shap_items,
            "weekly": weekly,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to generate forecast for %s: %s", district, exc)
        raise HTTPException(
            status_code=500,
            detail="Internal error occurred while generating district forecast.",
        ) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
