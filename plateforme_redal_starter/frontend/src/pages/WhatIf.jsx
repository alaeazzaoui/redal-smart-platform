import { useState } from 'react'
import { api, ZONES, riskClass } from '../api.js'

export default function WhatIf() {
  const [domain, setDomain] = useState('electricity')
  const [zone, setZone] = useState('Zone A')
  const [base, setBase] = useState({ temperature: 20, humidity: 60, pressure: 47, month: 7, dayofweek: 2, hour: 14 })
  const [modified, setModified] = useState({ temperature: 32, humidity: 40, pressure: 44, month: 7, dayofweek: 2, hour: 14 })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateModified(field, value) {
    setModified(m => ({ ...m, [field]: value }))
  }

  async function handleCompare() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const buildPayload = (src) => domain === 'electricity'
        ? { temperature: Number(src.temperature), humidity: Number(src.humidity), month: Number(src.month), dayofweek: Number(src.dayofweek), hour: Number(src.hour) }
        : { pressure: Number(src.pressure), month: Number(src.month), dayofweek: Number(src.dayofweek), hour: Number(src.hour) }

      const res = await api.whatif({
        domain, zone,
        base: buildPayload(base),
        modified: buildPayload(modified),
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const deltaColor = result ? (result.delta > 0 ? 'var(--danger)' : result.delta < 0 ? 'var(--ok)' : 'var(--text-dim)') : 'var(--text-dim)'

  return (
    <div>
      <div className="page-title">Simulation what-if</div>
      <div className="page-sub">Compare une situation de référence à un scénario modifié</div>

      <div className="panel" style={{ background: 'var(--panel-2)' }}>
        <div className="panel-note" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--text)' }}>Comment lire cette page :</b> à gauche, tu définis une situation de <b>référence</b> (ex : conditions normales). À droite, tu modifies un ou plusieurs paramètres pour simuler un <b>scénario différent</b> (ex : forte chaleur, pression anormale). Le modèle calcule une probabilité d'incident pour chacun des deux cas, et l'écart entre les deux (Δ) te montre l'impact réel du changement.
        </div>
      </div>

      <div className="panel">
        <div className="tabbar" style={{ marginBottom: 16 }}>
          <button className={'tab' + (domain === 'electricity' ? ' active' : '')} onClick={() => { setDomain('electricity'); setResult(null) }}>Électricité</button>
          <button className={'tab' + (domain === 'water' ? ' active' : '')} onClick={() => { setDomain('water'); setResult(null) }}>Eau</button>
        </div>

        <div className="field" style={{ maxWidth: 220, marginBottom: 20 }}>
          <label>Zone</label>
          <select value={zone} onChange={e => setZone(e.target.value)}>
            {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}><span className="sq" style={{ background: 'var(--text-faint)' }}></span>Référence (base)</div>
            <div className="panel-note" style={{ marginBottom: 10 }}>Situation de départ, à laquelle on compare le scénario</div>
            {domain === 'electricity' ? (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Température (°C)</label>
                  <input type="number" value={base.temperature} onChange={e => setBase(b => ({ ...b, temperature: e.target.value }))} />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Humidité (%)</label>
                  <input type="number" value={base.humidity} onChange={e => setBase(b => ({ ...b, humidity: e.target.value }))} />
                </div>
              </>
            ) : (
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Pression</label>
                <input type="number" step="0.1" value={base.pressure} onChange={e => setBase(b => ({ ...b, pressure: e.target.value }))} />
              </div>
            )}
          </div>

          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}><span className="sq" style={{ background: 'var(--zoneB)' }}></span>Scénario modifié</div>
            <div className="panel-note" style={{ marginBottom: 10 }}>Change une valeur pour voir son impact sur le risque</div>
            {domain === 'electricity' ? (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Température (°C)</label>
                  <input type="number" value={modified.temperature} onChange={e => updateModified('temperature', e.target.value)} />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Humidité (%)</label>
                  <input type="number" value={modified.humidity} onChange={e => updateModified('humidity', e.target.value)} />
                </div>
              </>
            ) : (
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Pression</label>
                <input type="number" step="0.1" value={modified.pressure} onChange={e => updateModified('pressure', e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={handleCompare} disabled={loading}>
            {loading ? 'Comparaison…' : 'Comparer les scénarios'}
          </button>
        </div>

        {error && <div className="error-state" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div className="result-box">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
              <div>
                <div className="panel-note">Référence</div>
                <div className="result-proba" style={{ fontSize: 28 }}>{(result.baseline.probability * 100).toFixed(1)}%</div>
                <span className={'risk-badge ' + riskClass(result.baseline.risk_level)}><span className="dot"></span>{result.baseline.risk_level}</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="panel-note" style={{ marginBottom: 4 }}>Écart (Δ)</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: deltaColor, fontWeight: 600 }}>
                  {result.delta > 0 ? '+' : ''}{(result.delta * 100).toFixed(1)} pts
                </div>
              </div>
              <div>
                <div className="panel-note">Scénario modifié</div>
                <div className="result-proba" style={{ fontSize: 28 }}>{(result.modified.probability * 100).toFixed(1)}%</div>
                <span className={'risk-badge ' + riskClass(result.modified.risk_level)}><span className="dot"></span>{result.modified.risk_level}</span>
              </div>
            </div>

            <div className="section-divider"></div>

            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
              {Math.abs(result.delta) < 0.001 ? (
                <>Les paramètres modifiés n'ont <b>quasiment aucun effet</b> sur la probabilité prédite pour {result.zone} — l'écart est négligeable ({(result.delta * 100).toFixed(2)} pt).</>
              ) : result.delta > 0 ? (
                <>Le scénario modifié <b style={{ color: 'var(--redal)' }}>augmente</b> la probabilité d'incident de <b>{(result.delta * 100).toFixed(1)} points</b> par rapport à la référence — les paramètres testés dégradent la situation pour {result.zone}.</>
              ) : (
                <>Le scénario modifié <b style={{ color: 'var(--ok)' }}>diminue</b> la probabilité d'incident de <b>{Math.abs(result.delta * 100).toFixed(1)} points</b> par rapport à la référence — les paramètres testés améliorent la situation pour {result.zone}.</>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}