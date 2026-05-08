import React, { useState, useEffect } from 'react'
import { getImpactReports, createImpactReport, getProjects } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

export default function ReportsPage() {
  const [reports, setReports]     = useState([])
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [form, setForm] = useState({ u_project: '', u_volunteers_involved: '', u_total_hours: '', u_beneficiaries_reached: '', u_outcome_summary: '' })
  const [errors, setErrors] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([getImpactReports(), getProjects()])
      setReports(r)
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
    if (!form.u_project) e.u_project = 'Select a project'
    if (!form.u_volunteers_involved) e.u_volunteers_involved = 'Required'
    if (!form.u_total_hours) e.u_total_hours = 'Required'
    if (!form.u_beneficiaries_reached) e.u_beneficiaries_reached = 'Required'
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const result = await createImpactReport(form)
      setReports(prev => [{ ...result, ...form }, ...prev])
      setModalOpen(false)
      setForm({ u_project: '', u_volunteers_involved: '', u_total_hours: '', u_beneficiaries_reached: '', u_outcome_summary: '' })
      setErrors({})
      showToast('success', 'Impact report created and saved to ServiceNow!')
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  // Aggregated totals
  const totals = reports.reduce((acc, r) => ({
    volunteers:     acc.volunteers + (parseInt(r.u_volunteers_involved) || 0),
    hours:          acc.hours + (parseInt(r.u_total_hours) || 0),
    beneficiaries:  acc.beneficiaries + (parseInt(r.u_beneficiaries_reached) || 0),
  }), { volunteers: 0, hours: 0, beneficiaries: 0 })

  const maxBenef = Math.max(...reports.map(r => parseInt(r.u_beneficiaries_reached) || 0), 1)

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Impact Reports</h1>
          <p className="page-sub">Measure and report social impact to donors and stakeholders</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)} id="add-report-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Impact Report
        </button>
      </div>

      {/* Aggregate Stats */}
      <div className="report-summary-grid">
        <div className="report-sum-card sum-teal">
          <div className="sum-icon">👥</div>
          <div className="sum-val">{totals.volunteers.toLocaleString()}</div>
          <div className="sum-label">Volunteers Involved</div>
        </div>
        <div className="report-sum-card sum-blue">
          <div className="sum-icon">⏱️</div>
          <div className="sum-val">{totals.hours.toLocaleString()}</div>
          <div className="sum-label">Total Hours</div>
        </div>
        <div className="report-sum-card sum-gold">
          <div className="sum-icon">🌍</div>
          <div className="sum-val">{totals.beneficiaries.toLocaleString()}</div>
          <div className="sum-label">Beneficiaries Reached</div>
        </div>
        <div className="report-sum-card sum-purple">
          <div className="sum-icon">📋</div>
          <div className="sum-val">{reports.length}</div>
          <div className="sum-label">Reports Generated</div>
        </div>
      </div>

      {/* Impact Bar Chart */}
      {!loading && reports.length > 0 && (
        <div className="impact-chart-card">
          <h2 className="chart-title">Beneficiaries Reached by Project</h2>
          <div className="bar-chart">
            {reports.map((r, i) => {
              const pct = Math.round((parseInt(r.u_beneficiaries_reached) || 0) / maxBenef * 100)
              const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
              return (
                <div key={r.sys_id} className="bar-row">
                  <div className="bar-label">{r.u_project}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }}>
                      <span className="bar-val">{parseInt(r.u_beneficiaries_reached).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Report Cards */}
      {loading ? (
        <div className="report-grid">{[...Array(3)].map((_, i) => <div key={i} className="skeleton-card tall"/>)}</div>
      ) : (
        <div className="report-grid">
          {reports.length === 0 ? <div className="empty-state">No impact reports yet. Add your first report!</div>
          : reports.map((r, i) => (
            <div key={r.sys_id} className="report-card">
              <div className="report-card-header">
                <div className="report-project">{r.u_project || r.u_project?.display_value}</div>
                <div className="report-id">#{(r.sys_id || '').slice(-6)}</div>
              </div>
              <div className="report-metrics">
                <div className="rm-item">
                  <span className="rm-val">{r.u_volunteers_involved}</span>
                  <span className="rm-key">Volunteers</span>
                </div>
                <div className="rm-sep"/>
                <div className="rm-item">
                  <span className="rm-val">{r.u_total_hours}h</span>
                  <span className="rm-key">Hours</span>
                </div>
                <div className="rm-sep"/>
                <div className="rm-item">
                  <span className="rm-val">{parseInt(r.u_beneficiaries_reached).toLocaleString()}</span>
                  <span className="rm-key">Beneficiaries</span>
                </div>
              </div>
              {r.u_outcome_summary && (
                <p className="report-summary">{r.u_outcome_summary}</p>
              )}
              <div className="report-actions">
                <button className="btn-outline" onClick={() => {
                  const content = `IMPACT REPORT\nProject: ${r.u_project}\nVolunteers: ${r.u_volunteers_involved}\nHours: ${r.u_total_hours}\nBeneficiaries: ${r.u_beneficiaries_reached}\nOutcome: ${r.u_outcome_summary || 'N/A'}`
                  const blob = new Blob([content], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `impact-report-${r.sys_id?.slice(-6) || i}.txt`
                  a.click()
                }}>
                  📄 Export Report
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setErrors({}) }} title="Add Impact Report" size="md">
        <div className="form-grid">
          <div className="form-field span-2">
            <label className="form-label">Project <span className="req">*</span></label>
            <select className={`form-input${errors.u_project ? ' input-error' : ''}`} value={form.u_project}
              onChange={e => { setForm(p => ({ ...p, u_project: e.target.value })); setErrors(p => ({ ...p, u_project: '' })) }}>
              <option value="">— Select Project —</option>
              {projects.map(p => <option key={p.sys_id} value={p.u_project_name}>{p.u_project_name}</option>)}
            </select>
            {errors.u_project && <span className="field-error">{errors.u_project}</span>}
          </div>
          {[
            { label: 'Volunteers Involved', name: 'u_volunteers_involved', placeholder: '10' },
            { label: 'Total Hours', name: 'u_total_hours', placeholder: '240' },
            { label: 'Beneficiaries Reached', name: 'u_beneficiaries_reached', placeholder: '500' },
          ].map(({ label, name, placeholder }) => (
            <div key={name} className="form-field">
              <label className="form-label">{label} <span className="req">*</span></label>
              <input type="number" min="0" className={`form-input${errors[name] ? ' input-error' : ''}`}
                placeholder={placeholder} value={form[name]}
                onChange={e => { setForm(p => ({ ...p, [name]: e.target.value })); setErrors(p => ({ ...p, [name]: '' })) }}/>
              {errors[name] && <span className="field-error">{errors[name]}</span>}
            </div>
          ))}
          <div className="form-field span-2">
            <label className="form-label">Outcome Summary</label>
            <textarea className="form-input" rows={4} placeholder="Describe the project outcomes and community impact…"
              value={form.u_outcome_summary} onChange={e => setForm(p => ({ ...p, u_outcome_summary: e.target.value }))}/>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); setErrors({}) }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="btn-spinner"/> Saving…</> : '✓ Save Report'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
