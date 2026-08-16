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
        # Décomposition du score de priorité (3 signaux pondérés) — pour audit/transparence
        "priority_breakdown": {
            "incident_component": float(df["incident_rate"].mean() * 0.5) if "incident_rate" in df else None,
            "risk_cluster_component": float(df["risk_cluster"].mean() * 0.25) if "risk_cluster" in df else None,
            "complaints_component": float(df["complaints_norm"].mean() * 0.25) if "complaints_norm" in df else None,
            "risk_cluster_share": float(df["risk_cluster"].mean()) if "risk_cluster" in df else None,
            "avg_complaints_norm": float(df["complaints_norm"].mean()) if "complaints_norm" in df else None,
        },
    }


@app.get("/api/timeseries")
def get_timeseries(zone: Optional[str] = None):
    """Retourne la série journalière (conso, incidents, réclamations, score) pour les graphiques de tendance."""
    df = ZONE_DAY if zone in (None, "ALL") else ZONE_DAY[ZONE_DAY["zone"] == zone]
    if zone not in (None, "ALL"):
        _validate_zone(zone)

    df = df.sort_values("date")
    priority_col = "priority_score_v2" if "priority_score_v2" in df.columns else "priority_score"
    cols = ["date", "zone", "conso_mean", "incident_rate", priority_col]
    if "nb_complaints" in df.columns:
        cols.append("nb_complaints")

    out = df[cols].rename(columns={priority_col: "priority_score"})
    return {"zone": zone or "ALL", "series": out.to_dict(orient="records")}


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
def _build_report_data(zone: Optional[str], days: int) -> dict:
    df_all = ZONE_DAY.copy()
    df_all["date"] = pd.to_datetime(df_all["date"])
    priority_col = "priority_score_v2" if "priority_score_v2" in df_all.columns else "priority_score"

    df = df_all if zone in (None, "ALL") else df_all[df_all["zone"] == zone]
    if zone not in (None, "ALL"):
        _validate_zone(zone)

    max_date = df["date"].max()
    cutoff = max_date - timedelta(days=days)
    prev_cutoff = cutoff - timedelta(days=days)

    recent = df[df["date"] >= cutoff]
    previous = df[(df["date"] >= prev_cutoff) & (df["date"] < cutoff)]

    def summarize(d):
        if len(d) == 0:
            return {"avg_incident_rate": None, "avg_conso": None, "total_complaints": None,
                    "avg_priority_score": None, "risk_cluster_share": None}
        return {
            "avg_incident_rate": float(d["incident_rate"].mean()),
            "avg_conso": float(d["conso_mean"].mean()),
            "total_complaints": int(d["nb_complaints"].sum()) if "nb_complaints" in d else None,
            "avg_priority_score": float(d[priority_col].mean()),
            "risk_cluster_share": float(d["risk_cluster"].mean()) if "risk_cluster" in d else None,
        }

    summary_current = summarize(recent)
    summary_previous = summarize(previous)

    def delta(cur, prev):
        if cur is None or prev is None or prev == 0:
            return None
        return (cur - prev) / prev

    deltas = {
        k: delta(summary_current[k], summary_previous[k])
        for k in ["avg_incident_rate", "avg_conso", "total_complaints", "avg_priority_score"]
    }

    top_days = recent.sort_values(priority_col, ascending=False).head(10)

    zone_breakdown = []
    for z in ZONES:
        zd = recent[recent["zone"] == z]
        if len(zd) == 0:
            continue
        zone_breakdown.append({
            "zone": z,
            "avg_incident_rate": float(zd["incident_rate"].mean()),
            "avg_conso": float(zd["conso_mean"].mean()),
            "total_complaints": int(zd["nb_complaints"].sum()) if "nb_complaints" in zd else None,
            "avg_priority_score": float(zd[priority_col].mean()),
        })
    zone_breakdown.sort(key=lambda r: r["avg_priority_score"], reverse=True)

    insights = []
    if zone in (None, "ALL") and len(zone_breakdown) > 0:
        top_zone = zone_breakdown[0]
        insights.append(f"{top_zone['zone']} affiche le score de priorité le plus élevé de la période ({top_zone['avg_priority_score']:.4f}).")
    if deltas["avg_incident_rate"] is not None:
        direction = "en hausse" if deltas["avg_incident_rate"] > 0 else "en baisse"
        insights.append(f"Le taux d'incident moyen est {direction} de {abs(deltas['avg_incident_rate'])*100:.1f}% par rapport à la période précédente équivalente.")
    if deltas["total_complaints"] is not None:
        direction = "en hausse" if deltas["total_complaints"] > 0 else "en baisse"
        insights.append(f"Les réclamations sont {direction} de {abs(deltas['total_complaints'])*100:.1f}% sur la même base de comparaison.")
    if summary_current["risk_cluster_share"] is not None:
        insights.append(f"{summary_current['risk_cluster_share']*100:.1f}% des journées de la période appartiennent au cluster à risque élevé.")

    return {
        "period_days": days,
        "zone": zone or "ALL",
        "generated_at": datetime.now().isoformat(),
        "period_range": {"from": cutoff.strftime("%Y-%m-%d"), "to": max_date.strftime("%Y-%m-%d")},
        "summary": summary_current,
        "previous_summary": summary_previous,
        "deltas": deltas,
        "zone_breakdown": zone_breakdown,
        "insights": insights,
        "top_priority_days": top_days[["date", "zone", "incident_rate", priority_col]].rename(
            columns={priority_col: "priority_score"}
        ).assign(date=lambda d: d["date"].dt.strftime("%Y-%m-%d")).to_dict(orient="records"),
    }


