"""Chronological backtesting and multi-horizon + hourly model training for Bangkok PM2.5."""

import os

# Limit native BLAS thread allocation to prevent memory reservation failures on Windows
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from datetime import datetime, timedelta, timezone
import json
import math
import sys
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse
import urllib.request

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    ExtraTreesRegressor,
    HistGradientBoostingRegressor,
    VotingRegressor,
)
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from live_data import (  # noqa: E402
    BKK_TZ,
    STATION_METADATA,
    _apply_station_adjustment,
    _compute_wind_components,
    _pm25_to_us_aqi,
)

DATA_DIR = os.path.join(BACKEND_DIR, "data")
MODELS_DIR = os.path.join(BACKEND_DIR, "models")
BASELINE_BUNDLE_PATH = os.path.join(MODELS_DIR, "PM25_model_bundle.joblib")
CALIBRATED_BUNDLE_PATH = os.path.join(MODELS_DIR, "PM25_bkk_calibrated_bundle.joblib")
REPORT_PATH = os.path.join(MODELS_DIR, "evaluation_report.json")
DAILY_CSV_PATH = os.path.join(DATA_DIR, "bangkok_daily_history.csv")
HOURLY_CSV_PATH = os.path.join(DATA_DIR, "bangkok_hourly_history.csv")

OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

DAILY_MODEL_FEATURES: List[str] = [
    "ฝุ่น PM2.5",
    "ฝุ่น PM10",
    "ดัชนีคุณภาพอากาศ US AQI",
    "เดือน",
    "อุณหภูมิเฉลี่ย (°C)",
    "อุณหภูมิสูงสุด (°C)",
    "อุณหภูมิต่ำสุด (°C)",
    "ปริมาณฝนรวม (mm)",
    "ความชื้นสัมพัทธ์เฉลี่ย (%)",
    "ความเร็วลมเฉลี่ย (km/h)",
    "ความเร็วลมสูงสุด (km/h)",
    "องค์ประกอบลมแกนตะวันออก-ตะวันตก",
    "องค์ประกอบลมแกนเหนือ-ใต้",
    "เมฆปกคลุมเฉลี่ย (%)",
    "ความกดอากาศพื้นผิวเฉลี่ย (hPa)",
    "ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)",
    "รหัสสภาพอากาศที่พบบ่อยสุด (wmo code)",
    "ทิศทางลมเฉลี่ย (°)",
    "pm25_lag_1",
    "pm25_lag_2",
    "pm25_lag_3",
    "pm25_lag_7",
    "pm25_lag_14",
    "pm25_rolling_3",
    "pm25_rolling_7",
    "pm25_rolling_14",
    "month_sin",
    "month_cos",
    "weekday_number",
    "boundary_layer_height_mean",
    "boundary_layer_height_min",
    "temp_range",
    "is_roadside",
    "district_idx",
]

HOURLY_MODEL_FEATURES: List[str] = [
    "pm25_current",
    "pm25_lag_1h",
    "pm25_lag_2h",
    "pm25_lag_3h",
    "pm25_lag_6h",
    "pm25_lag_12h",
    "pm25_lag_24h",
    "pm25_roll_6h",
    "pm25_roll_24h",
    "temperature_2m",
    "relative_humidity_2m",
    "rain",
    "wind_speed_10m",
    "wind_u",
    "wind_v",
    "cloud_cover",
    "surface_pressure",
    "pressure_msl",
    "weather_code",
    "boundary_layer_height",
    "hour_sin",
    "hour_cos",
    "weekday_number",
    "month_sin",
    "month_cos",
    "is_rush_hour",
    "is_roadside",
    "district_idx",
]

TARGET_DAY_WEATHER_COLS: List[str] = [
    "อุณหภูมิเฉลี่ย (°C)",
    "ปริมาณฝนรวม (mm)",
    "ความชื้นสัมพัทธ์เฉลี่ย (%)",
    "ความเร็วลมเฉลี่ย (km/h)",
    "องค์ประกอบลมแกนตะวันออก-ตะวันตก",
    "องค์ประกอบลมแกนเหนือ-ใต้",
    "boundary_layer_height_mean",
    "boundary_layer_height_min",
    "month_sin",
    "month_cos",
]

TARGET_DAILY_MODEL_FEATURES: List[str] = DAILY_MODEL_FEATURES + [
    f"fc_{col}" for col in TARGET_DAY_WEATHER_COLS
]


