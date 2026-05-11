import React, { useState, useEffect } from 'react'
import { getVolunteers, createVolunteer, getPendingVolunteers, approveVolunteer, rejectVolunteer, getAssignments, getEvents } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const SKILLS_OPTIONS = ['Teaching', 'First Aid', 'IT Support', 'Data Entry', 'Healthcare', 'Counseling', 'Environmental', 'Planting', 'Social Work', 'Community', 'Legal Aid', 'Advocacy']
const AVAIL_OPTIONS = ['weekdays', 'weekends', 'flexible', 'mornings', 'evenings']
const PAGE_SIZE = 10

export default function VolunteersPage() {
  const [tab, setTab]               = useState('active') // 'active' | 'pending'
  const [volunteers, setVolunteers] = useState([])
  const [pending, setPending]       = useState([])
  const [filtered, setFiltered]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [toast, setToast]           = useState(null)
  const [form, setForm]             = useState({ name: '', email: '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
  const [errors, setErrors]         = useState({})
  const [approvingId, setApprovingId] = useState(null)
  const [volPage, setVolPage]         = useState(1)

  // Stats modal
  const [statsModal, setStatsModal] = useState(null) // volunteer object
  const [allAssignments, setAllAssignments] = useState([])
  const [allEvents, setAllEvents]   = useState([])

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(volunteers.filter(v =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q) ||
      (v.u_skills || '').toLowerCase().includes(q)
    ))
    setVolPage(1)
  }, [search, volunteers])

  async function loadData() {
    setLoading(true)
    try {
      const [vols, pend, asgns, evts] = await Promise.all([
        getVolunteers(),
        getPendingVolunteers(),
        getAssignments(),
        getEvents(),
      ])
      setVolunteers(vols)
      setPending(pend)
      setAllAssignments(asgns)
      setAllEvents(evts)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setLoading(false)
    }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function validateForm() {
    const e = {}
    if (!form.name.trim())  e.name  = 'Name is required'
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!form.mobile_phone.trim()) e.mobile_phone = 'Phone is required'
    else if (!/^\d{10}$/.test(form.mobile_phone.trim())) e.mobile_phone = 'Must be exactly 10 digits'
    if (!form.u_skills.trim()) e.u_skills = 'At least one skill required'
    return e
  }

  async function handleSave() {
    const errs = validateForm()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      // Admin registration: directly approved
      const newVol = await createVolunteer({ ...form, active: 'true', u_approval_status: 'approved' })
      setVolunteers(prev => [{ ...newVol, ...form, sys_id: newVol.sys_id || `demo-${Date.now()}`, active: 'true' }, ...prev])
      setModalOpen(false)
      setForm({ name: '', email: '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
      setErrors({})
      showToast('success', `Volunteer "${form.name}" registered!`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(vol) {
    setApprovingId(vol.sys_id + '_approve')
    try {
      await approveVolunteer(vol.sys_id)
      setPending(prev => prev.filter(v => v.sys_id !== vol.sys_id))
      setVolunteers(prev => [{ ...vol, active: 'true', u_approval_status: 'approved' }, ...prev])
      showToast('success', `${vol.name} approved and activated!`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setApprovingId(null)
    }
  }

  async function handleReject(vol) {
    setApprovingId(vol.sys_id + '_reject')
    try {
      await rejectVolunteer(vol.sys_id)
      setPending(prev => prev.filter(v => v.sys_id !== vol.sys_id))
      showToast('success', `${vol.name}'s registration has been rejected.`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setApprovingId(null)
    }
  }

  function getVolunteerStats(vol) {
    const myAsgns = allAssignments.filter(a =>
      (a.u_volunteer || '').toLowerCase().includes((vol.name || '').toLowerCase()) ||
      a.u_volunteer === vol.sys_id
    )
    const totalHours = myAsgns.reduce((s, a) => s + (parseInt(a.u_hours_worked) || 0), 0)
    const projects = [...new Set(myAsgns.map(a => a.u_project).filter(Boolean))]
    const completed = myAsgns.filter(a => a.u_completion_status === 'completed').length
    return { totalAssignments: myAsgns.length, totalHours, projects, completed }
  }

  return (
    <div className="page-wrapper">
      {toast && <Toast toast={toast} />}

      <div className="page-header">
        <div>
          <h1 className="page-title">Volunteers</h1>
          <p className="page-sub">Manage and onboard NGO volunteers — synced with ServiceNow</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)} id="add-volunteer-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Register Volunteer
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className={tab === 'active' ? 'btn-primary' : 'btn-secondary'}
          style={{ borderRadius: '8px', padding: '8px 20px', fontWeight: 600 }}
          onClick={() => setTab('active')}
        >
          Active Volunteers <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '1px 8px', fontSize: '0.8rem' }}>{volunteers.length}</span>
        </button>
        <button
          className={tab === 'pending' ? 'btn-primary' : 'btn-secondary'}
          style={{ borderRadius: '8px', padding: '8px 20px', fontWeight: 600, position: 'relative' }}
          onClick={() => setTab('pending')}
        >
          Pending Approval
          {pending.length > 0 && (
            <span style={{ marginLeft: 6, background: '#EF4444', color: '#fff', borderRadius: 99, padding: '1px 8px', fontSize: '0.8rem' }}>{pending.length}</span>
          )}
        </button>
      </div>

      {loading ? <TableSkeleton /> : tab === 'active' ? (
        <>
          {/* Search Bar */}
          <div className="search-bar-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              id="volunteer-search"
              type="text"
              className="search-bar"
              placeholder="Search by name, email, or skills…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span className="result-count">{filtered.length} volunteer{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Contact</th>
                  <th>Skills</th>
                  <th>Availability</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="empty-cell">No volunteers found.</td></tr>
                ) : filtered.slice((volPage - 1) * PAGE_SIZE, volPage * PAGE_SIZE).map(v => (
                  <tr key={v.sys_id} className="table-row">
                    <td>
                      <div className="vol-cell">
                        <div className="vol-avatar">{(v.name || 'V')[0]}</div>
                        <div>
                          <div className="vol-name">{v.name}</div>
                          <div className="vol-id">#{v.sys_id?.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="vol-email">{v.email}</div>
                      <div className="vol-phone">{v.mobile_phone}</div>
                    </td>
                    <td>
                      <div className="skills-wrap">
                        {(v.u_skills || '').split(',').map(s => s.trim()).filter(Boolean).map(s => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td><span className="badge badge-blue">{v.u_availability || 'flexible'}</span></td>
                    <td><span className="badge badge-teal">Active</span></td>
                    <td>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '0.78rem', borderRadius: '6px' }}
                        onClick={() => setStatsModal(v)}
                      >
                        View Stats
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={volPage} pageSize={PAGE_SIZE} onChange={setVolPage} />
        </>
      ) : (
        /* Pending Approvals Tab */
        <div className="table-card">
          {pending.length === 0 ? (
            <div className="empty-cell" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-light)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✓</div>
              No pending applications — all caught up!
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Contact</th>
                  <th>Skills</th>
                  <th>Availability</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(v => (
                  <tr key={v.sys_id} className="table-row">
                    <td>
                      <div className="vol-cell">
                        <div className="vol-avatar" style={{ background: '#F59E0B' }}>{(v.name || 'V')[0]}</div>
                        <div>
                          <div className="vol-name">{v.name}</div>
                          <div className="vol-id">Awaiting approval</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="vol-email">{v.email}</div>
                      <div className="vol-phone">{v.mobile_phone}</div>
                    </td>
                    <td>
                      <div className="skills-wrap">
                        {(v.u_skills || '').split(',').map(s => s.trim()).filter(Boolean).map(s => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td><span className="badge badge-blue">{v.u_availability || 'flexible'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-primary"
                          style={{ padding: '4px 14px', fontSize: '0.78rem', borderRadius: '6px', background: '#10B981' }}
                          disabled={approvingId === v.sys_id + '_approve'}
                          onClick={() => handleApprove(v)}
                        >
                          {approvingId === v.sys_id + '_approve' ? '…' : '✓ Approve'}
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ padding: '4px 14px', fontSize: '0.78rem', borderRadius: '6px', color: '#EF4444', borderColor: '#EF4444' }}
                          disabled={approvingId === v.sys_id + '_reject'}
                          onClick={() => handleReject(v)}
                        >
                          {approvingId === v.sys_id + '_reject' ? '…' : '✕ Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Register Volunteer Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }} title="Register New Volunteer" size="md">
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label">Full Name <span className="req">*</span></label>
            <input type="text" className={`form-input${errors.name ? ' input-error' : ''}`} placeholder="e.g. Priya Sharma" value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })) }} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Email <span className="req">*</span></label>
            <input type="email" className={`form-input${errors.email ? ' input-error' : ''}`} placeholder="priya@example.com" value={form.email}
              onChange={e => { const v = e.target.value; setForm(p => ({ ...p, email: v })); setErrors(p => ({ ...p, email: /\s/.test(v) ? 'Spaces not allowed.' : '' })) }}
              onBlur={() => { if (form.email && !/\S+@\S+\.\S+/.test(form.email)) setErrors(p => ({ ...p, email: 'Invalid email format.' })) }} />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Phone Number <span className="req">*</span></label>
            <input type="text" className={`form-input${errors.mobile_phone ? ' input-error' : ''}`} placeholder="9876543210" value={form.mobile_phone}
              onChange={e => { const raw = e.target.value; setErrors(p => ({ ...p, mobile_phone: /[^\d]/.test(raw) ? 'Numbers only.' : '' })); setForm(p => ({ ...p, mobile_phone: raw.replace(/\D/g, '').slice(0, 10) })) }}
              onBlur={() => { if (form.mobile_phone && form.mobile_phone.length < 10) setErrors(p => ({ ...p, mobile_phone: 'Must be exactly 10 digits.' })) }} />
            {errors.mobile_phone && <span className="field-error">{errors.mobile_phone}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Address</label>
            <input type="text" className="form-input" placeholder="City, State" value={form.u_address}
              onChange={e => setForm(p => ({ ...p, u_address: e.target.value }))} />
          </div>

          <div className="form-field">
            <label className="form-label">Skills <span className="req">*</span></label>
            <input className={`form-input${errors.u_skills ? ' input-error' : ''}`} placeholder="e.g. Teaching, First Aid" value={form.u_skills}
              onChange={e => { setForm(p => ({ ...p, u_skills: e.target.value })); setErrors(p => ({ ...p, u_skills: '' })) }} />
            <div className="skill-hints">
              {SKILLS_OPTIONS.map(s => (
                <button key={s} type="button" className="skill-hint-btn"
                  onClick={() => setForm(p => ({ ...p, u_skills: p.u_skills ? `${p.u_skills}, ${s}` : s }))}>
                  + {s}
                </button>
              ))}
            </div>
            {errors.u_skills && <span className="field-error">{errors.u_skills}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Availability</label>
            <select className="form-input" value={form.u_availability} onChange={e => setForm(p => ({ ...p, u_availability: e.target.value }))}>
              {AVAIL_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); setErrors({}) }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="btn-spinner"/> Saving…</> : '✓ Register Volunteer'}
          </button>
        </div>
      </Modal>

      {/* Volunteer Stats Modal */}
      {statsModal && (() => {
        const stats = getVolunteerStats(statsModal)
        return (
          <Modal isOpen={true} onClose={() => setStatsModal(null)} title={`Performance — ${statsModal.name}`} size="md">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Total Assignments', value: stats.totalAssignments, color: '#3B82F6' },
                { label: 'Hours Contributed', value: stats.totalHours, color: '#8B5CF6' },
                { label: 'Projects Worked', value: stats.projects.length, color: '#10B981' },
                { label: 'Completed Tasks', value: stats.completed, color: '#F59E0B' },
              ].map(m => (
                <div key={m.label} style={{ background: '#F9FAFB', borderRadius: '10px', padding: '16px', borderLeft: `4px solid ${m.color}` }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '2px' }}>{m.label}</div>
                </div>
              ))}
            </div>
            {stats.projects.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#374151' }}>Projects</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {stats.projects.map(p => <span key={p} className="skill-tag">{p}</span>)}
                </div>
              </div>
            )}
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Volunteer Info</div>
              <div style={{ fontSize: '0.85rem', color: '#6B7280', lineHeight: 1.8 }}>
                <div><strong>Email:</strong> {statsModal.email}</div>
                <div><strong>Phone:</strong> {statsModal.mobile_phone}</div>
                <div><strong>Skills:</strong> {statsModal.u_skills}</div>
                <div><strong>Availability:</strong> {statsModal.u_availability}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setStatsModal(null)}>Close</button>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

function Toast({ toast }) {
  return (
    <div className={`page-toast ${toast.type}`}>
      {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="table-card">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skeleton-row"/>
      ))}
    </div>
  )
}

function Pagination({ total, page, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const pages = []
  for (let i = 1; i <= totalPages; i++) pages.push(i)
  return (
    <div className="pagination">
      <span className="pg-info">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <button className="pg-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>‹</button>
      {pages.map(p => (
        <button key={p} className={`pg-btn${p === page ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="pg-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}
