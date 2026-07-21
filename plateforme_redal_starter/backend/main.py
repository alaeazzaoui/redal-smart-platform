"""
Backend FastAPI — Plateforme Intelligente Redal
Sert les modèles LightGBM (électricité + eau) et expose les endpoints
pour le dashboard, la prédiction en direct, les alertes, le what-if et le reporting.

Lancer avec : uvicorn main:app --reload --port 8000
"""

import pickle
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

ZONES = ["Zone A", "Zone B", "Zone C"]

app = FastAPI(title="Redal — Plateforme Intelligente API")

# Autorise le frontend local (Vite tourne par défaut sur 5173) à appeler l'API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Chargement des modèles et données au démarrage
# ---------------------------------------------------------------------------
with open(MODELS_DIR / "elec_models.pkl", "rb") as f:
    _elec = pickle.load(f)
    ELEC_MODELS = _elec["models"]
    ELEC_FEATURES = _elec["features"]

with open(MODELS_DIR / "water_models.pkl", "rb") as f:
    _water = pickle.load(f)
    WATER_MODELS = _water["models"]
    WATER_FEATURES = _water["features"]

ELEC_REF = pd.read_csv(MODELS_DIR / "elec_reference.csv")
WATER_REF = pd.read_csv(MODELS_DIR / "water_reference.csv")
ZONE_DAY = pd.read_csv(DATA_DIR / "zone_day_summary.csv")

print(f"Modèles chargés : élec {list(ELEC_MODELS.keys())} / eau {list(WATER_MODELS.keys())}")


# ---------------------------------------------------------------------------
# Schémas de requête
# ---------------------------------------------------------------------------
class ElecPredictRequest(BaseModel):
    zone: str
    temperature: float
    humidity: float
    month: int
    dayofweek: int
    hour: int
    # Optionnel : si non fourni, on utilise les dernières valeurs connues (elec_reference.csv)
    lag1: Optional[float] = None
    lag3: Optional[float] = None
    lag6: Optional[float] = None
    rollmean_1h: Optional[float] = None
    rollstd_1h: Optional[float] = None


class WaterPredictRequest(BaseModel):
    zone: str
    month: int
    dayofweek: int
    hour: int
    pressure: float
    lag1: Optional[float] = None
    lag3: Optional[float] = None
    rollmean_1h: Optional[float] = None
    rollstd_1h: Optional[float] = None


class WhatIfRequest(BaseModel):
    domain: str  # "electricity" ou "water"
    zone: str
    base: dict    # valeurs de référence (mêmes champs que ElecPredictRequest/WaterPredictRequest sans zone)
    modified: dict  # valeurs modifiées par l'utilisateur


# ---------------------------------------------------------------------------
# Fonctions utilitaires
# ---------------------------------------------------------------------------
def _validate_zone(zone: str):
    if zone not in ZONES:
        raise HTTPException(status_code=400, detail=f"Zone inconnue : {zone}. Attendu : {ZONES}")


def _elec_defaults(zone: str) -> dict:
    """Dernières valeurs connues de lag/rolling pour une zone, utilisées si l'utilisateur ne les fournit pas."""
    row = ELEC_REF.iloc[-1]
    return {
        "lag1": float(row[f"{zone}_lag1"]),
        "lag3": float(row[f"{zone}_lag3"]),
        "lag6": float(row[f"{zone}_lag6"]),
        "rollmean_1h": float(row[f"{zone}_rollmean_1h"]),
        "rollstd_1h": float(row[f"{zone}_rollstd_1h"]),
    }


def _water_defaults(zone: str) -> dict:
    row = WATER_REF.iloc[-1]
    return {
        "pressure": float(row[f"{zone}_pressure"]),
        "lag1": float(row[f"{zone}_lag1"]),
        "lag3": float(row[f"{zone}_lag3"]),
        "rollmean_1h": float(row[f"{zone}_rollmean_1h"]),
        "rollstd_1h": float(row[f"{zone}_rollstd_1h"]),
    }


