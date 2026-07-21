import { useEffect, useState } from 'react'
import { api, ZONE_COLORS, riskClass } from '../api.js'

export default function Alerts() {
  const [threshold, setThreshold] = useState(0.3)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function load(t) {
    setLoading(true)
    setError(null)
    api.alerts(t)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(threshold) }, [])

  return (
    <div>
      <div className="page-title">Alertes</div>
      <div className="page-sub">Zones dont la probabilité d'incident prédite dépasse le seuil configuré</div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Configuration du seuil</div>
        </div>
        <div className="slider-row">
          <div className="slider-head">
            <span>Seuil d'alerte</span>
            <b>{(threshold * 100).toFixed(0)}%</b>
          </div>
          <input
            type="range" min="0.05" max="0.9" step="0.05"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
          />
        </div>
        <button className="btn" onClick={() => load(threshold)} disabled={loading}>
          {loading ? 'Vérification…' : 'Vérifier les alertes'}
        </button>
      </div>

      {error && <div className="error-state">{error}</div>}

      {data && !error && (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title"><span className="sq"></span>Résultat — {data.alerts.length} alerte(s)</div>
            <div className="panel-note">Vérifié à {new Date(data.checked_at).toLocaleTimeString('fr-FR')}</div>
          </div>

          {data.alerts.length === 0 && (
            <div className="empty-state">Aucune zone ne dépasse le seuil de {(threshold * 100).toFixed(0)}% actuellement.</div>
          )}

          {data.alerts.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Zone</th><th>Domaine</th><th>Probabilité</th><th>Niveau</th></tr>
                </thead>
                <tbody>
                  {data.alerts.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <span className="zone-pill">
                          <span className="d" style={{ background: ZONE_COLORS[a.zone] }}></span>{a.zone}
                        </span>
                      </td>
                      <td>{a.domain === 'electricity' ? 'Électricité' : 'Eau'}</td>
                      <td className="mono-num">{(a.probability * 100).toFixed(1)}%</td>
                      <td><span className={'risk-badge ' + riskClass(a.risk_level)}><span className="dot"></span>{a.risk_level}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <div className="panel-note">
          Les prédictions s'appuient sur les dernières données de référence connues (fin de l'historique 2017/2018). Pour un usage opérationnel réel, ce endpoint devra être branché sur un flux de données en direct (capteurs, SCADA) plutôt que sur des données figées.
        </div>
      </div>
    </div>
  )
}