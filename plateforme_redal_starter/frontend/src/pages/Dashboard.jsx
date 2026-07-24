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

function fmt(n, d = 0) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n, d = 2) {
  if (n === null || n === undefined) return '—'
  return (n * 100).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%'
}

function riskTierFromRank(rank) {
  // rank: 0 = zone la moins prioritaire, 2 = la plus prioritaire (sur 3 zones)
  if (rank === 2) return { label: 'critique', color: '#C0392B' }
  if (rank === 1) return { label: 'à surveiller', color: '#C77B1E' }
  return { label: 'nominal', color: '#2E8B63' }
}

export default function Dashboard() {
  const [zone, setZone] = useState('ALL')
  const [kpis, setKpis] = useState(null)
  const [zoneKpis, setZoneKpis] = useState({})
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

  // Classement des zones par score de priorité (0 = la plus faible, 2 = la plus élevée)
  const zoneRanks = (() => {
    const entries = Object.entries(zoneKpis)
    if (entries.length < ZONES.length) return {}
    const sorted = [...entries].sort((a, b) => a[1].avg_priority_score - b[1].avg_priority_score)
    return Object.fromEntries(sorted.map(([z], i) => [z, i]))
  })()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Vue d'ensemble</div>
          <div className="page-sub">Indicateurs clés — réseau eau &amp; électricité, région Rabat-Salé-Kénitra</div>
        </div>
        <div className="tabbar" style={{ padding: 0 }}>
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
        {/* Colonne principale : carte interactive */}
        <div>
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="panel-head" style={{ padding: '20px 22px 0' }}>
              <div className="panel-title"><span className="sq"></span>Carte des zones — Rabat-Salé-Kénitra</div>
              <div className="panel-note">Ancrage géographique réel · niveau de risque en direct</div>
            </div>
            <div style={{ height: 420, marginTop: 16 }}>
              <MapContainer center={[34.11, -6.75]} zoom={10} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {ZONES.map(z => {
                  const loc = ZONE_LOCATIONS[z]
                  const zk = zoneKpis[z]
                  const tier = riskTierFromRank(zoneRanks[z])
                  return (
                    <CircleMarker
                      key={z}
                      center={[loc.lat, loc.lng]}
                      radius={20}
                      pathOptions={{ color: tier.color, fillColor: tier.color, fillOpacity: 0.35, weight: 2 }}
                    >
                      <Popup>
                        <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', minWidth: 160 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{z} — {loc.name}</div>
                          <div style={{ fontSize: 12.5, color: '#5B6570', marginBottom: 6 }}>Statut : <b style={{ color: tier.color }}>{tier.label}</b></div>
                          {zk && (
                            <>
                              <div style={{ fontSize: 12.5 }}>Taux incident : {fmtPct(zk.avg_incident_rate)}</div>
                              <div style={{ fontSize: 12.5 }}>Score priorité : {zk.avg_priority_score?.toFixed(3)}</div>
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

        {/* Colonne latérale : statut par zone */}
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
                        <span>Score priorité : {zk.avg_priority_score?.toFixed(3)}</span>
                      </div>
                    ) : <div className="panel-note">Chargement…</div>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-note">
              Le statut (nominal / à surveiller / critique) classe les 3 zones <b>entre elles</b> par score de priorité — ce n'est pas un seuil absolu. Sur l'historique 2017/2018, les écarts entre zones restent faibles en moyenne annuelle ; l'écart se creuse surtout sur des journées précises (cf. dashboard d'analyse complet).
            </div>
          </div>

          <div className="panel">
            <div className="panel-note">
              Pour l'historique détaillé (tendances, clusters, top priorités), consulte le dashboard d'analyse complet (redal_dashboard.html) livré séparément.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}