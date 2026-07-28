import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { api, ZONES, ZONE_COLORS } from '../api.js'

// Coordonnées réelles des 3 villes de la région Rabat-Salé-Kénitra,
// utilisées comme ancrage géographique pour les 3 zones (référentiel fictif documenté).
const ZONE_LOCATIONS = {
  'Zone A': { name: 'Rabat', lat: 34.0209, lng: -6.8416 },
  'Zone B': { name: 'Salé', lat: 34.0531, lng: -6.7985 },
  'Zone C': { name: 'Kénitra', lat: 34.2610, lng: -6.5802 },
}

// Performance des modèles LightGBM (issue des entraînements du notebook — valeurs fixes de référence)
const MODEL_PERF = {
  'Zone A': { elecAUC: 0.76, waterAUC: 0.47 },
  'Zone B': { elecAUC: 0.66, waterAUC: 0.99 },
  'Zone C': { elecAUC: 0.75, waterAUC: 0.73 },
}

function fmt(n, d = 0) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return (n * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
}
function riskTierFromRank(rank) {
  if (rank === 2) return { label: 'critique', color: '#C0392B' }
  if (rank === 1) return { label: 'à surveiller', color: '#C77B1E' }
  return { label: 'nominal', color: '#2E8B63' }
}

// Petit graphique de tendance en SVG (moyenne mobile 7 jours pour lisser)
function TrendChart({ series, colorByZone, valueKey, height = 180, formatY = (v) => fmt(v) }) {
  const width = 600
  const padLeft = 50, padRight = 14, padTop = 12, padBottom = 24

  const zones = Object.keys(series)
  const allVals = zones.flatMap(z => series[z].map(p => p[valueKey]))
  if (allVals.length === 0) return null
  const minY = Math.min(...allVals), maxY = Math.max(...allVals)
  const yPad = (maxY - minY) * 0.1 || 1
  const y0 = minY - yPad, y1 = maxY + yPad

  const n = series[zones[0]].length
  const xScale = i => padLeft + (i / (n - 1)) * (width - padLeft - padRight)
  const yScale = v => (height - padBottom) - ((v - y0) / (y1 - y0)) * (height - padBottom - padTop)

  const gridN = 4
  const monthsShown = new Set()

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {Array.from({ length: gridN + 1 }).map((_, g) => {
        const v = y0 + (g / gridN) * (y1 - y0)
        const y = yScale(v)
        return (
          <g key={g}>
            <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#EEF1F4" strokeWidth="1" />
            <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#97A1AB">{formatY(v)}</text>
          </g>
        )
      })}
      {zones.map(z => {
        const pts = series[z]
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(p[valueKey]).toFixed(1)}`).join(' ')
        return <path key={z} d={path} fill="none" stroke={colorByZone[z]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      })}
      <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="#E5E8EC" strokeWidth="1" />
    </svg>
  )
}

// Lisse une série par moyenne mobile (fenêtre en jours)
function rollingAvg(rows, key, window = 7) {
  return rows.map((r, i) => {
    const slice = rows.slice(Math.max(0, i - window + 1), i + 1)
    const avg = slice.reduce((a, c) => a + (c[key] || 0), 0) / slice.length
    return { ...r, [key]: avg }
  })
}

export default function Dashboard() {
  const [zone, setZone] = useState('ALL')
  const [kpis, setKpis] = useState(null)
  const [zoneKpis, setZoneKpis] = useState({})
  const [timeseries, setTimeseries] = useState({})
  const [report, setReport] = useState(null)
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

  useEffect(() => {
    Promise.all(ZONES.map(z => api.kpis(z).then(res => [z, res])))
      .then(entries => setZoneKpis(Object.fromEntries(entries)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all(ZONES.map(z => api.timeseries(z).then(res => [z, res.series])))
      .then(entries => {
        const obj = {}
        entries.forEach(([z, series]) => { obj[z] = rollingAvg(series, 'conso_mean', 7) })
        setTimeseries(obj)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.report(zone === 'ALL' ? null : zone, 365).then(setReport).catch(() => {})
  }, [zone])

  const zoneRanks = (() => {
    const entries = Object.entries(zoneKpis)
    if (entries.length < ZONES.length) return {}
    const sorted = [...entries].sort((a, b) => a[1].avg_priority_score - b[1].avg_priority_score)
    return Object.fromEntries(sorted.map(([z], i) => [z, i]))
  })()

  const componentMax = (() => {
    const entries = Object.values(zoneKpis)
    if (entries.length === 0) return { incident: 0.001, cluster: 0.001, complaints: 0.001 }
    return {
      incident: Math.max(...entries.map(e => e.priority_breakdown?.incident_component || 0)) || 0.001,
      cluster: Math.max(...entries.map(e => e.priority_breakdown?.risk_cluster_component || 0)) || 0.001,
      complaints: Math.max(...entries.map(e => e.priority_breakdown?.complaints_component || 0)) || 0.001,
    }
  })()

  const zonesToShow = zone === 'ALL' ? ZONES : [zone]
  const filteredTimeseries = Object.fromEntries(Object.entries(timeseries).filter(([z]) => zonesToShow.includes(z)))

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Vue d'ensemble</div>
          <div className="page-sub">Indicateurs clés — réseau eau &amp; électricité, région Rabat-Salé-Kénitra</div>
        </div>
        <div className="tabbar" style={{ padding: 0, marginLeft: 'auto' }}>
          {['ALL', ...ZONES].map(z => (
            <button key={z} className={'tab' + (zone === z ? ' active' : '')} onClick={() => setZone(z)} style={{ borderRadius: 8 }}>
              {z === 'ALL' ? 'Toutes zones' : z}
            </button>
          ))}
        </div>
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

      <div className="two-col">
        <div>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="panel-head" style={{ padding: '20px 22px 0' }}>
              <div className="panel-title"><span className="sq"></span>Carte des zones — Rabat-Salé-Kénitra</div>
              <div className="panel-note">Ancrage géographique réel · niveau de risque en direct</div>
            </div>
            <div style={{ height: 420, marginTop: 16 }}>
              <MapContainer center={[34.11, -6.75]} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {ZONES.map(z => {
                  const loc = ZONE_LOCATIONS[z]
                  const zk = zoneKpis[z]
                  const tier = riskTierFromRank(zoneRanks[z])
                  return (
                    <CircleMarker key={z} center={[loc.lat, loc.lng]} radius={20} pathOptions={{ color: tier.color, fillColor: tier.color, fillOpacity: 0.35, weight: 2 }}>
                      <Popup>
                        <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', minWidth: 160 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{z} — {loc.name}</div>
                          <div style={{ fontSize: 12.5, color: '#5B6570', marginBottom: 6 }}>Statut : <b style={{ color: tier.color }}>{tier.label}</b></div>
                          {zk && (
                            <>
                              <div style={{ fontSize: 12.5 }}>Taux incident : {fmtPct(zk.avg_incident_rate)}</div>
                              <div style={{ fontSize: 12.5 }}>Score priorité : {zk.avg_priority_score?.toFixed(4)}</div>
                              <div style={{ fontSize: 12.5 }}>Réclamations : {fmt(zk.total_complaints)}</div>
                            </>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            </div>
            <div className="panel-note" style={{ padding: '14px 22px 20px' }}>
              Les zones A/B/C sont ancrées sur les 3 villes de la région (Rabat, Salé, Kénitra) à titre de référentiel géographique illustratif, en l'absence du découpage réel des zones de desserte Redal.
            </div>
          </div>
        </div>

        <div className="sticky-panel">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title"><span className="sq"></span>Statut par zone</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ZONES.map(z => {
                const zk = zoneKpis[z]
                const tier = riskTierFromRank(zoneRanks[z])
                return (
                  <div key={z} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, borderLeft: `3px solid ${tier.color}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="zone-pill">
                        <span className="d" style={{ background: ZONE_COLORS[z] }}></span>{z}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: tier.color, textTransform: 'uppercase' }}>{tier.label}</span>
                    </div>
                    {zk ? (
                      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span>Incidents : {fmtPct(zk.avg_incident_rate)}</span>
                        <span>Score priorité : {zk.avg_priority_score?.toFixed(4)}</span>
                      </div>
                    ) : <div className="panel-note">Chargement…</div>}

                    {zk?.priority_breakdown && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {[
                          { label: 'Incidents (50%)', value: zk.priority_breakdown.incident_component, max: componentMax.incident },
                          { label: 'Cluster risque (25%)', value: zk.priority_breakdown.risk_cluster_component, max: componentMax.cluster },
                          { label: 'Réclamations (25%)', value: zk.priority_breakdown.complaints_component, max: componentMax.complaints },
                        ].map(row => (
                          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 108, fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{row.label}</span>
                            <div style={{ flex: 1, height: 5, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, (row.value / row.max) * 100)}%`, height: '100%', background: tier.color, borderRadius: 3 }}></div>
                            </div>
                            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', width: 44, textAlign: 'right' }}>{row.value?.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Tendance de consommation ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Tendance de consommation électrique</div>
          <div className="panel-note">Moyenne mobile 7 jours</div>
        </div>
        {Object.keys(timeseries).length > 0 ? (
          <>
            <TrendChart series={filteredTimeseries} colorByZone={ZONE_COLORS} valueKey="conso_mean" formatY={v => fmt(v / 1000, 0) + 'k'} />
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {zonesToShow.map(z => (
                <span key={z} className="zone-pill" style={{ fontSize: 12 }}>
                  <span className="d" style={{ background: ZONE_COLORS[z] }}></span>{z}
                </span>
              ))}
            </div>
          </>
        ) : <div className="loading">Chargement du graphique…</div>}
      </div>

      {/* ===== Table de priorité ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Priorité d'intervention — top 15 jours/zones</div>
          <div className="panel-note">Score = 0.5×incidents + 0.25×cluster risque + 0.25×réclamations</div>
        </div>
        {report ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Zone</th><th>Taux incident</th><th>Score priorité</th></tr></thead>
              <tbody>
                {report.top_priority_days.map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td><span className="zone-pill"><span className="d" style={{ background: ZONE_COLORS[r.zone] }}></span>{r.zone}</span></td>
                    <td>{fmtPct(r.incident_rate, 1)}</td>
                    <td>{(r.priority_score_v2 ?? r.priority_score)?.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="loading">Chargement…</div>}
      </div>

      {/* ===== Performance des modèles ===== */}
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Performance des modèles prédictifs (LightGBM)</div>
          <div className="panel-note">AUC — aire sous la courbe ROC</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${zonesToShow.length}, 1fr)`, gap: 14 }}>
          {zonesToShow.map(z => {
            const p = MODEL_PERF[z]
            return (
              <div key={z} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ZONE_COLORS[z] }}></span>{z}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                  <span>Électricité</span><b style={{ color: 'var(--text)' }}>{p.elecAUC.toFixed(2)}</b>
                </div>
                <div style={{ height: 4, background: 'var(--border-soft)', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${p.elecAUC * 100}%`, height: '100%', background: 'var(--elec)' }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
                  <span>Eau</span><b style={{ color: 'var(--text)' }}>{p.waterAUC.toFixed(2)}</b>
                </div>
                <div style={{ height: 4, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${p.waterAUC * 100}%`, height: '100%', background: 'var(--water)' }}></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-note">
          Le statut (nominal / à surveiller / critique) classe les 3 zones <b>entre elles</b> par score de priorité — ce n'est pas un seuil absolu. Sur l'historique 2017/2018, les écarts entre zones restent faibles en moyenne annuelle ; l'écart se creuse surtout sur des journées précises.
        </div>
      </div>

      <div className="panel">
        <div className="panel-note">
          Pour l'historique détaillé complémentaire, consulte aussi le dashboard d'analyse (redal_dashboard.html) livré séparément.
        </div>
      </div>
    </div>
  )
}