def _predict_electricity(zone: str, payload: dict) -> float:
    """Retourne la probabilité d'incident électrique (0 à 1) pour une zone donnée."""
    _validate_zone(zone)
    defaults = _elec_defaults(zone)
    row = {
        "Temperature": payload["temperature"],
        "Humidity": payload["humidity"],
        "month": payload["month"],
        "dayofweek": payload["dayofweek"],
        "hour": payload["hour"],
        f"{zone}_lag1": payload.get("lag1") if payload.get("lag1") is not None else defaults["lag1"],
        f"{zone}_lag3": payload.get("lag3") if payload.get("lag3") is not None else defaults["lag3"],
        f"{zone}_lag6": payload.get("lag6") if payload.get("lag6") is not None else defaults["lag6"],
        f"{zone}_rollmean_1h": payload.get("rollmean_1h") if payload.get("rollmean_1h") is not None else defaults["rollmean_1h"],
        f"{zone}_rollstd_1h": payload.get("rollstd_1h") if payload.get("rollstd_1h") is not None else defaults["rollstd_1h"],
    }
    features = ELEC_FEATURES[zone]
    X = pd.DataFrame([row])[features]
    proba = ELEC_MODELS[zone].predict_proba(X)[0, 1]
    return float(proba)


def _predict_water(zone: str, payload: dict) -> float:
    """Retourne la probabilité de fuite (0 à 1) pour une zone donnée."""
    _validate_zone(zone)
    defaults = _water_defaults(zone)
    row = {
        "hour": payload["hour"],
        "dayofweek": payload["dayofweek"],
        "month": payload["month"],
        f"{zone}_pressure": payload.get("pressure") if payload.get("pressure") is not None else defaults["pressure"],
        f"{zone}_lag1": payload.get("lag1") if payload.get("lag1") is not None else defaults["lag1"],
        f"{zone}_lag3": payload.get("lag3") if payload.get("lag3") is not None else defaults["lag3"],
        f"{zone}_rollmean_1h": payload.get("rollmean_1h") if payload.get("rollmean_1h") is not None else defaults["rollmean_1h"],
        f"{zone}_rollstd_1h": payload.get("rollstd_1h") if payload.get("rollstd_1h") is not None else defaults["rollstd_1h"],
    }
    features = WATER_FEATURES[zone]
    X = pd.DataFrame([row])[features]
    proba = WATER_MODELS[zone].predict_proba(X)[0, 1]
    return float(proba)


def _risk_label(proba: float) -> str:
    if proba >= 0.6:
        return "critique"
    if proba >= 0.3:
        return "élevé"
    if proba >= 0.1:
        return "modéré"
    return "faible"


# ---------------------------------------------------------------------------
# Endpoints — Santé
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "zones": ZONES, "elec_models": list(ELEC_MODELS.keys()), "water_models": list(WATER_MODELS.keys())}


# ---------------------------------------------------------------------------
# Endpoints — Dashboard (KPIs)
# ---------------------------------------------------------------------------
@app.get("/api/kpis")
def get_kpis(zone: Optional[str] = None):
    df = ZONE_DAY if zone in (None, "ALL") else ZONE_DAY[ZONE_DAY["zone"] == zone]
    if zone not in (None, "ALL"):
        _validate_zone(zone)
    return {
        "avg_incident_rate": float(df["incident_rate"].mean()),
        "avg_conso": float(df["conso_mean"].mean()),
        "total_complaints": int(df["nb_complaints"].sum()) if "nb_complaints" in df else None,
        "avg_priority_score": float(df["priority_score_v2"].mean()) if "priority_score_v2" in df else float(df["priority_score"].mean()),
        "days_covered": int(df["date"].nunique()),
    }


@app.get("/api/zones")
def get_zones():
    return {"zones": ZONES}


# ---------------------------------------------------------------------------
# Endpoints — Prédiction en direct
# ---------------------------------------------------------------------------
@app.post("/api/predict/electricity")
def predict_electricity(req: ElecPredictRequest):
    proba = _predict_electricity(req.zone, req.model_dump())
    return {"zone": req.zone, "domain": "electricity", "probability": proba, "risk_level": _risk_label(proba)}


