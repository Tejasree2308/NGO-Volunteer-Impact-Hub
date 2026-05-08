import React, { useState, useEffect } from 'react'
import { getProjects, createProject } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const STATUS_OPTIONS = ['planning', 'active', 'in_progress', 'completed', 'on_hold']
const SKILL_OPTIONS  = ['Teaching', 'First Aid', 'IT Support', 'Healthcare', 'Environmental', 'Counseling', 'Social Work', 'Legal Aid', 'Advocacy', 'Community']

export default function ProjectsPage() {
  const [projects, setProjects]   = useState([])
  const [filtered, setFiltered]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [form, setForm] = useState({
    u_project_name: '', u_description: '', u_location: '',
    u_start_date: '', u_end_date: '', u_required_skills: '',
    u_status: 'planning', u_volunteers_needed: ''
  })
  const [errors, setErrors] = useState({})

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

  function validate() {
    const e = {}
    if (!form.u_project_name.trim()) e.u_project_name = 'Project name required'
    if (!form.u_location.trim())     e.u_location     = 'Location required'
    if (!form.u_start_date)          e.u_start_date   = 'Start date required'
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const result = await createProject(form)
      setProjects(prev => [{ ...result, ...form }, ...prev])
      setModalOpen(false)
      setForm({ u_project_name: '', u_description: '', u_location: '', u_start_date: '', u_end_date: '', u_required_skills: '', u_status: 'planning', u_volunteers_needed: '' })
      setErrors({})
      showToast('success', `Project "${form.u_project_name}" created in ServiceNow!`)
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const statusColors = { active: 'badge-teal', in_progress: 'badge-blue', planning: 'badge-purple', completed: 'badge-green', on_hold: 'badge-gray' }
  const statusLabels = { active: 'Active', in_progress: 'In Progress', planning: 'Planning', completed: 'Completed', on_hold: 'On Hold' }

  function Field({ label, name, type = 'text', placeholder, required, span2 }) {
    return (
      <div className={`form-field${span2 ? ' span-2' : ''}`}>
        <label className="form-label">{label}{required && <span className="req">*</span>}</label>
        <input
          type={type}
          className={`form-input${errors[name] ? ' input-error' : ''}`}
          placeholder={placeholder}
          value={form[name]}
          onChange={e => { setForm(p => ({ ...p, [name]: e.target.value })); setErrors(p => ({ ...p, [name]: '' })) }}
        />
        {errors[name] && <span className="field-error">{errors[name]}</span>}
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">NGO Projects</h1>
          <p className="page-sub">Manage social service projects and track volunteer requirements</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)} id="add-project-btn">
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
              {s === 'all' ? 'All' : statusLabels[s] || s}
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
                <span className={`badge ${statusColors[p.u_status] || 'badge-gray'}`}>
                  {statusLabels[p.u_status] || p.u_status}
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
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }} title="Create New Project" size="lg">
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
            <input type="date" className="form-input" value={form.u_end_date}
              onChange={e => setForm(p => ({ ...p, u_end_date: e.target.value }))}/>
          </div>
          <div className="form-field">
            <label className="form-label">Status</label>
            <select className="form-input" value={form.u_status} onChange={e => setForm(p => ({ ...p, u_status: e.target.value }))}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{statusLabels[o] || o}</option>)}
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
            {saving ? <><span className="btn-spinner"/> Creating in ServiceNow…</> : '✓ Create Project'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