@app.get("/api/report")
def get_report(zone: Optional[str] = None, days: int = 30):
    return _build_report_data(zone, days)


@app.get("/api/report/pdf")
def get_report_pdf(zone: Optional[str] = None, days: int = 30):
    from fpdf import FPDF
    from fastapi.responses import Response

    data = _build_report_data(zone, days)

    def pct(v, d=2):
        return f"{v*100:.{d}f}%" if v is not None else "—"

    def num(v, d=0):
        return f"{v:,.{d}f}".replace(",", " ") if v is not None else "—"

    def delta_str(v):
        if v is None:
            return "—"
        return f"{'+' if v>0 else ''}{v*100:.1f}% vs période précédente"

    REDAL = (192, 57, 43)
    DARK = (24, 28, 34)
    GRAY = (91, 101, 112)
    LIGHT_BG = (251, 244, 243)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # En-tête
    pdf.set_fill_color(*REDAL)
    pdf.rect(0, 0, 210, 22, 'F')
    pdf.set_xy(12, 6)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 15)
    pdf.cell(0, 6, "REDAL - Plateforme Intelligente", ln=1)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, "Direction Technique - Rabat-Sale-Kenitra", ln=1)

    pdf.set_xy(12, 30)
    pdf.set_text_color(*DARK)
    pdf.set_font("Helvetica", "B", 16)
    zone_label = "Toutes zones" if data["zone"] == "ALL" else data["zone"]
    pdf.cell(0, 8, f"Rapport periodique - {zone_label}", ln=1)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 6, f"Periode du {data['period_range']['from']} au {data['period_range']['to']}  |  Genere le {datetime.now().strftime('%d/%m/%Y a %H:%M')}", ln=1)
    pdf.ln(4)

    # KPIs
    pdf.set_x(12)
    pdf.set_fill_color(*LIGHT_BG)
    pdf.set_draw_color(230, 230, 230)
    kpis = [
        ("Taux incident moyen", pct(data["summary"]["avg_incident_rate"]), delta_str(data["deltas"]["avg_incident_rate"])),
        ("Conso. moyenne", num(data["summary"]["avg_conso"]) + " kWh/j", delta_str(data["deltas"]["avg_conso"])),
        ("Reclamations", num(data["summary"]["total_complaints"]), delta_str(data["deltas"]["total_complaints"])),
        ("Score priorite moyen", f"{data['summary']['avg_priority_score']:.4f}" if data["summary"]["avg_priority_score"] is not None else "—", delta_str(data["deltas"]["avg_priority_score"])),
    ]
    col_w = 46.5
    x0 = 12
    y0 = pdf.get_y()
    box_h = 24
    for i, (label, value, delta) in enumerate(kpis):
        x = x0 + i * col_w
        pdf.rect(x, y0, col_w - 2, box_h, style='DF')
        pdf.set_xy(x + 2, y0 + 2)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*GRAY)
        pdf.cell(col_w - 4, 4, label.upper(), ln=0)
        pdf.set_xy(x + 2, y0 + 9)
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_text_color(*DARK)
        pdf.cell(col_w - 4, 6, value, ln=0)
        pdf.set_xy(x + 2, y0 + 18)
        pdf.set_font("Helvetica", "", 6.5)
        pdf.set_text_color(*REDAL)
        pdf.cell(col_w - 4, 4, delta[:28], ln=0)
    pdf.set_xy(12, y0 + box_h + 8)

    # Analyse
    pdf.set_x(12)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 8, "Analyse de la periode", ln=1)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*DARK)
    for insight in data["insights"]:
        pdf.set_x(14)
        clean = insight.encode('latin-1', 'replace').decode('latin-1')
        pdf.multi_cell(0, 5.5, f"- {clean}")
    pdf.ln(2)

    # Détail par zone
    if data["zone_breakdown"] and len(data["zone_breakdown"]) > 1:
        pdf.set_x(12)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 9, "Detail par zone", ln=1)
        pdf.set_x(12)
        pdf.set_fill_color(*DARK)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 8.5)
        headers = ["Zone", "Taux incident", "Conso. moyenne", "Reclamations", "Score priorite"]
        widths = [30, 35, 40, 35, 40]
        for h, w in zip(headers, widths):
            pdf.cell(w, 7, h, border=0, fill=True)
        pdf.ln()
        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(*DARK)
        for i, row in enumerate(data["zone_breakdown"]):
            pdf.set_x(12)
            pdf.set_fill_color(*LIGHT_BG if i % 2 == 0 else (255, 255, 255))
            pdf.cell(widths[0], 7, row["zone"], border='B', fill=True)
            pdf.cell(widths[1], 7, pct(row["avg_incident_rate"]), border='B', fill=True)
            pdf.cell(widths[2], 7, num(row["avg_conso"]), border='B', fill=True)
            pdf.cell(widths[3], 7, num(row["total_complaints"]), border='B', fill=True)
            pdf.cell(widths[4], 7, f"{row['avg_priority_score']:.4f}", border='B', fill=True)
            pdf.ln()
        pdf.ln(4)

    # Top jours prioritaires
    pdf.set_x(12)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*DARK)
    pdf.cell(0, 9, "Top 10 jours prioritaires", ln=1)
    pdf.set_x(12)
    pdf.set_fill_color(*DARK)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8.5)
    headers2 = ["Date", "Zone", "Taux incident", "Score priorite"]
    widths2 = [40, 35, 40, 40]
    for h, w in zip(headers2, widths2):
        pdf.cell(w, 7, h, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*DARK)
    for i, row in enumerate(data["top_priority_days"]):
        pdf.set_x(12)
        pdf.set_fill_color(*LIGHT_BG if i % 2 == 0 else (255, 255, 255))
        pdf.cell(widths2[0], 7, row["date"], border='B', fill=True)
        pdf.cell(widths2[1], 7, row["zone"], border='B', fill=True)
        pdf.cell(widths2[2], 7, pct(row["incident_rate"], 1), border='B', fill=True)
        pdf.cell(widths2[3], 7, f"{row['priority_score']:.3f}", border='B', fill=True)
        pdf.ln()

    # Pied de page méthodologique
    pdf.ln(8)
    pdf.set_x(12)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(*GRAY)
    note = ("Donnees de substitution (Tetouan Power Consumption + BattLeDIM 2020) en l'absence de donnees "
            "operationnelles reelles Redal. Referentiel de zones fictif A/B/C. Voir documentation du projet "
            "pour le detail methodologique complet.")
    pdf.multi_cell(0, 4, note)

    pdf_bytes = bytes(pdf.output())
    filename = f"rapport_redal_{zone_label.replace(' ','_')}_{days}j.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )