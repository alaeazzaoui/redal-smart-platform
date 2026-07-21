import { useEffect, useState } from 'react'
import { api, ZONES, ZONE_COLORS } from '../api.js'

function fmt(n, d = 0) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return (n * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
}

export default function Dashboard() {
  const [zone, setZone] = useState('ALL')
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.kpis(zone === 'ALL' ? null : zone)
      .then(setKpis)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [zone])

  return (
    <div>
      <div className="page-title">Vue d'ensemble</div>
      <div className="page-sub">Indicateurs clés de performance — réseau eau &amp; électricité</div>

      <div className="tabbar" style={{ marginBottom: 18 }}>
        {['ALL', ...ZONES].map(z => (
          <button
            key={z}
            className={'tab' + (zone === z ? ' active' : '')}
            onClick={() => setZone(z)}
          >
            {z === 'ALL' ? 'Toutes zones' : z}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Chargement des indicateurs…</div>}
      {error && <div className="error-state">Impossible de contacter le backend : {error}<br/>Vérifie que le serveur tourne bien sur http://127.0.0.1:8000</div>}

      {kpis && !loading && !error && (
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Taux incident moyen</div>
            <div className="kpi-value">{fmtPct(kpis.avg_incident_rate)}</div>
            <div className="kpi-sub">Électricité</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Consommation moyenne</div>
            <div className="kpi-value">{fmt(kpis.avg_conso / 1000, 1)}<span className="kpi-unit">MWh/j</span></div>
            <div className="kpi-sub">Moyenne journalière</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Réclamations</div>
            <div className="kpi-value">{fmt(kpis.total_complaints)}</div>
            <div className="kpi-sub">Cumul période</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Score priorité moyen</div>
            <div className="kpi-value">{kpis.avg_priority_score?.toFixed(3)}</div>
            <div className="kpi-sub">Incidents + cluster + réclamations</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Jours couverts</div>
            <div className="kpi-value">{fmt(kpis.days_covered)}</div>
            <div className="kpi-sub">Historique disponible</div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Zones surveillées</div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {ZONES.map(z => (
            <span key={z} className="zone-pill" style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 20 }}>
              <span className="d" style={{ background: ZONE_COLORS[z] }}></span>{z}
            </span>
          ))}
        </div>
        <div className="panel-note" style={{ marginTop: 14 }}>
          Pour l'historique détaillé (tendances, clusters, top priorités), consulte le dashboard complet (redal_dashboard.html) livré séparément. Cette page se concentre sur les indicateurs en direct via l'API.
        </div>
      </div>
    </div>
  )
}