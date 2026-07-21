const API_BASE = 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Erreur API (${res.status}) : ${detail}`)
  }
  return res.json()
}

export const api = {
  health: () => request('/api/health'),
  kpis: (zone) => request(`/api/kpis${zone ? `?zone=${encodeURIComponent(zone)}` : ''}`),
  zones: () => request('/api/zones'),
  predictElectricity: (payload) => request('/api/predict/electricity', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  predictWater: (payload) => request('/api/predict/water', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  alerts: (threshold) => request(`/api/alerts?threshold=${threshold}`),
  whatif: (payload) => request('/api/whatif', {
    method: 'POST', body: JSON.stringify(payload),
  }),
  report: (zone, days) => request(`/api/report?days=${days}${zone ? `&zone=${encodeURIComponent(zone)}` : ''}`),
}

export const ZONES = ['Zone A', 'Zone B', 'Zone C']
export const ZONE_COLORS = { 'Zone A': '#5B9BD5', 'Zone B': '#E0574C', 'Zone C': '#4FB585' }

export function riskClass(level) {
  const map = { faible: 'risk-faible', modéré: 'risk-modere', élevé: 'risk-eleve', critique: 'risk-critique' }
  return map[level] || 'risk-faible'
}