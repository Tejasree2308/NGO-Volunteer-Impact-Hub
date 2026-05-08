import React, { useState, useEffect } from 'react'
import { getAssignments, createAssignment, getVolunteers, getProjects } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled']
const STATUS_LABELS  = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS  = { pending: 'badge-gray', in_progress: 'badge-blue', completed: 'badge-green', cancelled: 'badge-gold' }

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [volunteers, setVolunteers]   = useState([])
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)
  const [form, setForm] = useState({ u_volunteer: '', u_project: '', u_assigned_date: new Date().toISOString().split('T')[0], u_hours_worked: '0', u_completion_status: 'pending' })
  const [errors, setErrors] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [a, v, p] = await Promise.all([getAssignments(), getVolunteers(), getProjects()])
      setAssignments(a)
      setVolunteers(v)
      setProjects(p)
    } catch (e) { showToast('error', e.message) }
    finally { setLoading(false) }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function validate() {
    const e = {}
    if (!form.u_volunteer) e.u_volunteer = 'Select a volunteer'
    if (!form.u_project)   e.u_project   = 'Select a project'
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const result = await createAssignment(form)
      setAssignments(prev => [{ ...result, ...form }, ...prev])
      setModalOpen(false)
      setForm({ u_volunteer: '', u_project: '', u_assigned_date: new Date().toISOString().split('T')[0], u_hours_worked: '0', u_completion_status: 'pending' })
      setErrors({})
      showToast('success', `Assignment created: ${form.u_volunteer} → ${form.u_project}`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  // Skill-match suggestion
  function getMatchingVolunteers(projectSysId) {
    const proj = projects.find(p => p.sys_id === projectSysId || p.u_project_name === projectSysId)
    if (!proj || !proj.u_required_skills) return volunteers
    const required = proj.u_required_skills.toLowerCase().split(',').map(s => s.trim())
    return volunteers.filter(v => {
      const vSkills = (v.u_skills || '').toLowerCase()
      return required.some(r => vSkills.includes(r))
    })
  }

  const suggested = form.u_project ? getMatchingVolunteers(form.u_project) : volunteers

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-sub">Assign volunteers to NGO projects with skill-based matching</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)} id="add-assignment-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Assignment
        </button>
      </div>

      {loading ? <TableSkeleton /> : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Project</th>
                <th>Assigned Date</th>
                <th>Hours Worked</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={5} className="empty-cell">No assignments found.</td></tr>
              ) : assignments.map(a => (
                <tr key={a.sys_id} className="table-row">
                  <td>
                    <div className="vol-cell">
                      <div className="vol-avatar">{(a.u_volunteer || 'V')[0]}</div>
                      <span className="vol-name">{a.u_volunteer || a.u_volunteer?.display_value || '—'}</span>
                    </div>
                  </td>
                  <td><span className="proj-ref">{a.u_project || a.u_project?.display_value || '—'}</span></td>
                  <td><span className="date-cell">{a.u_assigned_date}</span></td>
                  <td>
                    <div className="hours-bar-wrap">
                      <div className="hours-bar"><div className="hours-fill" style={{width: `${Math.min(100, (parseInt(a.u_hours_worked) || 0) / 60 * 100)}%`}}/></div>
                      <span className="hours-label">{a.u_hours_worked}h</span>
                    </div>
                  </td>
                  <td><span className={`badge ${STATUS_COLORS[a.u_completion_status] || 'badge-gray'}`}>{STATUS_LABELS[a.u_completion_status] || a.u_completion_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }} title="Create Assignment" size="md">
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label">Project <span className="req">*</span></label>
            <select className={`form-input${errors.u_project ? ' input-error' : ''}`}
              value={form.u_project}
              onChange={e => { setForm(p => ({ ...p, u_project: e.target.value, u_volunteer: '' })); setErrors(p => ({ ...p, u_project: '' })) }}>
              <option value="">— Select Project —</option>
              {projects.map(p => <option key={p.sys_id} value={p.u_project_name || p.sys_id}>{p.u_project_name}</option>)}
            </select>
            {errors.u_project && <span className="field-error">{errors.u_project}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">Volunteer <span className="req">*</span>
              {form.u_project && <span className="match-hint"> ✨ {suggested.length} skill match{suggested.length !== 1 ? 'es' : ''}</span>}
            </label>
            <select className={`form-input${errors.u_volunteer ? ' input-error' : ''}`}
              value={form.u_volunteer}
              onChange={e => { setForm(p => ({ ...p, u_volunteer: e.target.value })); setErrors(p => ({ ...p, u_volunteer: '' })) }}>
              <option value="">— Select Volunteer —</option>
              {suggested.map(v => <option key={v.sys_id} value={v.name}>{v.name} ({v.u_skills})</option>)}
              {suggested.length < volunteers.length && <optgroup label="─ Other Volunteers ─">
                {volunteers.filter(v => !suggested.includes(v)).map(v => <option key={v.sys_id} value={v.name}>{v.name}</option>)}
              </optgroup>}
            </select>
            {errors.u_volunteer && <span className="field-error">{errors.u_volunteer}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">Assigned Date</label>
            <input type="date" className="form-input" value={form.u_assigned_date}
              onChange={e => setForm(p => ({ ...p, u_assigned_date: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Initial Hours</label>
            <input type="number" min="0" className="form-input" value={form.u_hours_worked}
              onChange={e => setForm(p => ({ ...p, u_hours_worked: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Status</label>
            <select className="form-input" value={form.u_completion_status}
              onChange={e => setForm(p => ({ ...p, u_completion_status: e.target.value }))}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{STATUS_LABELS[o]}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); setErrors({}) }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="btn-spinner"/> Saving…</> : '✓ Create Assignment'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="table-card">
      {[...Array(5)].map((_, i) => <div key={i} className="skeleton-row"/>)}
    </div>
  )
}
