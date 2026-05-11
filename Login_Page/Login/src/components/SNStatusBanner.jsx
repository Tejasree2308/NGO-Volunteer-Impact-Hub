import React, { useState, useEffect } from 'react'
import { snConnectionState } from '../api/servicenow'

const CONFIG = {
  live:        { bg: '#064e3b', border: '#10b981', dot: '#34d399', text: 'ServiceNow Live — All data is saving to dev286774.service-now.com' },
  demo:        { bg: '#78350f', border: '#f59e0b', dot: '#fbbf24', text: 'Demo Mode — Changes are NOT saved to ServiceNow (using sample data)' },
  unreachable: { bg: '#7f1d1d', border: '#ef4444', dot: '#f87171', text: 'ServiceNow Unreachable — Check PDI connection at dev286774.service-now.com' },
  checking:    { bg: '#1e3a5f', border: '#3b82f6', dot: '#93c5fd', text: 'Connecting to ServiceNow PDI…' },
}

export default function SNStatusBanner() {
  const [mode, setMode] = useState(snConnectionState.mode)

  useEffect(() => {
    // Poll connection state every 5 seconds
    const interval = setInterval(() => {
      if (snConnectionState.mode !== mode) {
        setMode(snConnectionState.mode)
      }
    }, 5000)

    // Also set immediately on mount
    setMode(snConnectionState.mode)

    return () => clearInterval(interval)
  }, [mode])

  const cfg = CONFIG[mode] || CONFIG.checking

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 16px',
      background: cfg.bg,
      borderBottom: `2px solid ${cfg.border}`,
      fontSize: '0.78rem',
      fontWeight: 500,
      color: '#fff',
      letterSpacing: '0.01em',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: cfg.dot,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: mode === 'live' ? `0 0 6px ${cfg.dot}` : 'none',
        animation: mode === 'checking' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }}/>
      <span>{cfg.text}</span>
      {mode === 'demo' && (
        <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '0.72rem' }}>
          Login with real SN credentials to save data
        </span>
      )}
    </div>
  )
}