def fetch_json(base_url: str, params: Dict[str, Any], timeout: float = 60.0) -> Any:
    """Fetch JSON from an Open-Meteo endpoint with simple retry handling."""
    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "PM25SentinelTrainer/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_err = exc
            if attempt < 2:
                print(f"Retrying request ({attempt + 1}/2) after error: {exc}")
    raise RuntimeError(f"Failed after retries: {last_err}") from last_err


def fetch_or_load_datasets(days: int = 365) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Download 365 days of hourly weather and air quality for all 10 Bangkok stations."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.isfile(DAILY_CSV_PATH) and os.path.isfile(HOURLY_CSV_PATH):
        daily_df = pd.read_csv(DAILY_CSV_PATH)
        hourly_df = pd.read_csv(HOURLY_CSV_PATH)
        if len(daily_df) >= 2500 and len(hourly_df) >= 60000:
            print(f"Loaded cached datasets: daily={len(daily_df)} rows, hourly={len(hourly_df)} rows")
            return daily_df, hourly_df

    today_bkk = datetime.now(BKK_TZ).date()
    start_date = (today_bkk - timedelta(days=days)).isoformat()
    mid_date = (today_bkk - timedelta(days=days // 2)).isoformat()
    mid_next = (today_bkk - timedelta(days=(days // 2) - 1)).isoformat()
    archive_end = (today_bkk - timedelta(days=6)).isoformat()
    yesterday = (today_bkk - timedelta(days=1)).isoformat()

    hourly_wx_vars = (
        "temperature_2m,relative_humidity_2m,rain,wind_speed_10m,"
        "wind_direction_10m,cloud_cover,surface_pressure,pressure_msl,"
        "weather_code,boundary_layer_height"
    )

    print(f"Fetching Open-Meteo historical data ({start_date} to {yesterday}) across Bangkok zones...")

    # Download regional weather and air quality for North and Central-South Bangkok grids
    zone_coords = {
        "north": (13.84, 100.58),
        "central": (13.74, 100.55),
    }
    zone_raw: Dict[str, Tuple[pd.DataFrame, pd.DataFrame]] = {}
    for zone_name, (z_lat, z_lon) in zone_coords.items():
        print(f"  Downloading {zone_name} Bangkok grid ({z_lat}, {z_lon})...")
        arch_part1 = fetch_json(
            OPEN_METEO_ARCHIVE_URL,
            {
                "latitude": z_lat,
                "longitude": z_lon,
                "start_date": start_date,
                "end_date": mid_date,
                "hourly": hourly_wx_vars,
                "timezone": "Asia/Bangkok",
            },
        )
        arch_part2 = fetch_json(
            OPEN_METEO_ARCHIVE_URL,
            {
                "latitude": z_lat,
                "longitude": z_lon,
                "start_date": mid_next,
                "end_date": archive_end,
                "hourly": hourly_wx_vars,
                "timezone": "Asia/Bangkok",
            },
        )
        recent_item = fetch_json(
            OPEN_METEO_FORECAST_URL,
            {
                "latitude": z_lat,
                "longitude": z_lon,
                "hourly": hourly_wx_vars,
                "past_days": 8,
                "forecast_days": 1,
                "timezone": "Asia/Bangkok",
            },
        )
        aq_item = fetch_json(
            OPEN_METEO_AIR_QUALITY_URL,
            {
                "latitude": z_lat,
                "longitude": z_lon,
                "start_date": start_date,
                "end_date": yesterday,
                "hourly": "pm2_5,pm10,us_aqi",
                "timezone": "Asia/Bangkok",
            },
        )

        df_wx = pd.concat(
            [
                pd.DataFrame(arch_part1["hourly"]),
                pd.DataFrame(arch_part2["hourly"]),
                pd.DataFrame(recent_item["hourly"]),
            ],
            ignore_index=True,
        ).drop_duplicates(subset=["time"], keep="last")
        df_aq = pd.DataFrame(aq_item["hourly"])
        zone_raw[zone_name] = (df_wx, df_aq)

    hourly_frames: List[pd.DataFrame] = []
    daily_frames: List[pd.DataFrame] = []

    for dist_idx, meta in enumerate(STATION_METADATA):
        station_id = meta["id"]
        zone_key = "north" if float(meta["lat"]) >= 13.79 else "central"
        df_wx_zone, df_aq_zone = zone_raw[zone_key]
        df_wx = df_wx_zone.copy()
        df_aq = df_aq_zone.copy()
        merged = pd.merge(df_aq, df_wx, on="time", how="inner")
        merged = merged.sort_values("time").reset_index(drop=True)

        # Apply urban roadside calibration to background PM2.5 / PM10
        merged["pm2_5"] = merged["pm2_5"].astype(float).ffill().bfill()
        merged["pm10"] = merged["pm10"].astype(float).ffill().bfill()
        merged["pm25_cal"] = merged["pm2_5"].apply(
            lambda v: _apply_station_adjustment(float(v), meta)
        )
        merged["pm10_cal"] = np.maximum(
            merged["pm25_cal"] * 1.15,
            merged["pm10"] * float(meta["roadside_scale"]),
        ).round(2)
        merged["us_aqi_cal"] = merged["pm25_cal"].apply(_pm25_to_us_aqi)

        # Fill meteorological nulls chronologically
        wx_cols = [
            "temperature_2m",
            "relative_humidity_2m",
            "rain",
            "wind_speed_10m",
            "wind_direction_10m",
            "cloud_cover",
            "surface_pressure",
            "pressure_msl",
            "weather_code",
            "boundary_layer_height",
        ]
        for col in wx_cols:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").ffill().bfill()

        wind_uv = merged.apply(
            lambda row: _compute_wind_components(
                float(row["wind_speed_10m"]), float(row["wind_direction_10m"])
            ),
            axis=1,
        )
        merged["wind_u"] = [uv[0] for uv in wind_uv]
        merged["wind_v"] = [uv[1] for uv in wind_uv]

        dt_series = pd.to_datetime(merged["time"])
        merged["date"] = dt_series.dt.strftime("%Y-%m-%d")
        merged["hour"] = dt_series.dt.hour
        merged["month"] = dt_series.dt.month
        merged["weekday_number"] = dt_series.dt.weekday
        merged["hour_sin"] = np.sin(2.0 * np.pi * (merged["hour"] / 24.0))
        merged["hour_cos"] = np.cos(2.0 * np.pi * (merged["hour"] / 24.0))
        merged["month_sin"] = np.sin(2.0 * np.pi * (merged["month"] / 12.0))
        merged["month_cos"] = np.cos(2.0 * np.pi * (merged["month"] / 12.0))
        merged["is_rush_hour"] = merged["hour"].isin([7, 8, 9, 17, 18, 19, 20]).astype(float)
        merged["is_roadside"] = float(meta["is_roadside"])
        merged["district_idx"] = float(dist_idx)
        merged["district"] = station_id

        # Engineer hourly lags and rolling windows strictly from past hours
        merged["pm25_current"] = merged["pm25_cal"]
        for lag_h in [1, 2, 3, 6, 12, 24]:
            merged[f"pm25_lag_{lag_h}h"] = merged["pm25_cal"].shift(lag_h)
        merged["pm25_roll_6h"] = merged["pm25_cal"].rolling(6).mean()
        merged["pm25_roll_24h"] = merged["pm25_cal"].rolling(24).mean()
        merged["target_next_hour"] = merged["pm25_cal"].shift(-1)

        hourly_clean = merged.dropna(
            subset=HOURLY_MODEL_FEATURES + ["target_next_hour"]
        ).copy()
        hourly_frames.append(hourly_clean)

        # Build daily station dataframe aligned with daily features + BLH + multi-horizon targets
        def mode_wmo(series: pd.Series) -> float:
            modes = series.mode()
            return float(modes.iloc[0]) if len(modes) else 3.0

        daily = (
            merged.groupby("date", sort=True)
            .agg(
                pm25=("pm25_cal", "mean"),
                pm10=("pm10_cal", "mean"),
                us_aqi=("us_aqi_cal", "mean"),
                temp_mean=("temperature_2m", "mean"),
                temp_max=("temperature_2m", "max"),
                temp_min=("temperature_2m", "min"),
                rain_sum=("rain", "sum"),
                humidity_mean=("relative_humidity_2m", "mean"),
                wind_speed_mean=("wind_speed_10m", "mean"),
                wind_speed_max=("wind_speed_10m", "max"),
                wind_u=("wind_u", "mean"),
                wind_v=("wind_v", "mean"),
                cloud_cover_mean=("cloud_cover", "mean"),
                surface_pressure_mean=("surface_pressure", "mean"),
                sea_level_pressure_mean=("pressure_msl", "mean"),
                weather_code=("weather_code", mode_wmo),
                blh_mean=("boundary_layer_height", "mean"),
                blh_min=("boundary_layer_height", "min"),
            )
            .reset_index()
        )
        daily["wind_direction_mean"] = (
            np.degrees(np.arctan2(-daily["wind_u"], -daily["wind_v"])) + 360.0
        ) % 360.0

        d_dt = pd.to_datetime(daily["date"])
        daily["เดือน"] = d_dt.dt.month.astype(float)
        daily["month_sin"] = np.sin(2.0 * np.pi * (daily["เดือน"] / 12.0))
        daily["month_cos"] = np.cos(2.0 * np.pi * (daily["เดือน"] / 12.0))
        daily["weekday_number"] = d_dt.dt.weekday.astype(float)
        daily["temp_range"] = (daily["temp_max"] - daily["temp_min"]).round(2)
        daily["is_roadside"] = float(meta["is_roadside"])
        daily["district_idx"] = float(dist_idx)
        daily["district"] = station_id

        # Map column names matching baseline model schema
        daily["ฝุ่น PM2.5"] = daily["pm25"].round(2)
        daily["ฝุ่น PM10"] = daily["pm10"].round(2)
        daily["ดัชนีคุณภาพอากาศ US AQI"] = daily["us_aqi"].round(2)
        daily["อุณหภูมิเฉลี่ย (°C)"] = daily["temp_mean"].round(2)
        daily["อุณหภูมิสูงสุด (°C)"] = daily["temp_max"].round(2)
        daily["อุณหภูมิต่ำสุด (°C)"] = daily["temp_min"].round(2)
        daily["ปริมาณฝนรวม (mm)"] = daily["rain_sum"].round(2)
        daily["ความชื้นสัมพัทธ์เฉลี่ย (%)"] = daily["humidity_mean"].round(2)
        daily["ความเร็วลมเฉลี่ย (km/h)"] = daily["wind_speed_mean"].round(2)
        daily["ความเร็วลมสูงสุด (km/h)"] = daily["wind_speed_max"].round(2)
        daily["องค์ประกอบลมแกนตะวันออก-ตะวันตก"] = daily["wind_u"].round(4)
        daily["องค์ประกอบลมแกนเหนือ-ใต้"] = daily["wind_v"].round(4)
        daily["เมฆปกคลุมเฉลี่ย (%)"] = daily["cloud_cover_mean"].round(2)
        daily["ความกดอากาศพื้นผิวเฉลี่ย (hPa)"] = daily["surface_pressure_mean"].round(2)
        daily["ความกดอากาศระดับน้ำทะเลเฉลี่ย (hPa)"] = daily["sea_level_pressure_mean"].round(2)
        daily["รหัสสภาพอากาศที่พบบ่อยสุด (wmo code)"] = daily["weather_code"].astype(float)
        daily["ทิศทางลมเฉลี่ย (°)"] = daily["wind_direction_mean"].round(2)
        daily["boundary_layer_height_mean"] = daily["blh_mean"].round(2)
        daily["boundary_layer_height_min"] = daily["blh_min"].round(2)

        for lag_d in [1, 2, 3, 7, 14]:
            daily[f"pm25_lag_{lag_d}"] = daily["ฝุ่น PM2.5"].shift(lag_d)
        daily["pm25_rolling_3"] = daily["ฝุ่น PM2.5"].rolling(3).mean()
        daily["pm25_rolling_7"] = daily["ฝุ่น PM2.5"].rolling(7).mean()
        daily["pm25_rolling_14"] = daily["ฝุ่น PM2.5"].rolling(14).mean()

        for horizon_d in range(1, 8):
            daily[f"target_day_{horizon_d}"] = daily["ฝุ่น PM2.5"].shift(-horizon_d)

        target_cols = [f"target_day_{h}" for h in range(1, 8)]
        daily_clean = daily.dropna(subset=DAILY_MODEL_FEATURES + target_cols).copy()
        daily_frames.append(daily_clean)

    full_daily = pd.concat(daily_frames, ignore_index=True)
    full_hourly = pd.concat(hourly_frames, ignore_index=True)
    full_daily.to_csv(DAILY_CSV_PATH, index=False)
    full_hourly.to_csv(HOURLY_CSV_PATH, index=False)
    print(f"Saved datasets: daily={len(full_daily)} rows, hourly={len(full_hourly)} rows")
    return full_daily, full_hourly


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Calculate standard regression accuracy and bias metrics."""
    rmse = float(math.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    bias = float(np.mean(y_pred - y_true))
    r2 = float(r2_score(y_true, y_pred))
    return {
        "rmse": round(rmse, 3),
        "mae": round(mae, 3),
        "bias": round(bias, 3),
        "r2": round(r2, 4),
    }


def main() -> None:
    """Run Step 2 chronological backtest, Step 3 multi-horizon training, and Step 4 hourly model."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    daily_df, hourly_df = fetch_or_load_datasets(days=365)

    # Strict chronological split: first 80% dates train, last 20% future dates validation
    unique_dates = sorted(daily_df["date"].unique())
    split_idx = int(len(unique_dates) * 0.80)
    train_dates = set(unique_dates[:split_idx])
    test_dates = set(unique_dates[split_idx:])

    train_daily = daily_df[daily_df["date"].isin(train_dates)].sort_values(["date", "district_idx"])
    test_daily = daily_df[daily_df["date"].isin(test_dates)].sort_values(["date", "district_idx"])

    print(
        f"\n[Step 2] Chronological Backtesting | Train dates: {min(train_dates)}..{max(train_dates)} "
        f"({len(train_dates)}d) | Test dates: {min(test_dates)}..{max(test_dates)} ({len(test_dates)}d)"
    )

    baseline_bundle = joblib.load(BASELINE_BUNDLE_PATH)
    baseline_model = baseline_bundle["model"]
    baseline_features = baseline_bundle["features"]

    base_preds_d1 = baseline_model.predict(test_daily[baseline_features])
    base_metrics_d1 = compute_metrics(test_daily["target_day_1"].to_numpy(), base_preds_d1)
    print(f"Original .joblib Day+1 Metrics on Future Holdout: {base_metrics_d1}")

    per_district_baseline: Dict[str, Dict[str, float]] = {}
    for district_name, group in test_daily.groupby("district"):
        preds = baseline_model.predict(group[baseline_features])
        per_district_baseline[str(district_name)] = compute_metrics(
            group["target_day_1"].to_numpy(), preds
        )

    # Step 3: Train Direct Multi-Horizon Daily Models (Day+1 .. Day+7) with Target-Day Weather
    print("\n[Step 3] Training Direct Multi-Horizon Daily Models (t+1 .. t+7) with TimeSeriesSplit...")
    daily_models: Dict[int, Any] = {}
    horizon_comparison: Dict[str, Any] = {}
    cv_scores_d1: List[float] = []

    daily_sorted = daily_df.sort_values(["district_idx", "date"]).reset_index(drop=True)

    def build_horizon_frame(horizon_d: int) -> pd.DataFrame:
        work = daily_sorted.copy()
        for col in TARGET_DAY_WEATHER_COLS:
            work[f"fc_{col}"] = work.groupby("district")[col].shift(-horizon_d)
        return work.dropna(subset=TARGET_DAILY_MODEL_FEATURES + [f"target_day_{horizon_d}"])

    def make_horizon_estimator(horizon_d: int) -> Any:
        hgb = HistGradientBoostingRegressor(
            max_iter=140,
            learning_rate=0.04,
            max_depth=4,
            min_samples_leaf=30,
            l2_regularization=10.0,
            random_state=42 + horizon_d,
        )
        et = ExtraTreesRegressor(
            n_estimators=160,
            max_depth=8,
            min_samples_leaf=8,
            random_state=42 + horizon_d,
            n_jobs=1,
        )
        ridge = make_pipeline(StandardScaler(), Ridge(alpha=50.0))
        if horizon_d == 1:
            return VotingRegressor(
                estimators=[("ridge", ridge), ("et", et), ("hgb", hgb)],
                weights=[0.45, 0.30, 0.25],
            )
        return VotingRegressor(
            estimators=[("hgb", hgb), ("et", et)],
            weights=[0.65, 0.35],
        )

    df_h1 = build_horizon_frame(1)
    tr_h1 = df_h1[df_h1["date"].isin(train_dates)].sort_values(["date", "district_idx"])
    tscv = TimeSeriesSplit(n_splits=5)
    for tr_i, va_i in tscv.split(tr_h1):
        cv_model = make_horizon_estimator(1)
        cv_model.fit(
            tr_h1[TARGET_DAILY_MODEL_FEATURES].iloc[tr_i],
            tr_h1["target_day_1"].iloc[tr_i],
        )
        cv_pred = cv_model.predict(tr_h1[TARGET_DAILY_MODEL_FEATURES].iloc[va_i])
        cv_scores_d1.append(
            round(float(math.sqrt(mean_squared_error(tr_h1["target_day_1"].iloc[va_i], cv_pred))), 3)
        )
    print(f"5-Fold TimeSeriesSplit Day+1 CV RMSE: {cv_scores_d1} (mean={round(sum(cv_scores_d1)/len(cv_scores_d1), 3)})")

    test_h1_frame: Optional[pd.DataFrame] = None
    for h in range(1, 8):
        target_col = f"target_day_{h}"
        df_h = build_horizon_frame(h)
        tr_h = df_h[df_h["date"].isin(train_dates)].sort_values(["date", "district_idx"])
        te_h = df_h[df_h["date"].isin(test_dates)].sort_values(["date", "district_idx"])
        if h == 1:
            test_h1_frame = te_h

        model_h = make_horizon_estimator(h)
        model_h.fit(tr_h[TARGET_DAILY_MODEL_FEATURES], tr_h[target_col])
        preds_h = model_h.predict(te_h[TARGET_DAILY_MODEL_FEATURES])
        metrics_h = compute_metrics(te_h[target_col].to_numpy(), preds_h)
        daily_models[h] = model_h
        horizon_comparison[f"day_{h}"] = metrics_h
        print(f"  Day+{h} Holdout Metrics: {metrics_h}")

    per_district_upgraded: Dict[str, Dict[str, float]] = {}
    assert test_h1_frame is not None
    for district_name, group in test_h1_frame.groupby("district"):
        preds = daily_models[1].predict(group[TARGET_DAILY_MODEL_FEATURES])
        per_district_upgraded[str(district_name)] = compute_metrics(
            group["target_day_1"].to_numpy(), preds
        )

    # Step 4: Train Dedicated Hourly Model on strict chronological hourly split
    print("\n[Step 4] Training Dedicated Hourly PM2.5 Forecasting Model...")
    unique_hours = sorted(hourly_df["time"].unique())
    h_split_idx = int(len(unique_hours) * 0.80)
    train_hours = set(unique_hours[:h_split_idx])
    test_hours = set(unique_hours[h_split_idx:])

    train_hourly = hourly_df[hourly_df["time"].isin(train_hours)].sort_values(["time", "district_idx"])
    test_hourly = hourly_df[hourly_df["time"].isin(test_hours)].sort_values(["time", "district_idx"])

    hourly_model = HistGradientBoostingRegressor(
        max_iter=300,
        learning_rate=0.05,
        max_depth=7,
        min_samples_leaf=30,
        l2_regularization=1.0,
        random_state=42,
    )
    hourly_model.fit(train_hourly[HOURLY_MODEL_FEATURES], train_hourly["target_next_hour"])
    hourly_preds = hourly_model.predict(test_hourly[HOURLY_MODEL_FEATURES])
    hourly_metrics = compute_metrics(test_hourly["target_next_hour"].to_numpy(), hourly_preds)
    print(f"Hourly Next-Hour Holdout Metrics: {hourly_metrics}")

    daily_fill_values = {
        col: round(float(tr_h1[col].median()), 4) for col in TARGET_DAILY_MODEL_FEATURES
    }
    hourly_fill_values = {
        col: round(float(train_hourly[col].median()), 4) for col in HOURLY_MODEL_FEATURES
    }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "train_window": f"{min(train_dates)} to {max(train_dates)}",
        "test_window": f"{min(test_dates)} to {max(test_dates)}",
        "daily_rows": int(len(daily_df)),
        "hourly_rows": int(len(hourly_df)),
        "baseline_day_1": base_metrics_d1,
        "upgraded_horizons": horizon_comparison,
        "cv_day_1_rmse": cv_scores_d1,
        "hourly_next_hour": hourly_metrics,
        "per_district_baseline_day_1": per_district_baseline,
        "per_district_upgraded_day_1": per_district_upgraded,
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    calibrated_bundle = {
        "model_name": "Bangkok Multi Horizon GBDT",
        "daily_models": daily_models,
        "daily_features": TARGET_DAILY_MODEL_FEATURES,
        "daily_fill_values": daily_fill_values,
        "hourly_model": hourly_model,
        "hourly_features": HOURLY_MODEL_FEATURES,
        "hourly_fill_values": hourly_fill_values,
        "district_metrics": per_district_upgraded,
        "evaluation_summary": report,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(calibrated_bundle, CALIBRATED_BUNDLE_PATH, compress=3)
    print(f"\nSaved evaluation report to {REPORT_PATH}")
    print(f"Saved calibrated bundle to {CALIBRATED_BUNDLE_PATH}")


if __name__ == "__main__":
    main()

