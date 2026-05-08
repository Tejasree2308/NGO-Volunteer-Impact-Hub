import React, { useState, useEffect } from 'react'
import { getVolunteers, createVolunteer } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const SKILLS_OPTIONS = ['Teaching', 'First Aid', 'IT Support', 'Data Entry', 'Healthcare', 'Counseling', 'Environmental', 'Planting', 'Social Work', 'Community', 'Legal Aid', 'Advocacy']
const AVAIL_OPTIONS = ['weekdays', 'weekends', 'flexible', 'mornings', 'evenings']

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState([])
  const [filtered, setFiltered]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [toast, setToast]           = useState(null)
  const [form, setForm]             = useState({ name: '', email: '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
  const [errors, setErrors]         = useState({})

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(volunteers.filter(v =>
      (v.name || '').toLowerCase().includes(q) ||
      (v.email || '').toLowerCase().includes(q) ||
      (v.u_skills || '').toLowerCase().includes(q)
    ))
  }, [search, volunteers])

  async function loadData() {
    setLoading(true)
    try { setVolunteers(await getVolunteers()) }
    catch (e) { showToast('error', e.message) }
    finally { setLoading(false) }
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
    if (!form.u_skills.trim()) e.u_skills = 'At least one skill required'
    return e
  }

  async function handleSave() {
    const errs = validateForm()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const newVol = await createVolunteer(form)
      setVolunteers(prev => [{ ...newVol, ...form, sys_id: newVol.sys_id || `demo-${Date.now()}` }, ...prev])
      setModalOpen(false)
      setForm({ name: '', email: '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
      setErrors({})
      showToast('success', `Volunteer "${form.name}" registered in ServiceNow!`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
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

      {/* Table */}
      {loading ? <TableSkeleton /> : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Contact</th>
                <th>Skills</th>
                <th>Availability</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="empty-cell">No volunteers found.</td></tr>
              ) : filtered.map(v => (
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
                  <td><span className={`badge ${v.active === 'true' || v.active === true ? 'badge-teal' : 'badge-gray'}`}>{v.active === 'true' || v.active === true ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }} title="Register New Volunteer" size="md">
        <div className="form-grid">
          
          <div className="form-field">
            <label className="form-label">Full Name <span className="req">*</span></label>
            <input
              type="text"
              className={`form-input${errors.name ? ' input-error' : ''}`}
              placeholder="e.g. Priya Sharma"
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })) }}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Email <span className="req">*</span></label>
            <input
              type="email"
              className={`form-input${errors.email ? ' input-error' : ''}`}
              placeholder="priya@example.com"
              value={form.email}
              onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(p => ({ ...p, email: '' })) }}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Phone Number <span className="req">*</span></label>
            <input
              type="text"
              className={`form-input${errors.mobile_phone ? ' input-error' : ''}`}
              placeholder="9876543210"
              value={form.mobile_phone}
              onChange={e => { setForm(p => ({ ...p, mobile_phone: e.target.value })); setErrors(p => ({ ...p, mobile_phone: '' })) }}
            />
            {errors.mobile_phone && <span className="field-error">{errors.mobile_phone}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Address</label>
            <input
              type="text"
              className="form-input"
              placeholder="City, State"
              value={form.u_address}
              onChange={e => setForm(p => ({ ...p, u_address: e.target.value }))}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Skills <span className="req">*</span></label>
            <input
              className={`form-input${errors.u_skills ? ' input-error' : ''}`}
              placeholder="e.g. Teaching, First Aid, IT Support"
              value={form.u_skills}
              onChange={e => { setForm(p => ({ ...p, u_skills: e.target.value })); setErrors(p => ({ ...p, u_skills: '' })) }}
            />
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
            {saving ? <><span className="btn-spinner"/> Saving to ServiceNow…</> : '✓ Register Volunteer'}
          </button>
        </div>
      </Modal>
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
