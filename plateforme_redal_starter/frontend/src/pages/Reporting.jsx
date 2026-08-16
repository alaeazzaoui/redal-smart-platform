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
function fmtDelta(n) {
  if (n === null || n === undefined) return null
  const pct = (n * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return { text: `${n > 0 ? '+' : ''}${pct}%`, positive: n > 0, negative: n < 0 }
}

function DeltaTag({ value, invert = false }) {
  const d = fmtDelta(value)
  if (!d) return <span className="panel-note">vs période préc. : —</span>
  // invert=true pour les métriques où une baisse est une mauvaise nouvelle (rare ici) ; par défaut hausse = rouge, baisse = vert
  const bad = invert ? d.negative : d.positive
  const color = d.text === '+0.0%' || d.text === '-0.0%' ? 'var(--text-faint)' : (bad ? 'var(--redal)' : 'var(--ok)')
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, fontWeight: 600 }}>{d.text} vs période préc.</span>
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
      <div className="page-header">
        <div>
          <div className="page-title">Reporting</div>
          <div className="page-sub">Rapport périodique détaillé avec analyse comparative</div>
        </div>
      </div>

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
        <>
          {/* ===== En-tête du rapport ===== */}
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><span className="sq"></span>Rapport — {report.zone === 'ALL' ? 'Toutes zones' : report.zone}</div>
              <div className="panel-note">
                Période du {new Date(report.period_range.from).toLocaleDateString('fr-FR')} au {new Date(report.period_range.to).toLocaleDateString('fr-FR')}
                {' · '}Généré à {new Date(report.generated_at).toLocaleTimeString('fr-FR')}
              </div>
            </div>

            <div className="stat-strip">
              <div className="stat-item">
                <div className="stat-label">Taux incident moyen</div>
                <div className="stat-value">{fmtPct(report.summary.avg_incident_rate)}</div>
                <div className="stat-delta"><DeltaTag value={report.deltas.avg_incident_rate} /></div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Conso. moyenne</div>
                <div className="stat-value">{fmt(report.summary.avg_conso / 1000, 1)}<span className="unit">MWh/j</span></div>
                <div className="stat-delta"><DeltaTag value={report.deltas.avg_conso} /></div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Réclamations</div>
                <div className="stat-value">{fmt(report.summary.total_complaints)}</div>
                <div className="stat-delta"><DeltaTag value={report.deltas.total_complaints} /></div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Score priorité moyen</div>
                <div className="stat-value">{report.summary.avg_priority_score?.toFixed(4)}</div>
                <div className="stat-delta"><DeltaTag value={report.deltas.avg_priority_score} /></div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Jours à risque</div>
                <div className="stat-value">{fmtPct(report.summary.risk_cluster_share, 1)}</div>
                <div className="stat-delta panel-note">Part du cluster à risque élevé</div>
              </div>
            </div>
          </div>

          {/* ===== Analyse automatique ===== */}
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><span className="sq"></span>Analyse de la période</div>
              <div className="panel-note">Généré automatiquement à partir des indicateurs</div>
            </div>
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.insights.map((text, i) => (
                <li key={i} style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.6 }}>{text}</li>
              ))}
              {report.insights.length === 0 && <div className="empty-state">Pas assez de données pour générer une analyse sur cette période.</div>}
            </ul>
          </div>

          {/* ===== Détail par zone ===== */}
          {report.zone_breakdown && report.zone_breakdown.length > 1 && (
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title"><span className="sq"></span>Détail par zone sur la période</div>
                <div className="panel-note">Trié par score de priorité décroissant</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Zone</th><th>Taux incident</th><th>Conso. moyenne</th><th>Réclamations</th><th>Score priorité</th></tr>
                  </thead>
                  <tbody>
                    {report.zone_breakdown.map(r => (
                      <tr key={r.zone}>
                        <td><span className="zone-pill"><span className="d" style={{ background: ZONE_COLORS[r.zone] }}></span>{r.zone}</span></td>
                        <td>{fmtPct(r.avg_incident_rate)}</td>
                        <td>{fmt(r.avg_conso)}</td>
                        <td>{fmt(r.total_complaints)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.avg_priority_score.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== Comparaison période précédente ===== */}
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><span className="sq"></span>Comparaison avec la période précédente</div>
              <div className="panel-note">Même durée ({report.period_days} j), immédiatement avant la période analysée</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Indicateur</th><th>Période actuelle</th><th>Période précédente</th><th>Évolution</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Taux incident moyen</td>
                    <td>{fmtPct(report.summary.avg_incident_rate)}</td>
                    <td>{fmtPct(report.previous_summary.avg_incident_rate)}</td>
                    <td><DeltaTag value={report.deltas.avg_incident_rate} /></td>
                  </tr>
                  <tr>
                    <td>Consommation moyenne</td>
                    <td>{fmt(report.summary.avg_conso)}</td>
                    <td>{fmt(report.previous_summary.avg_conso)}</td>
                    <td><DeltaTag value={report.deltas.avg_conso} /></td>
                  </tr>
                  <tr>
                    <td>Réclamations (total)</td>
                    <td>{fmt(report.summary.total_complaints)}</td>
                    <td>{fmt(report.previous_summary.total_complaints)}</td>
                    <td><DeltaTag value={report.deltas.total_complaints} /></td>
                  </tr>
                  <tr>
                    <td>Score priorité moyen</td>
                    <td>{report.summary.avg_priority_score?.toFixed(4)}</td>
                    <td>{report.previous_summary.avg_priority_score?.toFixed(4)}</td>
                    <td><DeltaTag value={report.deltas.avg_priority_score} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ===== Top jours prioritaires ===== */}
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><span className="sq"></span>Top 10 jours prioritaires de la période</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Zone</th><th>Taux incident</th><th>Score priorité</th></tr></thead>
                <tbody>
                  {report.top_priority_days.map((r, i) => (
                    <tr key={i}>
                      <td>{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td><span className="zone-pill"><span className="d" style={{ background: ZONE_COLORS[r.zone] }}></span>{r.zone}</span></td>
                      <td>{fmtPct(r.incident_rate, 1)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.priority_score?.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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