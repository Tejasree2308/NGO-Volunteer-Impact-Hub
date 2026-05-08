import React from 'react'
import './sidebar.css'

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',    icon: <IconGrid /> },
  { id: 'volunteers',  label: 'Volunteers',   icon: <IconUsers /> },
  { id: 'projects',    label: 'Projects',     icon: <IconBriefcase /> },
  { id: 'assignments', label: 'Assignments',  icon: <IconLink /> },
  { id: 'reports',     label: 'Impact Reports', icon: <IconChart /> },
]

export default function Sidebar({ activePage, onNavigate, onLogout, user }) {
  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-icon">
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" fill="url(#bg)"/>
            <path d="M12 28 C12 20 20 14 20 14 C20 14 28 20 28 28" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="20" cy="12" r="3" fill="white"/>
            <path d="M16 28 L20 20 L24 28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <defs>
              <linearGradient id="bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10B981"/>
                <stop offset="1" stopColor="#059669"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="brand-text">
          <span className="brand-name">NGO Impact Hub</span>
          <span className="brand-sub">ServiceNow Powered</span>
        </div>
      </div>

      {/* User card */}
      {user && (
        <div className="sidebar-user">
          <div className="user-avatar">{(user.name || 'A')[0].toUpperCase()}</div>
          <div className="user-info">
            <span className="user-name">{user.name || 'Admin'}</span>
            <span className="user-role">Coordinator</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item${activePage === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {activePage === item.id && <span className="nav-indicator" aria-hidden="true"/>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sn-badge">
          <svg viewBox="0 0 20 20" fill="currentColor" className="sn-icon">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M7 10 C7 8.3 8.3 7 10 7 L10 10 L13 10 C13 11.7 11.7 13 10 13 C8.3 13 7 11.7 7 10Z" fill="currentColor"/>
          </svg>
          <span>Connected to ServiceNow PDI</span>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <IconLogout /> Sign Out
        </button>
      </div>
    </aside>
  )
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */
function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IconBriefcase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )
}
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  )
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  )
}
function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16,17 21,12 16,7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
