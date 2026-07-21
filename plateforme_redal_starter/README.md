# Plateforme Intelligente Redal — Point de départ

Ce dossier contient les fondations pour construire la plateforme complète (API + dashboard multi-pages) en local, à poursuivre avec Claude Code.

## Contenu déjà prêt

```
backend/
  models/
    elec_models.pkl      → 3 modèles LightGBM (Zone A/B/C), prédiction incidents électriques
    water_models.pkl     → 3 modèles LightGBM (Zone A/B/C), prédiction fuites eau
    elec_reference.csv   → 500 dernières lignes réelles (pour valeurs de lag par défaut)
    water_reference.csv  → idem pour l'eau
  data/
    zone_day_summary.csv     → résumé zone-jour (clusters, scores priorité, réclamations)
    elec_detail.csv          → détail électricité (10 min, 2017)
    water_detail.csv         → détail eau (5 min, 2018)
    client_segmentation.csv  → 150 clients synthétiques + clusters
```

Les modèles sont déjà entraînés sur tes vraies données (mêmes résultats que dans le notebook Colab : AUC 0.66–0.99 selon zone/métier).

## Ce qu'il reste à construire

### 1. Backend (FastAPI)
Créer `backend/main.py` avec les endpoints :
- `GET /api/kpis?zone=` → KPIs globaux (lit zone_day_summary.csv)
- `POST /api/predict/electricity` → charge elec_models.pkl, prédit à partir des inputs (zone, météo, historique récent)
- `POST /api/predict/water` → idem pour l'eau
- `GET /api/alerts?zone=&threshold=` → compare les prédictions récentes à un seuil, retourne les zones en alerte
- `POST /api/whatif` → rejoue predict/electricity ou predict/water avec des paramètres modifiés par l'utilisateur
- `GET /api/report?zone=&period=` → génère un résumé (base pour un futur export PDF/Word)

Dépendances : `fastapi`, `uvicorn`, `lightgbm`, `pandas`, `scikit-learn`, `python-multipart`

Lancer avec : `uvicorn main:app --reload --port 8000`

### 2. Frontend (React, 5 pages)
- **Dashboard** — reprendre la structure du fichier `redal_dashboard.html` déjà livré comme base visuelle, mais brancher sur l'API au lieu de données statiques
- **Prédiction en direct** — formulaire (zone, météo, date) → appelle `/api/predict/*` → affiche probabilité + gauge
- **Alertes** — liste des zones en alerte, configuration de seuils, appelle `/api/alerts`
- **Simulation what-if** — sliders pour modifier des paramètres → appelle `/api/whatif` → compare avant/après
- **Reporting** — bouton de génération + historique des rapports générés

Utiliser `react-router-dom` pour la navigation entre pages. Réutiliser la palette de couleurs et les styles du dashboard existant (thème sombre "salle de contrôle", couleurs par zone : Zone A #5B9BD5, Zone B #E0574C, Zone C #4FB585).

## Prompt de démarrage suggéré pour Claude Code

```
Lis le README.md et le contenu de backend/models et backend/data.
Construis d'abord le backend FastAPI (main.py) avec les endpoints décrits,
teste que /api/kpis et /api/predict/electricity fonctionnent avec les
modèles pickle fournis, puis on passera au frontend page par page.
```

## Contexte du projet (pour mémoire)

Stage EMSI Rabat / Redal — plateforme de maintenance prédictive construite sur données de substitution (Tetouan Power Consumption + BattLeDIM 2020), en l'absence de données réelles Redal. Voir la note méthodologique dans `redal_dashboard.html` pour le détail des choix méthodologiques et écarts par rapport au cahier des charges initial.
