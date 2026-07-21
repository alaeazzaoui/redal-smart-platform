# Tester le backend avant de passer au frontend

## 1. Installer les dépendances

Dans un terminal, à l'intérieur du dossier `backend/` :

```bash
pip install -r requirements.txt
```

## 2. Lancer le serveur

Toujours dans `backend/` :

```bash
python -m uvicorn main:app --reload --port 8000
```

Tu dois voir dans le terminal :
```
Modèles chargés : élec ['Zone A', 'Zone B', 'Zone C'] / eau ['Zone A', 'Zone B', 'Zone C']
...
Uvicorn running on http://127.0.0.1:8000
```

## 3. Vérifier que ça répond

Ouvre ton navigateur sur : **http://127.0.0.1:8000/docs**

Ça affiche une interface interactive (Swagger) générée automatiquement par FastAPI, avec tous les endpoints. Tu peux tester chacun directement depuis cette page, sans écrire de code, en cliquant sur "Try it out".

## 4. Tests à faire un par un

### a) Santé de l'API
`GET /api/health` → doit répondre `{"status": "ok", ...}`

### b) KPIs
`GET /api/kpis` → doit répondre des chiffres (taux d'incident moyen, conso moyenne, etc.)

### c) Prédiction électricité
`POST /api/predict/electricity`, avec ce corps JSON :
```json
{
  "zone": "Zone A",
  "temperature": 15,
  "humidity": 60,
  "month": 7,
  "dayofweek": 2,
  "hour": 14
}
```
→ doit répondre une probabilité entre 0 et 1 et un `risk_level`.

### d) Prédiction eau
`POST /api/predict/water`, avec :
```json
{
  "zone": "Zone B",
  "month": 7,
  "dayofweek": 2,
  "hour": 14,
  "pressure": 47.5
}
```

### e) Alertes
`GET /api/alerts?threshold=0.3` → doit lister les zones dont la probabilité prédite dépasse 0.3 (à ce stade, avec les données de référence figées, les résultats seront toujours les mêmes tant qu'on n'a pas branché de vraies données en direct — normal).

### f) Reporting
`GET /api/report?days=30` → doit répondre un résumé sur les 30 derniers jours + top 10 jours prioritaires.

## Si une erreur apparaît

Copie-colle le message d'erreur exact du terminal (pas juste le message dans le navigateur), et partage-le pour qu'on corrige ensemble avant de continuer.

## Une fois tous les tests OK

On passe au frontend (fichier 4 et suivants).