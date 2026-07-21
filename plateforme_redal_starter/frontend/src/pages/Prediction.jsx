import { useState } from 'react'
import { api, ZONES, riskClass } from '../api.js'

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

export default function Prediction() {
  const [domain, setDomain] = useState('electricity')
  const [zone, setZone] = useState('Zone A')
  const [form, setForm] = useState({
    temperature: 20, humidity: 60, pressure: 47,
    month: new Date().getMonth() + 1, dayofweek: new Date().getDay(), hour: new Date().getHours(),
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handlePredict() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      let res
      if (domain === 'electricity') {
        res = await api.predictElectricity({
          zone, temperature: Number(form.temperature), humidity: Number(form.humidity),
          month: Number(form.month), dayofweek: Number(form.dayofweek), hour: Number(form.hour),
        })
      } else {
        res = await api.predictWater({
          zone, pressure: Number(form.pressure),
          month: Number(form.month), dayofweek: Number(form.dayofweek), hour: Number(form.hour),
        })
      }
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-title">Prédiction en direct</div>
      <div className="page-sub">Interroge les modèles LightGBM avec des paramètres personnalisés</div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title"><span className="sq"></span>Paramètres</div>
        </div>

        <div className="tabbar" style={{ marginBottom: 16 }}>
          <button className={'tab' + (domain === 'electricity' ? ' active' : '')} onClick={() => { setDomain('electricity'); setResult(null) }}>Électricité</button>
          <button className={'tab' + (domain === 'water' ? ' active' : '')} onClick={() => { setDomain('water'); setResult(null) }}>Eau</button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Zone</label>
            <select value={zone} onChange={e => setZone(e.target.value)}>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>

          {domain === 'electricity' && (
            <>
              <div className="field">
                <label>Température (°C)</label>
                <input type="number" value={form.temperature} onChange={e => update('temperature', e.target.value)} />
              </div>
              <div className="field">
                <label>Humidité (%)</label>
                <input type="number" value={form.humidity} onChange={e => update('humidity', e.target.value)} />
              </div>
            </>
          )}

          {domain === 'water' && (
            <div className="field">
              <label>Pression réseau</label>
              <input type="number" step="0.1" value={form.pressure} onChange={e => update('pressure', e.target.value)} />
            </div>
          )}

          <div className="field">
            <label>Mois</label>
            <select value={form.month} onChange={e => update('month', e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Jour de semaine</label>
            <select value={form.dayofweek} onChange={e => update('dayofweek', e.target.value)}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Heure</label>
            <input type="number" min="0" max="23" value={form.hour} onChange={e => update('hour', e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button className="btn" onClick={handlePredict} disabled={loading}>
            {loading ? 'Calcul en cours…' : 'Lancer la prédiction'}
          </button>
        </div>

        {error && <div className="error-state" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div className="result-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="panel-note" style={{ marginBottom: 6 }}>
                  Probabilité d'incident — {result.zone} · {domain === 'electricity' ? 'Électricité' : 'Eau'}
                </div>
                <div className="result-proba">{(result.probability * 100).toFixed(1)}%</div>
              </div>
              <span className={'risk-badge ' + riskClass(result.risk_level)}>
                <span className="dot"></span>{result.risk_level}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}