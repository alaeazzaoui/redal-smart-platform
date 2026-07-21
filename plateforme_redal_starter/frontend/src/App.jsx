import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Prediction from './pages/Prediction.jsx'
import Alerts from './pages/Alerts.jsx'
import WhatIf from './pages/WhatIf.jsx'
import Reporting from './pages/Reporting.jsx'
import { api } from './api.js'

const ICONS = {
  dashboard: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" />,
  prediction: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
  alerts: <path d="M12 3a5 5 0 0 0-5 5v3.2c0 .6-.2 1.2-.6 1.7L5 15h14l-1.4-2.1a2.7 2.7 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0h-4Z" />,
  whatif: <path d="M4 6h10M4 12h16M4 18h7 M16 4v4M20 10v4M13 16v4" />,
  reporting: <path d="M6 2h9l5 5v15H6V2Zm9 0v5h5M9 12h6M9 16h6M9 8h2" />,
}

function Icon({ name }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/prediction', label: 'Prédiction', icon: 'prediction' },
  { to: '/alertes', label: 'Alertes', icon: 'alerts' },
  { to: '/whatif', label: 'What-if', icon: 'whatif' },
  { to: '/reporting', label: 'Reporting', icon: 'reporting' },
]

export default function App() {
  const [apiStatus, setApiStatus] = useState('checking') // checking | ok | down

  useEffect(() => {
    api.health()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('down'))
  }, [])

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <div className="brand-mark">RD</div>
            <div className="brand-text">
              <div className="eyebrow">Direction Technique · Rabat-Salé-Kénitra</div>
              <h1>REDAL <span className="thin">/ Plateforme Intelligente</span></h1>
            </div>
          </div>

          <div className={'api-status ' + apiStatus}>
            <span className="api-dot"></span>
            {apiStatus === 'ok' && 'API connectée'}
            {apiStatus === 'down' && 'API hors ligne'}
            {apiStatus === 'checking' && 'Connexion…'}
          </div>
        </div>

        <nav className="tabbar">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="app-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/prediction" element={<Prediction />} />
          <Route path="/alertes" element={<Alerts />} />
          <Route path="/whatif" element={<WhatIf />} />
          <Route path="/reporting" element={<Reporting />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Plateforme intelligente de maintenance prédictive — Redal / EMSI Rabat · Stage d'été 2026
      </footer>
    </div>
  )
}