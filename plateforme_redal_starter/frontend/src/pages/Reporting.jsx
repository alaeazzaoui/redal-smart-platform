import { useState } from 'react'
import { api, ZONES, ZONE_COLORS } from '../api.js'

function fmt(n, d = 0) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return (n * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
}

export default function Reporting() {
  const [zone, setZone] = useState('ALL')
  const [days, setDays] = useState(30)
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.report(zone === 'ALL' ? null : zone, days)
      setReport(res)
      setHistory(h => [{ ...res, id: Date.now() }, ...h].slice(0, 8))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-title">Reporting</div>
      <div className="page-sub">Génère un résumé périodique à partir des données de synthèse</div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Paramètres du rapport</div>
        </div>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>Zone</label>
            <select value={zone} onChange={e => setZone(e.target.value)}>
              <option value="ALL">Toutes zones</option>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Période (jours)</label>
            <select value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
              <option value={365}>Année complète</option>
            </select>
          </div>
        </div>
        <button className="btn" onClick={generate} disabled={loading}>
          {loading ? 'Génération…' : 'Générer le rapport'}
        </button>
        {error && <div className="error-state" style={{ marginTop: 16 }}>{error}</div>}
      </div>

      {report && !error && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><span className="sq"></span>Rapport — {report.zone === 'ALL' ? 'Toutes zones' : report.zone}</div>
            <div className="panel-note">Généré le {new Date(report.generated_at).toLocaleString('fr-FR')} · {report.period_days} j</div>
          </div>

          <div className="kpi-row" style={{ marginTop: 0 }}>
            <div className="kpi">
              <div className="kpi-label">Taux incident moyen</div>
              <div className="kpi-value">{fmtPct(report.summary.avg_incident_rate)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Conso. moyenne</div>
              <div className="kpi-value">{fmt(report.summary.avg_conso / 1000, 1)}<span className="kpi-unit">MWh/j</span></div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Réclamations</div>
              <div className="kpi-value">{fmt(report.summary.total_complaints)}</div>
            </div>
          </div>

          <div className="panel-title" style={{ margin: '18px 0 10px' }}>Top jours prioritaires de la période</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Zone</th><th>Taux incident</th><th>Score priorité</th></tr></thead>
              <tbody>
                {report.top_priority_days.map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      <span className="zone-pill">
                        <span className="d" style={{ background: ZONE_COLORS[r.zone] }}></span>{r.zone}
                      </span>
                    </td>
                    <td>{fmtPct(r.incident_rate, 1)}</td>
                    <td>{(r.priority_score_v2 ?? r.priority_score)?.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><span className="sq"></span>Historique de la session</div>
            <div className="panel-note">{history.length} rapport(s) généré(s)</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Heure</th><th>Zone</th><th>Période</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td>{new Date(h.generated_at).toLocaleTimeString('fr-FR')}</td>
                    <td>{h.zone === 'ALL' ? 'Toutes zones' : h.zone}</td>
                    <td>{h.period_days} j</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-note" style={{ marginTop: 12 }}>
            Cet historique est propre à la session en cours (non persisté). Une future évolution pourra le sauvegarder côté backend et ajouter un export PDF/Word.
          </div>
        </div>
      )}
    </div>
  )
}