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
  const bad = invert ? d.negative : d.positive
  const color = d.text === '+0.0%' || d.text === '-0.0%' ? 'var(--text-faint)' : (bad ? 'var(--redal)' : 'var(--ok)')
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, fontWeight: 600 }}>{d.text} vs période préc.</span>
}

// Anneau de pourcentage (façon donut chart)
function PercentRing({ value, label, sub, size = 110, stroke = 10, color = 'var(--redal)' }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value || 0))
  const offset = circ * (1 - pct)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fontFamily="IBM Plex Mono" fontSize="20" fontWeight="700" fill="var(--text)">
          {(pct * 100).toFixed(1)}%
        </text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// Barre comparative (période actuelle vs précédente)
function CompareBar({ label, current, previous, format = (v) => fmt(v), color = 'var(--redal)' }) {
  const max = Math.max(current || 0, previous || 0) || 1
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
        <span style={{ width: 62, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>Actuelle</span>
        <div style={{ flex: 1, height: 10, background: 'var(--border-soft)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${(current / max) * 100}%`, height: '100%', background: color, borderRadius: 4 }}></div>
        </div>
        <span style={{ width: 70, fontSize: 11.5, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text)' }}>{format(current)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 62, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>Précédente</span>
        <div style={{ flex: 1, height: 10, background: 'var(--border-soft)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${(previous / max) * 100}%`, height: '100%', background: 'var(--text-faint)', borderRadius: 4 }}></div>
        </div>
        <span style={{ width: 70, fontSize: 11.5, fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--text-dim)' }}>{format(previous)}</span>
      </div>
    </div>
  )
}

export default function Reporting() {
  const [zone, setZone] = useState('ALL')
  const [days, setDays] = useState(30)
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  async function downloadPdf() {
    setDownloadingPdf(true)
    try {
      const url = api.reportPdfUrl(zone === 'ALL' ? null : zone, days)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Erreur (${res.status})`)
      const blob = await res.blob()
      const a = document.createElement('a')
      const objUrl = URL.createObjectURL(blob)
      a.href = objUrl
      a.download = `rapport_redal_${zone === 'ALL' ? 'toutes_zones' : zone.replace(' ', '_')}_${days}j.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } catch (e) {
      setError('Échec du téléchargement PDF : ' + e.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

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
              <button className="btn btn-secondary" onClick={downloadPdf} disabled={downloadingPdf} style={{ fontSize: 12.5, padding: '8px 16px' }}>
                {downloadingPdf ? 'Génération PDF…' : '⬇ Télécharger en PDF'}
              </button>
            </div>
            <div className="panel-note" style={{ marginTop: -8, marginBottom: 12 }}>
              Période du {new Date(report.period_range.from).toLocaleDateString('fr-FR')} au {new Date(report.period_range.to).toLocaleDateString('fr-FR')}
              {' · '}Généré à {new Date(report.generated_at).toLocaleTimeString('fr-FR')}
            </div>

            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'space-around', padding: '10px 0 6px' }}>
              <PercentRing
                value={report.summary.avg_incident_rate}
                label="Taux incident moyen"
                sub={<DeltaTag value={report.deltas.avg_incident_rate} />}
                color="var(--redal)"
              />
              <PercentRing
                value={report.summary.risk_cluster_share}
                label="Jours à risque"
                sub="Part du cluster à risque"
                color="#7A241C"
              />
            </div>

            <div className="section-divider"></div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '4px 28px' }}>
              <CompareBar
                label="Consommation moyenne (kWh/j)"
                current={report.summary.avg_conso}
                previous={report.previous_summary.avg_conso}
                format={v => fmt(v)}
              />
              <CompareBar
                label="Réclamations (total)"
                current={report.summary.total_complaints}
                previous={report.previous_summary.total_complaints}
                format={v => fmt(v)}
              />
              <CompareBar
                label="Score priorité moyen"
                current={report.summary.avg_priority_score}
                previous={report.previous_summary.avg_priority_score}
                format={v => v?.toFixed(4)}
              />
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