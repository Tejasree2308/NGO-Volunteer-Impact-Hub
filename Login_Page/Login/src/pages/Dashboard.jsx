import React, { useState, useEffect } from 'react'
import { getDashboardStats, getProjects, getAssignments, testSnConnection } from '../api/servicenow'
import Modal from '../components/Modal'
import './Dashboard.css'

const STAT_CONFIG = [
  { key: 'totalVolunteers',   label: 'Total Volunteers',      color: 'teal',   icon: <IconUsers /> },
  { key: 'activeProjects',    label: 'Active Projects',       color: 'blue',   icon: <IconBriefcase /> },
  { key: 'totalHours',        label: 'Volunteer Hours',       color: 'purple', icon: <IconClock /> },
  { key: 'beneficiariesReached', label: 'Beneficiaries Reached', color: 'gold', icon: <IconHeart /> },
]

export default function Dashboard() {
  const [stats, setStats]       = useState(null)
  const [projects, setProjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [testModal, setTestModal] = useState(false)
  const [testResults, setTestResults] = useState(null)
  const [testRunning, setTestRunning] = useState(false)

  async function handleTestConnection() {
    setTestModal(true)
    setTestRunning(true)
    setTestResults(null)
    try {
      const results = await testSnConnection()
      setTestResults(results)
    } catch (err) {
      setTestResults({ Error: err.message })
    } finally {
      setTestRunning(false)
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [s, p, a] = await Promise.all([
          getDashboardStats(),
          getProjects(),
          getAssignments(),
        ])
        setStats(s)
        setProjects(p)
        setAssignments(a.slice(0, 5))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <LoadingState />

  const totalProjects = projects.length || stats?.totalProjects || 0
  const completedProjects = projects.filter(p => p.u_status === 'completed').length
  const completionPct = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Real-time overview of your NGO volunteer operations</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={handleTestConnection}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px' }}>
            🔍 Test SN Connection
          </button>
          <div className="sn-status-chip">
            <span className="status-dot pulse"/>
            <span>ServiceNow PDI</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        {STAT_CONFIG.map(cfg => (
          <StatCard
            key={cfg.key}
            label={cfg.label}
            value={stats?.[cfg.key] ?? '–'}
            color={cfg.color}
            icon={cfg.icon}
          />
        ))}
        <div className="stat-card stat-green" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-icon"><IconTarget /></div>
          <div className="stat-body">
            <span className="stat-val">{completionPct}%</span>
            <span className="stat-label">Project Completion</span>
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, height: '4px',
            width: `${completionPct}%`, background: 'rgba(255,255,255,0.5)',
            borderRadius: '0 2px 2px 0', transition: 'width 0.6s ease',
          }} />
          <div className="stat-glow"/>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="dash-cols">
        {/* Recent Projects */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h2>Recent Projects</h2>
            <span className="badge badge-teal">{Math.min(projects.length, 5)} of {projects.length}</span>
          </div>
          <div className="project-list">
            {projects.slice(0, 5).map(p => (
              <div key={p.sys_id} className="proj-row">
                <div className="proj-dot" data-status={p.u_status || 'planning'}/>
                <div className="proj-info">
                  <span className="proj-name">{p.u_project_name}</span>
                  <span className="proj-loc">📍 {p.u_location}</span>
                </div>
                <StatusBadge status={p.u_status} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Assignments */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h2>Recent Assignments</h2>
            <span className="badge badge-blue">{assignments.length} shown</span>
          </div>
          <div className="assignment-list">
            {assignments.map(a => (
              <div key={a.sys_id} className="asgn-row">
                <div className="asgn-avatar">{(a.u_volunteer || 'V')[0]}</div>
                <div className="asgn-info">
                  <span className="asgn-vol">{a.u_volunteer}</span>
                  <span className="asgn-proj">{a.u_project}</span>
                </div>
                <div className="asgn-hours">
                  <span className="hours-num">{a.u_hours_worked}h</span>
                  <StatusBadge status={a.u_completion_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SN Connection Test Modal */}
      <Modal isOpen={testModal} onClose={() => setTestModal(false)} title="ServiceNow Connection Test" size="md">
        {testRunning ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-light)' }}>
            <div style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Testing connections…</div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
              {[0,1,2].map(i => <span key={i} className="btn-spinner" style={{ animationDelay: `${i*0.15}s` }}/>)}
            </div>
          </div>
        ) : testResults ? (
          <div>
            <p style={{ marginBottom: '16px', color: 'var(--text-light)', fontSize: '0.85rem' }}>
              Results from <strong>dev286774.service-now.com</strong>. Green = table exists and is accessible. Red = table missing or permission denied.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(testResults).map(([label, status]) => {
                const ok = status === 'connected'
                return (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: '8px',
                    background: ok ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    <span style={{ fontWeight: 500, color: ok ? '#166534' : '#991b1b', fontSize: '0.88rem' }}>{label}</span>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 600,
                      color: ok ? '#16a34a' : '#dc2626',
                      background: ok ? '#dcfce7' : '#fee2e2',
                      padding: '2px 10px', borderRadius: '20px',
                    }}>
                      {ok ? '✓ Connected' : status === 'unreachable' ? '✗ Unreachable' : '✗ Not Found'}
                    </span>
                  </div>
                )
              })}
            </div>
            {Object.values(testResults).some(s => s !== 'connected') && (
              <p style={{ marginTop: '16px', fontSize: '0.8rem', color: '#92400e', background: '#fffbeb', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                ⚠ Tables showing errors need to be created in App Engine Studio with the exact field names listed in the project documentation.
              </p>
            )}
            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button className="btn-primary" onClick={() => setTestModal(false)}>Close</button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Impact Meter */}
      <div className="impact-banner">
        <div className="impact-text">
          <h2>🌍 Community Impact</h2>
          <p>Your volunteers are making a difference — {stats?.beneficiariesReached?.toLocaleString()} lives touched this year</p>
        </div>
        <div className="impact-metrics">
          <div className="imp-met">
            <span className="imp-val">{stats?.totalHours?.toLocaleString()}</span>
            <span className="imp-key">Hours Contributed</span>
          </div>
          <div className="imp-sep"/>
          <div className="imp-met">
            <span className="imp-val">{stats?.totalAssignments}</span>
            <span className="imp-key">Total Assignments</span>
          </div>
          <div className="imp-sep"/>
          <div className="imp-met">
            <span className="imp-val">{stats?.totalProjects}</span>
            <span className="imp-key">All Projects</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */
function StatCard({ label, value, color, icon }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <span className="stat-val">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-glow"/>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    active:      { label: 'Active',      cls: 'badge-teal' },
    in_progress: { label: 'In Progress', cls: 'badge-blue' },
    planning:    { label: 'Planning',    cls: 'badge-purple' },
    completed:   { label: 'Completed',   cls: 'badge-green' },
    pending:     { label: 'Pending',     cls: 'badge-gray' },
  }
  const cfg = map[status] || { label: status || 'Unknown', cls: 'badge-gray' }
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
}

function LoadingState() {
  return (
    <div className="page-wrapper">
      <div className="loading-grid">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card"/>)}
      </div>
      <div className="loading-text">Loading from ServiceNow PDI…</div>
    </div>
  )
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */
function IconUsers() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconBriefcase() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
}
function IconClock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function IconHeart() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
}
function IconTarget() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
}
