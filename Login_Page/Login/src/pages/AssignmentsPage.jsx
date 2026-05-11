import React, { useState, useEffect } from 'react'
import { getAssignments, createAssignment, updateAssignment, deleteAssignment, getVolunteers, getProjects } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const PAGE_SIZE = 10
const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled']
const STATUS_LABELS  = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS  = { pending: 'badge-gray', in_progress: 'badge-blue', completed: 'badge-green', cancelled: 'badge-gold' }

const EMPTY_FORM = {
  u_volunteer: '', u_project: '',
  u_assigned_date: new Date().toISOString().split('T')[0],
  u_hours_worked: '0', u_completion_status: 'pending'
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [volunteers, setVolunteers]   = useState([])
  const [projects, setProjects]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingAssignment, setEditingAssignment] = useState(null)
  const [saving, setSaving]           = useState(false)
  const [deletingId, setDeletingId]   = useState(null)
  const [toast, setToast]             = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [errors, setErrors]           = useState({})
  const [asnPage, setAsnPage]         = useState(1)

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

  function openCreate() {
    setEditingAssignment(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(a) {
    setEditingAssignment(a)
    setForm({
      u_volunteer:        a.u_volunteer,
      u_project:          a.u_project,
      u_assigned_date:    a.u_assigned_date || new Date().toISOString().split('T')[0],
      u_hours_worked:     a.u_hours_worked || '0',
      u_completion_status: a.u_completion_status || 'pending',
    })
    setErrors({})
    setModalOpen(true)
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
      if (editingAssignment) {
        const result = await updateAssignment(editingAssignment.sys_id, form)
        setAssignments(prev => prev.map(a =>
          a.sys_id === editingAssignment.sys_id ? { ...result, ...form, sys_id: editingAssignment.sys_id } : a
        ))
        showToast('success', `Assignment updated: ${volMap[form.u_volunteer] || form.u_volunteer}`)
      } else {
        const result = await createAssignment(form)
        setAssignments(prev => [{ ...result, ...form }, ...prev])
        showToast('success', `Assignment created: ${volMap[form.u_volunteer] || form.u_volunteer} → ${projMap[form.u_project] || form.u_project}`)
      }
      setModalOpen(false)
      setForm(EMPTY_FORM)
      setErrors({})
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(a) {
    if (!confirm(`Remove assignment for "${volMap[a.u_volunteer] || 'this volunteer'}"? This cannot be undone.`)) return
    setDeletingId(a.sys_id)
    try {
      await deleteAssignment(a.sys_id)
      setAssignments(prev => prev.filter(x => x.sys_id !== a.sys_id))
      showToast('success', 'Assignment deleted.')
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setDeletingId(null)
    }
  }

  // Skill-match suggestion
  function getMatchingVolunteers(projectSysId) {
    const proj = projects.find(p => p.sys_id === projectSysId)
    if (!proj || !proj.u_required_skills) return volunteers
    const required = proj.u_required_skills.toLowerCase().split(',').map(s => s.trim())
    return volunteers.filter(v => {
      const vSkills = (v.u_skills || '').toLowerCase()
      return required.some(r => vSkills.includes(r))
    })
  }

  const volMap  = Object.fromEntries(volunteers.map(v => [v.sys_id, v.name]))
  const projMap = Object.fromEntries(projects.map(p => [p.sys_id, p.u_project_name]))
  const suggested = form.u_project ? getMatchingVolunteers(form.u_project) : volunteers

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Assignments</h1>
          <p className="page-sub">Assign volunteers to NGO projects with skill-based matching</p>
        </div>
        <button className="btn-primary" onClick={openCreate} id="add-assignment-btn">
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={6} className="empty-cell">No assignments found.</td></tr>
              ) : assignments.slice((asnPage - 1) * PAGE_SIZE, asnPage * PAGE_SIZE).map(a => (
                <tr key={a.sys_id} className="table-row">
                  <td>
                    <div className="vol-cell">
                      <div className="vol-avatar">{(volMap[a.u_volunteer] || a.u_volunteer || 'V')[0]}</div>
                      <span className="vol-name">{volMap[a.u_volunteer] || a.u_volunteer || '—'}</span>
                    </div>
                  </td>
                  <td><span className="proj-ref">{projMap[a.u_project] || a.u_project || '—'}</span></td>
                  <td><span className="date-cell">{a.u_assigned_date || '—'}</span></td>
                  <td>
                    <div className="hours-bar-wrap">
                      <div className="hours-bar"><div className="hours-fill" style={{width: `${Math.min(100, (parseInt(a.u_hours_worked) || 0) / 60 * 100)}%`}}/></div>
                      <span className="hours-label">{a.u_hours_worked || 0}h</span>
                    </div>
                  </td>
                  <td><span className={`badge ${STATUS_COLORS[a.u_completion_status] || 'badge-gray'}`}>{STATUS_LABELS[a.u_completion_status] || a.u_completion_status || 'Pending'}</span></td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" title="Edit" onClick={() => openEdit(a)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="btn-icon danger" title="Delete"
                        disabled={deletingId === a.sys_id}
                        onClick={() => handleDelete(a)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination total={assignments.length} page={asnPage} pageSize={PAGE_SIZE} onChange={setAsnPage} />

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }}
        title={editingAssignment ? 'Edit Assignment' : 'Create Assignment'} size="md">
        <div className="form-grid">
          <div className="form-field">
            <label className="form-label">Project <span className="req">*</span></label>
            <select className={`form-input${errors.u_project ? ' input-error' : ''}`}
              value={form.u_project}
              onChange={e => { setForm(p => ({ ...p, u_project: e.target.value, u_volunteer: '' })); setErrors(p => ({ ...p, u_project: '' })) }}>
              <option value="">— Select Project —</option>
              {projects.map(p => <option key={p.sys_id} value={p.sys_id}>{p.u_project_name}</option>)}
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
              {suggested.map(v => <option key={v.sys_id} value={v.sys_id}>{v.name} ({v.u_skills || 'No skills listed'})</option>)}
              {suggested.length < volunteers.length && (
                <optgroup label="─ Other Volunteers ─">
                  {volunteers.filter(v => !suggested.find(s => s.sys_id === v.sys_id)).map(v => (
                    <option key={v.sys_id} value={v.sys_id}>{v.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {errors.u_volunteer && <span className="field-error">{errors.u_volunteer}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">Assigned Date</label>
            <input type="date" className="form-input" value={form.u_assigned_date}
              onChange={e => setForm(p => ({ ...p, u_assigned_date: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Hours Worked</label>
            <input type="number" min="0" className="form-input" value={form.u_hours_worked}
              onChange={e => setForm(p => ({ ...p, u_hours_worked: e.target.value }))}/>
          </div>
          <div className="form-field span-2">
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
            {saving ? <><span className="btn-spinner"/> {editingAssignment ? 'Updating…' : 'Saving…'}</> : editingAssignment ? '✓ Update Assignment' : '✓ Create Assignment'}
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
