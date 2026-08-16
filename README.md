# REDAL — Plateforme Intelligente de Maintenance Prédictive

Plateforme intelligente de prévision d'incidents, segmentation clients et pilotage décisionnel par zone géographique, développée dans le cadre d'un stage d'été à la Direction Technique de Redal (gestionnaire délégué eau/électricité/assainissement, région Rabat-Salé-Kénitra).

**Étudiante** : Alae AZZAOUI — EMSI Rabat
**Période** : Juillet – Août 2026

---

## Sommaire

- [Contexte et méthodologie](#contexte-et-méthodologie)
- [Architecture du projet](#architecture-du-projet)
- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Installation et lancement](#installation-et-lancement)
- [Structure des fichiers](#structure-des-fichiers)
- [Résultats des modèles](#résultats-des-modèles)
- [Limites connues et écarts par rapport au cahier des charges](#limites-connues-et-écarts-par-rapport-au-cahier-des-charges)
- [Pistes d'amélioration](#pistes-daméliorationet-prochaines-étapes)

---

## Contexte et méthodologie

Redal n'ayant pas pu fournir de données opérationnelles réelles durant le stage, le projet s'appuie sur **deux jeux de données publics combinés** via un référentiel de zones fictif, afin de couvrir les deux métiers de Redal (eau et électricité) :

| Source | Contenu | Volume |
|---|---|---|
| [Tetouan City Power Consumption](https://www.kaggle.com/datasets/fedesoriano/electric-power-consumption) (Kaggle/UCI) | Consommation électrique, 3 zones réelles, météo | 52 416 lignes, pas de 10 min, année 2017 |
| [BattLeDIM 2020](https://zenodo.org/records/4017659) (Zenodo) | Pression réseau d'eau + labels de fuites réels, réseau basé sur une ville réelle (Chypre) | 105 120 lignes, pas de 5 min, année 2018 |

**Référentiel de zones** : les 3 zones électriques réelles de Tétouan sont conservées (Zone A/B/C), et les conduites/capteurs du réseau d'eau y sont répartis. Pour la plateforme, ces zones sont ancrées géographiquement sur les 3 villes réelles de la région Redal (**Zone A → Rabat, Zone B → Salé, Zone C → Kénitra**) à titre illustratif, en l'absence du découpage réel des zones de desserte.

**Labels d'incidents** :
- Eau : labels réels (fichier de fuites BattLeDIM)
- Électricité : dérivés par détection d'anomalies contextuelle (z-score par mois/heure), validée par comparaison avec Isolation Forest (corrélation 0.74) et un autoencoder

**Clients et réclamations** : générés synthétiquement (désagrégation de la consommation de zone + probabilité de réclamation corrélée aux incidents), en l'absence de données clients réelles. Cette limite est documentée dans l'application elle-même.

---

## Architecture du projet

```
┌─────────────────────────────────────────────┐
│  Notebook (Google Colab)                      │
│  EDA → Labels → Modèles → Clustering → Exports │
└───────────────────┬───────────────────────────┘
                     │ exports CSV + modèles .pkl
┌────────────────────▼───────────────────────────┐
│  Backend FastAPI                                 │
│  Sert les modèles LightGBM, calcule KPIs,         │
│  alertes, simulations what-if, rapports PDF       │
└────────────────────┬───────────────────────────┘
                     │ API REST
┌────────────────────▼───────────────────────────┐
│  Frontend React (Vite)                           │
│  Dashboard · Prédiction · Alertes · What-if ·     │
│  Reporting — 5 pages, carte interactive           │
└─────────────────────────────────────────────────┘
```

Un dashboard HTML autonome (`redal_dashboard.html`) est également fourni comme livrable indépendant, pour une consultation rapide sans backend.

---

## Fonctionnalités

### 📊 Dashboard
- KPIs en direct (taux d'incident, consommation, réclamations, score de priorité)
- Carte interactive (OpenStreetMap) des 3 zones avec statut de risque en direct
- Décomposition du score de priorité par composante (incidents / cluster à risque / réclamations)
- Tendance de consommation, table des jours prioritaires, performance des modèles

### ⚡ Prédiction en direct
Formulaire (zone, météo/pression, date/heure) → probabilité d'incident calculée en direct par les modèles LightGBM

### 🔔 Alertes
Vérification automatique des 3 zones (eau + électricité) avec seuil de risque configurable

### 🔀 What-if
Comparaison d'un scénario de référence vs un scénario modifié, avec interprétation en langage clair de l'écart

### 📄 Reporting
Rapport périodique détaillé : anneaux de pourcentage, barres comparatives (période actuelle vs précédente), analyse automatique, détail par zone, **export PDF**

---

## Stack technique

**Data science / notebook** : Python, pandas, numpy, LightGBM, scikit-learn (Isolation Forest), TensorFlow/Keras (autoencoder), K-Means

**Backend** : FastAPI, Uvicorn, LightGBM (modèles servis via pickle), fpdf2 (génération PDF)

**Frontend** : React 18, Vite, React Router, Leaflet/react-leaflet (carte), SVG natif pour les graphiques (pas de librairie de charting externe)

---

## Installation et lancement

### Prérequis
- Python 3.11+ (testé avec 3.13)
- Node.js 18+

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

L'API est accessible sur `http://127.0.0.1:8000`, documentation interactive sur `http://127.0.0.1:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

L'application est accessible sur `http://localhost:5173`.

> Le backend doit être lancé **avant** le frontend pour que les appels API fonctionnent (indicateur "API connectée" visible dans le header).

---

## Structure des fichiers

```
├── backend/
│   ├── main.py                  # API FastAPI (tous les endpoints)
│   ├── requirements.txt
│   ├── models/
│   │   ├── elec_models.pkl      # LightGBM par zone, électricité
│   │   ├── water_models.pkl     # LightGBM par zone, eau
│   │   ├── elec_reference.csv   # Dernières valeurs connues (features de lag)
│   │   └── water_reference.csv
│   └── data/
│       ├── zone_day_summary.csv     # Agrégat zone-jour (clusters, scores, réclamations)
│       ├── elec_detail.csv          # Détail électricité (10 min)
│       ├── water_detail.csv         # Détail eau (5 min)
│       └── client_segmentation.csv  # 150 clients synthétiques
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Layout + navigation
│   │   ├── api.js               # Client API
│   │   ├── styles.css           # Thème clair/sombre
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Prediction.jsx
│   │       ├── Alerts.jsx
│   │       ├── WhatIf.jsx
│   │       └── Reporting.jsx
│   └── public/
│       └── redal-logo.png
│
├── notebook/
│   └── Plateforme_Intelligente_Redal.ipynb   # Pipeline complet (EDA → modèles → exports)
│
└── redal_dashboard.html          # Dashboard HTML autonome (sans backend requis)
```

---

## Résultats des modèles

Modèles LightGBM entraînés par zone, avec features météo/pression + lags temporels (1h/3h/6h) et moyennes/écarts-types glissants.

| Zone | AUC Électricité | AUC Eau |
|---|---|---|
| Zone A (Rabat) | 0.76 | 0.47 * |
| Zone B (Salé) | 0.66 | 0.99 |
| Zone C (Kénitra) | 0.75 | 0.73 |

\* Zone A eau : performance limitée par un nombre très faible d'exemples de fuites historiques (3 cas dans l'échantillon de test) — illustre concrètement l'impact du volume de données labellisées sur la performance d'un modèle supervisé.

**Segmentation** : K-Means (k=4) sur données zone-jour, révélant un cluster transversal "jours à risque" (~21% d'incidents, contre <0.3% pour les autres clusters).

---

## Limites connues et écarts par rapport au cahier des charges

| Prévu au CDC | Réalisé | Raison |
|---|---|---|
| Données réelles Redal | Données publiques de substitution | Aucune donnée fournie durant le stage |
| Référentiel géographique réel | Zones ancrées sur Rabat/Salé/Kénitra (illustratif) | Aucun découpage réel disponible |
| Random Forest / XGBoost | LightGBM | Meilleure gestion du déséquilibre de classes |
| Segmentation clients réels | Clients synthétiques (désagrégation) | Aucune donnée client individuelle disponible |
| Dashboard Power BI/Dash | Application web React + dashboard HTML | Plus de personnalisation, distribution simplifiée |
| Historique réclamations réel | Réclamations synthétiques corrélées aux incidents | Aucune source de substitution pertinente identifiée |

Ces écarts sont documentés en détail (avec justification) dans le rapport de stage et dans les notes méthodologiques intégrées au dashboard.

---

## Pistes d'amélioration et prochaines étapes

- Calibration de probabilité sur les modèles de prédiction (actuellement expérimentée puis retirée — probabilités parfois polarisées 0%/100%)
- Filtrage du dashboard par période et type d'incident
- Persistance de l'historique des rapports générés côté backend
- Export Word en complément du PDF
- Remplacement des données de substitution par de vraies données Redal si disponibilité confirmée — le pipeline (labellisation, modélisation, scoring) est directement réutilisable sans changement de méthode

---

## Licence et cadre

Projet académique réalisé dans le cadre d'un stage d'été EMSI Rabat / Redal. Les données utilisées sont publiques (Kaggle/UCI, Zenodo) et ne contiennent aucune information réelle sur les clients ou infrastructures de Redal.