@app.post("/api/predict/water")
def predict_water(req: WaterPredictRequest):
    proba = _predict_water(req.zone, req.model_dump())
    return {"zone": req.zone, "domain": "water", "probability": proba, "risk_level": _risk_label(proba)}


# ---------------------------------------------------------------------------
# Endpoints — Alertes
# ---------------------------------------------------------------------------
@app.get("/api/alerts")
def get_alerts(threshold: float = 0.3):
    """Calcule la prédiction actuelle (dernières données connues) pour chaque zone,
    électricité et eau, et retourne celles qui dépassent le seuil d'alerte."""
    now = datetime.now()
    alerts = []
    for zone in ZONES:
        elec_defaults = _elec_defaults(zone)
        elec_payload = {
            "temperature": float(ELEC_REF.iloc[-1]["Temperature"]),
            "humidity": float(ELEC_REF.iloc[-1]["Humidity"]),
            "month": now.month, "dayofweek": now.weekday(), "hour": now.hour,
            **elec_defaults,
        }
        p_elec = _predict_electricity(zone, elec_payload)

        water_defaults = _water_defaults(zone)
        water_payload = {"month": now.month, "dayofweek": now.weekday(), "hour": now.hour, **water_defaults}
        p_water = _predict_water(zone, water_payload)

        if p_elec >= threshold:
            alerts.append({"zone": zone, "domain": "electricity", "probability": p_elec, "risk_level": _risk_label(p_elec)})
        if p_water >= threshold:
            alerts.append({"zone": zone, "domain": "water", "probability": p_water, "risk_level": _risk_label(p_water)})

    alerts.sort(key=lambda a: a["probability"], reverse=True)
    return {"threshold": threshold, "checked_at": now.isoformat(), "alerts": alerts}


# ---------------------------------------------------------------------------
# Endpoints — Simulation what-if
# ---------------------------------------------------------------------------
@app.post("/api/whatif")
def whatif(req: WhatIfRequest):
    if req.domain not in ("electricity", "water"):
        raise HTTPException(status_code=400, detail="domain doit être 'electricity' ou 'water'")

    predict_fn = _predict_electricity if req.domain == "electricity" else _predict_water

    proba_base = predict_fn(req.zone, req.base)
    proba_modified = predict_fn(req.zone, req.modified)

    return {
        "zone": req.zone,
        "domain": req.domain,
        "baseline": {"probability": proba_base, "risk_level": _risk_label(proba_base)},
        "modified": {"probability": proba_modified, "risk_level": _risk_label(proba_modified)},
        "delta": proba_modified - proba_base,
    }


# ---------------------------------------------------------------------------
# Endpoints — Reporting
# ---------------------------------------------------------------------------
@app.get("/api/report")
def get_report(zone: Optional[str] = None, days: int = 30):
    df = ZONE_DAY if zone in (None, "ALL") else ZONE_DAY[ZONE_DAY["zone"] == zone]
    if zone not in (None, "ALL"):
        _validate_zone(zone)

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    cutoff = df["date"].max() - timedelta(days=days)
    recent = df[df["date"] >= cutoff]

    top_priority_col = "priority_score_v2" if "priority_score_v2" in recent.columns else "priority_score"
    top_days = recent.sort_values(top_priority_col, ascending=False).head(10)

    return {
        "period_days": days,
        "zone": zone or "ALL",
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "avg_incident_rate": float(recent["incident_rate"].mean()),
            "avg_conso": float(recent["conso_mean"].mean()),
            "total_complaints": int(recent["nb_complaints"].sum()) if "nb_complaints" in recent else None,
        },
        "top_priority_days": top_days[["date", "zone", "incident_rate", top_priority_col]].assign(
            date=lambda d: d["date"].dt.strftime("%Y-%m-%d")
        ).to_dict(orient="records"),
    }