import React, { useState, useEffect } from 'react'
import { getVolunteers, updateVolunteer, getAssignments, getMyAssignments, getProjects, getAvailableEvents, registerForEvent, getEventRegistrations, updateAssignmentHours } from '../api/servicenow'
import './Dashboard.css'

const SKILLS_OPTIONS = ['Teaching', 'First Aid', 'IT Support', 'Data Entry', 'Healthcare', 'Counseling', 'Environmental', 'Planting', 'Social Work', 'Community', 'Legal Aid', 'Advocacy']
const AVAIL_OPTIONS = ['weekdays', 'weekends', 'flexible', 'mornings', 'evenings']

export default function VolunteerDashboard({ user }) {
  const [volunteers, setVolunteers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [projects, setProjects] = useState([])
  const [availableEvents, setAvailableEvents] = useState([])
  const [myRegistrations, setMyRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
  const [errors, setErrors] = useState({})
  const [hoursEdits, setHoursEdits] = useState({})
  const [savingHours, setSavingHours] = useState({})
  const [regForm, setRegForm] = useState({ name: '', mobile_phone: '', u_skills: '', u_availability: 'weekends', u_address: '' })
  const [regErrors, setRegErrors] = useState({})
  const [regSaving, setRegSaving] = useState(false)
  const [regDone, setRegDone] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const v = await getVolunteers()
        const myRecord = v.find(vol => vol.email === user.email)
        const myVolSysId = myRecord?.sys_id || user.sys_id
        const [a, p, events, regs] = await Promise.all([
          getMyAssignments(myVolSysId),
          getProjects(),
          getAvailableEvents(user.sys_id),
          getEventRegistrations(user.sys_id)
        ])
        setVolunteers(v)
        setAssignments(a)
        setProjects(p)
        setAvailableEvents(events)
        setMyRegistrations(regs)
        if (myRecord) {
          setForm({
            name: myRecord.name || '',
            email: myRecord.email || '',
            mobile_phone: myRecord.mobile_phone || '',
            u_skills: myRecord.u_skills || '',
            u_availability: myRecord.u_availability || 'weekends',
            u_address: myRecord.u_address || ''
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

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
      const myRecord = volunteers.find(v => v.email === user.email)
      if (!myRecord) {
        showToast('error', 'Volunteer record not found. Please contact your coordinator.')
        return
      }
      await updateVolunteer(myRecord.sys_id, form)
      showToast('success', 'Profile updated successfully!')
      setEditing(false)
    } catch (err) {
      showToast('error', err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogHours(assignmentSysId, hours) {
    setSavingHours(prev => ({ ...prev, [assignmentSysId]: true }))
    try {
      await updateAssignmentHours(assignmentSysId, hours)
      setAssignments(prev => prev.map(a =>
        a.sys_id === assignmentSysId ? { ...a, u_hours_worked: String(hours) } : a
      ))
      setHoursEdits(prev => ({ ...prev, [assignmentSysId]: undefined }))
      showToast('success', 'Hours logged successfully!')
    } catch (err) {
      showToast('error', err.message || 'Failed to log hours')
    } finally {
      setSavingHours(prev => ({ ...prev, [assignmentSysId]: false }))
    }
  }

  function validateReg() {
    const e = {}
    if (!regForm.name.trim())         e.name         = 'Name is required'
    if (!regForm.mobile_phone.trim()) e.mobile_phone = 'Phone is required'
    else if (!/^\d{10}$/.test(regForm.mobile_phone.trim())) e.mobile_phone = 'Must be 10 digits'
    if (!regForm.u_skills.trim())     e.u_skills     = 'At least one skill required'
    return e
  }

  async function handleRegister() {
    const errs = validateReg()
    if (Object.keys(errs).length) { setRegErrors(errs); return }
    setRegSaving(true)
    try {
      const myRecord = volunteers.find(v => v.email === user.email)
      if (!myRecord) throw new Error('Volunteer record not found.')
      await updateVolunteer(myRecord.sys_id, { ...regForm, email: user.email })
      setRegDone(true)
      showToast('success', 'Registration details saved!')
    } catch (err) {
      showToast('error', err.message || 'Failed to save details')
    } finally {
      setRegSaving(false)
    }
  }

  async function handleRegisterForEvent(eventId) {
    try {
      await registerForEvent(user.sys_id, eventId)
      showToast('success', 'Successfully registered for event!')
      // Refresh data
      const [events, regs] = await Promise.all([
        getAvailableEvents(user.sys_id),
        getEventRegistrations(user.sys_id)
      ])
      setAvailableEvents(events)
      setMyRegistrations(regs)
    } catch (err) {
      showToast('error', err.message || 'Failed to register for event')
    }
  }

  if (loading) return <LoadingState />

  // assignments are already filtered server-side to this volunteer
  const myAssignments = assignments
  const myProjectIds = [...new Set(myAssignments.map(a => a.u_project).filter(Boolean))]
  const myProjects = projects.filter(p =>
    myProjectIds.includes(p.sys_id) ||
    myAssignments.some(a => a.u_project_name === p.u_project_name)
  )

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Volunteer Dashboard</h1>
          <p className="page-sub">Welcome back, {user.name}! Here's your volunteer overview</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Volunteer Stats */}
        <div className="stat-card stat-teal">
          <div className="stat-icon"><IconUsers /></div>
          <div className="stat-body">
            <span className="stat-val">{volunteers.length}</span>
            <span className="stat-label">Total Volunteers</span>
          </div>
        </div>

        {/* My Assignments */}
        <div className="stat-card stat-blue">
          <div className="stat-icon"><IconBriefcase /></div>
          <div className="stat-body">
            <span className="stat-val">{myAssignments.length}</span>
            <span className="stat-label">My Assignments</span>
          </div>
        </div>

        {/* My Projects */}
        <div className="stat-card stat-gold">
          <div className="stat-icon"><IconProject /></div>
          <div className="stat-body">
            <span className="stat-val">{myProjects.length}</span>
            <span className="stat-label">My Projects</span>
          </div>
        </div>

        {/* My Events */}
        <div className="stat-card stat-purple">
          <div className="stat-icon"><IconCalendar /></div>
          <div className="stat-body">
            <span className="stat-val">{myRegistrations.length}</span>
            <span className="stat-label">Registered Events</span>
          </div>
        </div>

        {/* My Profile Section */}
        <div className="content-card">
          <div className="card-header">
            <h3>My Profile</h3>
            <p>Update your volunteer information</p>
            {!editing && (
              <button className="btn-edit" onClick={() => setEditing(true)}>
                <IconEdit /> Edit Profile
              </button>
            )}
          </div>
          {editing ? (
            <div className="profile-form">
              <div className="form-row">
                <label>Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
                {errors.name && <span className="error">{errors.name}</span>}
              </div>
              <div className="form-row">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} />
                {errors.email && <span className="error">{errors.email}</span>}
              </div>
              <div className="form-row">
                <label>Phone</label>
                <input type="tel" value={form.mobile_phone} onChange={e => setForm(f => ({...f, mobile_phone: e.target.value}))} />
                {errors.mobile_phone && <span className="error">{errors.mobile_phone}</span>}
              </div>
              <div className="form-row">
                <label>Skills</label>
                <select value={form.u_skills} onChange={e => setForm(f => ({...f, u_skills: e.target.value}))}>
                  <option value="">Select skills</option>
                  {SKILLS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.u_skills && <span className="error">{errors.u_skills}</span>}
              </div>
              <div className="form-row">
                <label>Availability</label>
                <select value={form.u_availability} onChange={e => setForm(f => ({...f, u_availability: e.target.value}))}>
                  {AVAIL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Address</label>
                <textarea value={form.u_address} onChange={e => setForm(f => ({...f, u_address: e.target.value}))} />
              </div>
              <div className="form-actions">
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="profile-display">
              <div className="profile-item"><strong>Name:</strong> {form.name}</div>
              <div className="profile-item"><strong>Email:</strong> {form.email}</div>
              <div className="profile-item"><strong>Phone:</strong> {form.mobile_phone}</div>
              <div className="profile-item"><strong>Skills:</strong> {form.u_skills}</div>
              <div className="profile-item"><strong>Availability:</strong> {form.u_availability}</div>
              <div className="profile-item"><strong>Address:</strong> {form.u_address}</div>
            </div>
          )}
        </div>
      </div>

      {/* Volunteer Registration Form */}
      <div className="content-card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <h3>Volunteer Registration</h3>
          <p>Fill in your details to complete your volunteer profile</p>
        </div>

        {regDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0', color: '#059669' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 28, height: 28, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
            </svg>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Details saved successfully!</div>
              <button style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', padding: 0, fontSize: '0.85rem', textDecoration: 'underline', marginTop: 4 }}
                onClick={() => setRegDone(false)}>Update again</button>
            </div>
          </div>
        ) : (
          <div className="reg-form-grid">
            {/* Full Name */}
            <div className="reg-field">
              <label className="reg-label">Full Name <span style={{ color: '#ef4444' }}>*</span></label>
              <input className={`reg-input${regErrors.name ? ' reg-input-err' : ''}`}
                type="text" placeholder="e.g. Priya Sharma" value={regForm.name}
                onChange={e => { setRegForm(f => ({ ...f, name: e.target.value })); setRegErrors(f => ({ ...f, name: '' })) }} />
              {regErrors.name && <span className="reg-err">{regErrors.name}</span>}
            </div>

            {/* Phone */}
            <div className="reg-field">
              <label className="reg-label">Phone Number <span style={{ color: '#ef4444' }}>*</span></label>
              <input className={`reg-input${regErrors.mobile_phone ? ' reg-input-err' : ''}`}
                type="text" placeholder="10-digit number" value={regForm.mobile_phone}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setRegForm(f => ({ ...f, mobile_phone: v })); setRegErrors(f => ({ ...f, mobile_phone: '' })) }} />
              {regErrors.mobile_phone && <span className="reg-err">{regErrors.mobile_phone}</span>}
            </div>

            {/* Skills */}
            <div className="reg-field" style={{ gridColumn: '1 / -1' }}>
              <label className="reg-label">Skills <span style={{ color: '#ef4444' }}>*</span></label>
              <input className={`reg-input${regErrors.u_skills ? ' reg-input-err' : ''}`}
                placeholder="e.g. Teaching, First Aid" value={regForm.u_skills}
                onChange={e => { setRegForm(f => ({ ...f, u_skills: e.target.value })); setRegErrors(f => ({ ...f, u_skills: '' })) }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {SKILLS_OPTIONS.map(s => (
                  <button key={s} type="button"
                    onClick={() => setRegForm(f => ({ ...f, u_skills: f.u_skills ? `${f.u_skills}, ${s}` : s }))}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f8fafc', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
                    + {s}
                  </button>
                ))}
              </div>
              {regErrors.u_skills && <span className="reg-err">{regErrors.u_skills}</span>}
            </div>

            {/* Availability */}
            <div className="reg-field">
              <label className="reg-label">Availability</label>
              <select className="reg-input" value={regForm.u_availability}
                onChange={e => setRegForm(f => ({ ...f, u_availability: e.target.value }))}>
                {AVAIL_OPTIONS.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
              </select>
            </div>

            {/* Address */}
            <div className="reg-field">
              <label className="reg-label">Address</label>
              <input className="reg-input" type="text" placeholder="City, State"
                value={regForm.u_address} onChange={e => setRegForm(f => ({ ...f, u_address: e.target.value }))} />
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
              <button className="btn-primary" onClick={handleRegister} disabled={regSaving}>
                {regSaving ? <><span className="btn-spinner"/> Saving…</> : '✓ Save Registration Details'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* My Assignments and Projects */}
      <div className="dashboard-grid secondary">
        {/* My Assignments */}
        <div className="content-card">
          <div className="card-header">
            <h3>My Assignments</h3>
            <p>Your current volunteer assignments</p>
          </div>
          <div className="assignments-list">
            {myAssignments.length > 0 ? myAssignments.slice(0, 5).map(a => {
              const currentHours = hoursEdits[a.sys_id] !== undefined ? hoursEdits[a.sys_id] : (a.u_hours_worked || '0')
              const projectName = a.u_project_name || projects.find(p => p.sys_id === a.u_project)?.u_project_name || a.u_project || 'Unknown Project'
              return (
                <div key={a.sys_id} className="assignment-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <div className="assignment-info">
                      <span className="assignment-project">{projectName}</span>
                      <span className="assignment-status">Status: {a.u_completion_status || 'Active'}</span>
                    </div>
                    <span className="badge badge-blue" style={{ alignSelf: 'center' }}>{a.u_hours_worked || 0}h logged</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={currentHours}
                      onChange={e => setHoursEdits(prev => ({ ...prev, [a.sys_id]: e.target.value }))}
                      style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
                      placeholder="Hours"
                    />
                    <button
                      className="btn-primary"
                      style={{ padding: '4px 14px', fontSize: '0.78rem', borderRadius: '6px' }}
                      disabled={savingHours[a.sys_id] || currentHours === (a.u_hours_worked || '0')}
                      onClick={() => handleLogHours(a.sys_id, currentHours)}
                    >
                      {savingHours[a.sys_id] ? 'Saving…' : 'Log Hours'}
                    </button>
                  </div>
                </div>
              )
            }) : <p>No assignments yet.</p>}
          </div>
        </div>

        {/* My Projects */}
        <div className="content-card">
          <div className="card-header">
            <h3>My Projects</h3>
            <p>Projects you're contributing to</p>
          </div>
          <div className="projects-list">
            {myProjects.length > 0 ? myProjects.slice(0, 5).map(p => (
              <div key={p.sys_id} className="project-item">
                <div className="project-info">
                  <span className="project-name">{p.u_project_name}</span>
                  <span className="project-location">{p.u_location}</span>
                </div>
                <div className="project-status">
                  {p.u_status}
                </div>
              </div>
            )) : <p>No projects assigned yet.</p>}
          </div>
        </div>
      </div>

      {/* Available Events */}
      <div className="content-card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <h3>Available Events</h3>
          <p>Register for upcoming volunteer opportunities</p>
        </div>
        <div className="events-list">
          {availableEvents.length > 0 ? availableEvents.slice(0, 5).map(event => (
            <div key={event.sys_id} className="event-item">
              <div className="event-info">
                <span className="event-name">{event.u_event_name}</span>
                <span className="event-details">
                  {new Date(event.u_event_date).toLocaleDateString()} • {event.u_start_time} - {event.u_end_time} • {event.u_location}
                </span>
                <span className="event-description">{event.u_description}</span>
                {event.u_required_skills && (
                  <span className="event-skills">Skills needed: {event.u_required_skills}</span>
                )}
              </div>
              <div className="event-actions">
                <span className="spots-left">
                  {event.u_max_participants ? `${event.u_max_participants - (event.u_registered_count || 0)} spots left` : 'Unlimited spots'}
                </span>
                <button
                  className="btn-register"
                  onClick={() => handleRegisterForEvent(event.sys_id)}
                >
                  Register
                </button>
              </div>
            </div>
          )) : <p>No events available for registration at this time.</p>}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite"
          className={`toast${toast.type === 'success' ? ' success' : ' error-toast'}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? <IconCheck /> : '✕'}
          </span>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div className="skel skel-title"/>
          <div className="skel skel-sub"/>
        </div>
      </div>
      <div className="dashboard-grid">
        {[...Array(4)].map((_, i) => <div key={i} className="skel skel-stat"/>)}
        <div className="skel skel-card"/>
      </div>
      <div className="dashboard-grid secondary" style={{ marginTop: 24 }}>
        <div className="skel skel-card"/>
        <div className="skel skel-card"/>
      </div>
      <div className="skel skel-card" style={{ marginTop: 24 }}/>
    </div>
  )
}

// Icons
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/>
  </svg>
)
const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>
)
const IconProject = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 12l2 2 4-4"/>
    <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1"/>
    <path d="M3 21h18"/>
    <path d="M5 21V12"/>
    <path d="M19 21V12"/>
  </svg>
)
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const IconEdit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)