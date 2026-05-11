import React, { useState, useEffect } from 'react'
import { getProjects, createProject, updateProject, deleteProject } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const STATUS_OPTIONS = ['planning', 'active', 'in_progress', 'completed', 'on_hold']
const STATUS_LABELS  = { active: 'Active', in_progress: 'In Progress', planning: 'Planning', completed: 'Completed', on_hold: 'On Hold' }
const STATUS_COLORS  = { active: 'badge-teal', in_progress: 'badge-blue', planning: 'badge-purple', completed: 'badge-green', on_hold: 'badge-gray' }
const SKILL_OPTIONS  = ['Teaching', 'First Aid', 'IT Support', 'Healthcare', 'Environmental', 'Counseling', 'Social Work', 'Legal Aid', 'Advocacy', 'Community']

const EMPTY_FORM = {
  u_project_name: '', u_description: '', u_location: '',
  u_start_date: '', u_end_date: '', u_required_skills: '',
  u_status: 'planning', u_volunteers_needed: ''
}

export default function ProjectsPage() {
  const [projects, setProjects]     = useState([])
  const [filtered, setFiltered]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('all')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [toast, setToast]           = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [errors, setErrors]         = useState({})

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(projects.filter(p => {
      const matchSearch = (p.u_project_name || '').toLowerCase().includes(q) ||
        (p.u_location || '').toLowerCase().includes(q) ||
        (p.u_description || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || p.u_status === statusFilter
      return matchSearch && matchStatus
    }))
  }, [search, statusFilter, projects])

  async function loadData() {
    setLoading(true)
    try { setProjects(await getProjects()) }
    catch (e) { showToast('error', e.message) }
    finally { setLoading(false) }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function openCreate() {
    setEditingProject(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(p) {
    setEditingProject(p)
    setForm({
      u_project_name:      p.u_project_name,
      u_description:       p.u_description,
      u_location:          p.u_location,
      u_start_date:        p.u_start_date,
      u_end_date:          p.u_end_date,
      u_required_skills:   p.u_required_skills,
      u_status:            p.u_status,
      u_volunteers_needed: p.u_volunteers_needed,
    })
    setErrors({})
    setModalOpen(true)
  }

  function validate() {
    const e = {}
    if (!form.u_project_name.trim()) e.u_project_name = 'Project name required'
    if (!form.u_location.trim())     e.u_location     = 'Location required'
    if (!form.u_start_date)          e.u_start_date   = 'Start date required'
    if (form.u_end_date && form.u_start_date && form.u_end_date < form.u_start_date)
      e.u_end_date = 'End date must be after start date'
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (editingProject) {
        const result = await updateProject(editingProject.sys_id, form)
        setProjects(prev => prev.map(p => p.sys_id === editingProject.sys_id ? { ...result, ...form, sys_id: editingProject.sys_id } : p))
        showToast('success', `Project "${form.u_project_name}" updated!`)
      } else {
        const result = await createProject(form)
        setProjects(prev => [{ ...result, ...form }, ...prev])
        showToast('success', `Project "${form.u_project_name}" created in ServiceNow!`)
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

  async function handleDelete(p) {
    if (!confirm(`Delete project "${p.u_project_name}"? This cannot be undone.`)) return
    setDeletingId(p.sys_id)
    try {
      await deleteProject(p.sys_id)
      setProjects(prev => prev.filter(x => x.sys_id !== p.sys_id))
      showToast('success', `Project "${p.u_project_name}" deleted.`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">NGO Projects</h1>
          <p className="page-sub">Manage social service projects and track volunteer requirements</p>
        </div>
        <button className="btn-primary" onClick={openCreate} id="add-project-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Project
        </button>
      </div>

      {/* Search + Filter */}
      <div className="filter-bar">
        <div className="search-bar-wrap" style={{flex:1}}>
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="project-search" type="text" className="search-bar" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="status-filters">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button key={s} className={`filter-btn${statusFilter === s ? ' active' : ''}`}
              onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="projects-grid">{[...Array(4)].map((_, i) => <div key={i} className="skeleton-card tall"/>)}</div>
      ) : (
        <div className="projects-grid">
          {filtered.length === 0 ? (
            <div className="empty-state">No projects match your search.</div>
          ) : filtered.map(p => (
            <div key={p.sys_id} className="project-card">
              <div className="proj-card-header">
                <span className={`badge ${STATUS_COLORS[p.u_status] || 'badge-gray'}`}>
                  {STATUS_LABELS[p.u_status] || p.u_status}
                </span>
                <span className="proj-date">{p.u_start_date} → {p.u_end_date || 'TBD'}</span>
              </div>
              <h3 className="proj-card-name">{p.u_project_name}</h3>
              <p className="proj-card-desc">{p.u_description}</p>
              <div className="proj-card-meta">
                <div className="meta-item">📍 {p.u_location}</div>
                {p.u_volunteers_needed && <div className="meta-item">👥 {p.u_volunteers_needed} volunteers needed</div>}
              </div>
              {p.u_required_skills && (
                <div className="skills-wrap" style={{marginTop: 12}}>
                  {p.u_required_skills.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                    <span key={s} className="skill-tag">{s}</span>
                  ))}
                </div>
              )}
              <div className="action-buttons" style={{marginTop: 14}}>
                <button className="btn-icon" title="Edit" onClick={() => openEdit(p)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button className="btn-icon danger" title="Delete"
                  disabled={deletingId === p.sys_id}
                  onClick={() => handleDelete(p)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }}
        title={editingProject ? 'Edit Project' : 'Create New Project'} size="lg">
        <div className="form-grid-2">
          <div className="form-field span-2">
            <label className="form-label">Project Name <span className="req">*</span></label>
            <input className={`form-input${errors.u_project_name ? ' input-error' : ''}`}
              placeholder="e.g. Digital Literacy Drive" value={form.u_project_name}
              onChange={e => { setForm(p => ({ ...p, u_project_name: e.target.value })); setErrors(p => ({ ...p, u_project_name: '' })) }}/>
            {errors.u_project_name && <span className="field-error">{errors.u_project_name}</span>}
          </div>
          <div className="form-field span-2">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Brief project description…"
              value={form.u_description} onChange={e => setForm(p => ({ ...p, u_description: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Location <span className="req">*</span></label>
            <input className={`form-input${errors.u_location ? ' input-error' : ''}`}
              placeholder="City, State" value={form.u_location}
              onChange={e => { setForm(p => ({ ...p, u_location: e.target.value })); setErrors(p => ({ ...p, u_location: '' })) }}/>
            {errors.u_location && <span className="field-error">{errors.u_location}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">Volunteers Needed</label>
            <input type="number" min="1" className="form-input" placeholder="10"
              value={form.u_volunteers_needed} onChange={e => setForm(p => ({ ...p, u_volunteers_needed: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Start Date <span className="req">*</span></label>
            <input type="date" className={`form-input${errors.u_start_date ? ' input-error' : ''}`}
              value={form.u_start_date}
              onChange={e => { setForm(p => ({ ...p, u_start_date: e.target.value })); setErrors(p => ({ ...p, u_start_date: '' })) }}/>
            {errors.u_start_date && <span className="field-error">{errors.u_start_date}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">End Date</label>
            <input type="date" className={`form-input${errors.u_end_date ? ' input-error' : ''}`} value={form.u_end_date}
              onChange={e => { setForm(p => ({ ...p, u_end_date: e.target.value })); setErrors(p => ({ ...p, u_end_date: '' })) }}/>
            {errors.u_end_date && <span className="field-error">{errors.u_end_date}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">Status</label>
            <select className="form-input" value={form.u_status} onChange={e => setForm(p => ({ ...p, u_status: e.target.value }))}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{STATUS_LABELS[o] || o}</option>)}
            </select>
          </div>
          <div className="form-field span-2">
            <label className="form-label">Required Skills</label>
            <input className="form-input" placeholder="e.g. Teaching, IT Support, Healthcare"
              value={form.u_required_skills} onChange={e => setForm(p => ({ ...p, u_required_skills: e.target.value }))}/>
            <div className="skill-hints">
              {SKILL_OPTIONS.map(s => (
                <button key={s} type="button" className="skill-hint-btn"
                  onClick={() => setForm(p => ({ ...p, u_required_skills: p.u_required_skills ? `${p.u_required_skills}, ${s}` : s }))}>
                  + {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); setErrors({}) }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="btn-spinner"/> {editingProject ? 'Updating…' : 'Creating…'}</> : editingProject ? '✓ Update Project' : '✓ Create Project'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
