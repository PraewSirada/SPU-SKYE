"""Live Bangkok meteorological and air quality data fetcher with TTL caching."""

from datetime import datetime, timedelta, timezone
import json
import logging
import math
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse
import urllib.request

logger = logging.getLogger("pm25_api.live_data")

BKK_TZ = timezone(timedelta(hours=7))
CACHE_TTL_SECONDS = 900  # 15 minutes

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Station coordinates and urban micro-environment characteristics for 10 Bangkok districts.
# roadside_scale and roadside_offset capture localized street-canyon particulate elevation
# relative to regional background grid concentrations while keeping clean air at low baselines.
STATION_METADATA: List[Dict[str, Any]] = [
    {
        "id": "Pathum Wan",
        "lat": 13.7314,
        "lon": 100.5414,
        "is_roadside": 0.0,
        "roadside_scale": 0.96,
        "roadside_offset": 0.0,
    },
    {
        "id": "Dusit",
        "lat": 13.7772,
        "lon": 100.5204,
        "is_roadside": 0.0,
        "roadside_scale": 1.02,
        "roadside_offset": 0.6,
    },
    {
        "id": "Ratchathewi",
        "lat": 13.7588,
        "lon": 100.5345,
        "is_roadside": 1.0,
        "roadside_scale": 1.08,
        "roadside_offset": 1.5,
    },
    {
        "id": "Bang Khen",
        "lat": 13.8739,
        "lon": 100.5963,
        "is_roadside": 0.0,
        "roadside_scale": 1.04,
        "roadside_offset": 1.0,
    },
    {
        "id": "Chatuchak",
        "lat": 13.8025,
        "lon": 100.5535,
        "is_roadside": 1.0,
        "roadside_scale": 1.07,
        "roadside_offset": 1.4,
    },
    {
        "id": "Din Daeng",
        "lat": 13.7697,
        "lon": 100.5528,
        "is_roadside": 1.0,
        "roadside_scale": 1.18,
        "roadside_offset": 3.0,
    },
    {
        "id": "Lat Phrao",
        "lat": 13.8037,
        "lon": 100.6067,
        "is_roadside": 0.0,
        "roadside_scale": 1.05,
        "roadside_offset": 1.1,
    },
    {
        "id": "Huai Khwang",
        "lat": 13.7768,
        "lon": 100.5792,
        "is_roadside": 1.0,
        "roadside_scale": 1.12,
        "roadside_offset": 2.1,
    },
    {
        "id": "Phaya Thai",
        "lat": 13.7801,
        "lon": 100.5446,
        "is_roadside": 1.0,
        "roadside_scale": 1.06,
        "roadside_offset": 1.3,
    },
    {
        "id": "Bang Na",
        "lat": 13.6665,
        "lon": 100.6056,
        "is_roadside": 0.0,
        "roadside_scale": 0.98,
        "roadside_offset": 0.3,
    },
]

STATION_META_BY_ID: Dict[str, Dict[str, Any]] = {
    item["id"]: item for item in STATION_METADATA
}

_cache_lock = threading.Lock()
_live_cache: Dict[str, Any] = {
    "expires_at": 0.0,
    "snapshot": None,
}


def _fetch_json(base_url: str, params: Dict[str, Any], timeout: float = 12.0) -> Any:
    """Execute an HTTP GET request and parse the JSON payload."""
    query = urllib.parse.urlencode(params)
    url = f"{base_url}?{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "PM25Sentinel/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _safe_float(val: Any, default: float) -> float:
    """Convert numeric input to a finite float or return the fallback."""
    if val is None:
        return default
    try:
        parsed = float(val)
        return parsed if math.isfinite(parsed) else default
    except (TypeError, ValueError):
        return default


def _compute_wind_components(speed_kmh: float, direction_deg: float) -> Tuple[float, float]:
    """Compute meteorological east-west (u) and north-south (v) wind components."""
    speed_ms = speed_kmh / 3.6
    rad = math.radians(direction_deg)
    wind_u = round(-speed_ms * math.sin(rad), 4)
    wind_v = round(-speed_ms * math.cos(rad), 4)
    return wind_u, wind_v


def _apply_station_adjustment(raw_pm25: float, meta: Dict[str, Any]) -> float:
    """Apply urban station roadside calibration to background PM2.5 concentration."""
    adjusted = raw_pm25 * float(meta["roadside_scale"]) + float(meta["roadside_offset"])
    return round(max(2.0, adjusted), 2)


def _pm25_to_us_aqi(pm25: float) -> float:
    """Convert PM2.5 concentration (ug/m3) to US EPA AQI linear breakpoint value."""
    breakpoints = [
        (0.0, 12.0, 0.0, 50.0),
        (12.1, 35.4, 51.0, 100.0),
        (35.5, 55.4, 101.0, 150.0),
        (55.5, 150.4, 151.0, 200.0),
        (150.5, 250.4, 201.0, 300.0),
        (250.5, 500.4, 301.0, 500.0),
    ]
    c = max(0.0, min(500.4, pm25))
    for c_low, c_high, i_low, i_high in breakpoints:
        if c <= c_high:
            return round(((i_high - i_low) / (c_high - c_low)) * (c - c_low) + i_low, 1)
    return 500.0


def _group_hourly_weather_by_date(
    hourly: Dict[str, List[Any]],
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, Dict[str, float]]]:
    """Aggregate hourly Open-Meteo weather into daily summaries and hourly lookup maps."""
    times = hourly.get("time", [])
    buckets: Dict[str, Dict[str, List[float]]] = {}
    hourly_map: Dict[str, Dict[str, float]] = {}

    for idx, ts in enumerate(times):
        date_key = ts[:10]
        temp = _safe_float((hourly.get("temperature_2m") or [None])[idx], 29.0)
        rh = _safe_float((hourly.get("relative_humidity_2m") or [None])[idx], 72.0)
        rain = _safe_float((hourly.get("rain") or [None])[idx], 0.0)
        wind_kmh = _safe_float((hourly.get("wind_speed_10m") or [None])[idx], 8.0)
        wind_deg = _safe_float((hourly.get("wind_direction_10m") or [None])[idx], 180.0)
        cloud = _safe_float((hourly.get("cloud_cover") or [None])[idx], 50.0)
        surf_p = _safe_float((hourly.get("surface_pressure") or [None])[idx], 1010.0)
        msl_p = _safe_float((hourly.get("pressure_msl") or [None])[idx], 1011.0)
        wmo = _safe_float((hourly.get("weather_code") or [None])[idx], 3.0)
        blh = _safe_float((hourly.get("boundary_layer_height") or [None])[idx], 650.0)

        wind_u, wind_v = _compute_wind_components(wind_kmh, wind_deg)
        hourly_map[ts] = {
            "temperature_2m": temp,
            "relative_humidity_2m": rh,
            "rain": rain,
            "wind_speed_10m": wind_kmh,
            "wind_direction_10m": wind_deg,
            "wind_u": wind_u,
            "wind_v": wind_v,
            "cloud_cover": cloud,
            "surface_pressure": surf_p,
            "pressure_msl": msl_p,
            "weather_code": wmo,
            "boundary_layer_height": blh,
        }

        day_bucket = buckets.setdefault(
            date_key,
            {
                "temp": [],
                "rh": [],
                "rain": [],
                "wind_kmh": [],
                "wind_u": [],
                "wind_v": [],
                "cloud": [],
                "surf_p": [],
                "msl_p": [],
                "wmo": [],
                "blh": [],
            },
        )
        day_bucket["temp"].append(temp)
        day_bucket["rh"].append(rh)
        day_bucket["rain"].append(rain)
        day_bucket["wind_kmh"].append(wind_kmh)
        day_bucket["wind_u"].append(wind_u)
        day_bucket["wind_v"].append(wind_v)
        day_bucket["cloud"].append(cloud)
        day_bucket["surf_p"].append(surf_p)
        day_bucket["msl_p"].append(msl_p)
        day_bucket["wmo"].append(wmo)
        day_bucket["blh"].append(blh)

    daily_map: Dict[str, Dict[str, float]] = {}
    for date_key, b in buckets.items():
        temps = b["temp"]
        mean_u = sum(b["wind_u"]) / len(b["wind_u"])
        mean_v = sum(b["wind_v"]) / len(b["wind_v"])
        # Derive dominant meteorological wind direction from mean vector components
        dom_dir = (math.degrees(math.atan2(-mean_u, -mean_v)) + 360.0) % 360.0
        wmo_counts: Dict[float, int] = {}
        for code in b["wmo"]:
            wmo_counts[code] = wmo_counts.get(code, 0) + 1
        dominant_wmo = max(wmo_counts.items(), key=lambda kv: kv[1])[0]

        daily_map[date_key] = {
            "temp_mean": round(sum(temps) / len(temps), 2),
            "temp_max": round(max(temps), 2),
            "temp_min": round(min(temps), 2),
            "rain_sum": round(sum(b["rain"]), 2),
            "humidity_mean": round(sum(b["rh"]) / len(b["rh"]), 2),
            "wind_speed_mean": round(sum(b["wind_kmh"]) / len(b["wind_kmh"]), 2),
            "wind_speed_max": round(max(b["wind_kmh"]), 2),
            "wind_u": round(mean_u, 4),
            "wind_v": round(mean_v, 4),
            "cloud_cover_mean": round(sum(b["cloud"]) / len(b["cloud"]), 2),
            "surface_pressure_mean": round(sum(b["surf_p"]) / len(b["surf_p"]), 2),
            "sea_level_pressure_mean": round(sum(b["msl_p"]) / len(b["msl_p"]), 2),
            "weather_code": dominant_wmo,
            "wind_direction_mean": round(dom_dir, 2),
            "boundary_layer_height_mean": round(sum(b["blh"]) / len(b["blh"]), 2),
            "boundary_layer_height_min": round(min(b["blh"]), 2),
        }

    return daily_map, hourly_map


def _group_hourly_aq_by_date(
    hourly: Dict[str, List[Any]],
    meta: Dict[str, Any],
) -> Tuple[Dict[str, Dict[str, float]], Dict[str, float]]:
    """Aggregate hourly air quality readings into daily means and hourly PM2.5 lookup."""
    times = hourly.get("time", [])
    daily_pm25: Dict[str, List[float]] = {}
    daily_pm10: Dict[str, List[float]] = {}
    daily_aqi: Dict[str, List[float]] = {}
    hourly_pm25: Dict[str, float] = {}

    for idx, ts in enumerate(times):
        raw_pm25 = (hourly.get("pm2_5") or [None])[idx]
        if raw_pm25 is None:
            continue
        adj_pm25 = _apply_station_adjustment(_safe_float(raw_pm25, 20.0), meta)
        raw_pm10 = _safe_float((hourly.get("pm10") or [None])[idx], adj_pm25 * 1.35)
        adj_pm10 = round(max(adj_pm25 * 1.15, raw_pm10 * float(meta["roadside_scale"])), 2)
        aqi_val = _pm25_to_us_aqi(adj_pm25)

        hourly_pm25[ts] = adj_pm25
        date_key = ts[:10]
        daily_pm25.setdefault(date_key, []).append(adj_pm25)
        daily_pm10.setdefault(date_key, []).append(adj_pm10)
        daily_aqi.setdefault(date_key, []).append(aqi_val)

    daily_map: Dict[str, Dict[str, float]] = {}
    for date_key, vals in daily_pm25.items():
        pm10_vals = daily_pm10.get(date_key, vals)
        aqi_vals = daily_aqi.get(date_key, vals)
        daily_map[date_key] = {
            "pm25": round(sum(vals) / len(vals), 2),
            "pm10": round(sum(pm10_vals) / len(pm10_vals), 2),
            "us_aqi": round(sum(aqi_vals) / len(aqi_vals), 2),
        }

    return daily_map, hourly_pm25


def _fetch_live_snapshot() -> Dict[str, Any]:
    """Fetch batched Open-Meteo weather and air quality data for all 10 Bangkok stations."""
    lat_csv = ",".join(str(item["lat"]) for item in STATION_METADATA)
    lon_csv = ",".join(str(item["lon"]) for item in STATION_METADATA)

    wx_payload = _fetch_json(
        OPEN_METEO_FORECAST_URL,
        {
            "latitude": lat_csv,
            "longitude": lon_csv,
            "current": "temperature_2m,wind_speed_10m,wind_direction_10m",
            "hourly": (
                "temperature_2m,relative_humidity_2m,rain,wind_speed_10m,"
                "wind_direction_10m,cloud_cover,surface_pressure,pressure_msl,"
                "weather_code,boundary_layer_height"
            ),
            "past_days": 15,
            "forecast_days": 7,
            "timezone": "Asia/Bangkok",
        },
    )

    aq_payload = _fetch_json(
        OPEN_METEO_AIR_QUALITY_URL,
        {
            "latitude": lat_csv,
            "longitude": lon_csv,
            "current": "pm2_5,pm10,us_aqi",
            "hourly": "pm2_5,pm10,us_aqi",
            "past_days": 15,
            "forecast_days": 7,
            "timezone": "Asia/Bangkok",
        },
    )

    wx_list = wx_payload if isinstance(wx_payload, list) else [wx_payload]
    aq_list = aq_payload if isinstance(aq_payload, list) else [aq_payload]

    now_bkk = datetime.now(BKK_TZ).replace(minute=0, second=0, microsecond=0)
    stations_data: Dict[str, Dict[str, Any]] = {}

    for idx, meta in enumerate(STATION_METADATA):
        station_id = meta["id"]
        wx_item = wx_list[idx]
        aq_item = aq_list[idx]

        wx_daily, wx_hourly = _group_hourly_weather_by_date(wx_item.get("hourly", {}))
        aq_daily, aq_hourly = _group_hourly_aq_by_date(aq_item.get("hourly", {}), meta)

        current_aq = aq_item.get("current", {})
        current_wx = wx_item.get("current", {})

        raw_current_pm25 = _safe_float(current_aq.get("pm2_5"), 20.0)
        current_pm25 = _apply_station_adjustment(raw_current_pm25, meta)
        current_pm10 = round(
            max(current_pm25 * 1.15, _safe_float(current_aq.get("pm10"), current_pm25 * 1.35) * float(meta["roadside_scale"])),
            2,
        )
        current_temp = round(_safe_float(current_wx.get("temperature_2m"), 30.5), 1)
        current_wind_ms = round(_safe_float(current_wx.get("wind_speed_10m"), 8.0) / 3.6, 1)
        current_wind_deg = round(_safe_float(current_wx.get("wind_direction_10m"), 180.0), 1)

        stations_data[station_id] = {
            "meta": meta,
            "current_pm25": current_pm25,
            "current_pm10": current_pm10,
            "current_us_aqi": _pm25_to_us_aqi(current_pm25),
            "current_temp_c": current_temp,
            "current_wind_ms": current_wind_ms,
            "current_wind_deg": current_wind_deg,
            "wx_daily": wx_daily,
            "wx_hourly": wx_hourly,
            "aq_daily": aq_daily,
            "aq_hourly": aq_hourly,
        }

    return {
        "fetched_at": now_bkk.isoformat(),
        "source": "open_meteo_live",
        "stations": stations_data,
    }


def get_live_snapshot(force_refresh: bool = False) -> Optional[Dict[str, Any]]:
    """Return cached live Bangkok air quality and meteorological data, fetching when expired."""
    now_ts = time.time()
    with _cache_lock:
        cached = _live_cache.get("snapshot")
        if not force_refresh and cached is not None and now_ts < float(_live_cache.get("expires_at", 0.0)):
            return cached

    try:
        fresh = _fetch_live_snapshot()
        with _cache_lock:
            _live_cache["snapshot"] = fresh
            _live_cache["expires_at"] = time.time() + CACHE_TTL_SECONDS
        logger.info("Refreshed live Bangkok weather and air quality snapshot (%d stations)", len(fresh["stations"]))
        return fresh
    except Exception as exc:
        logger.warning("Live Open-Meteo fetch failed, falling back to cached or baseline values: %s", exc)
        with _cache_lock:
            return _live_cache.get("snapshot")

