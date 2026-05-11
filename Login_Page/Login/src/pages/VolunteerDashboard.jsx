import React, { useState, useEffect } from 'react'
import { getVolunteers, updateVolunteer, getAssignments, getProjects, getAvailableEvents, registerForEvent, getEventRegistrations, updateAssignmentHours } from '../api/servicenow'
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
  const [hoursEdits, setHoursEdits] = useState({}) // { [sys_id]: hoursValue }
  const [savingHours, setSavingHours] = useState({}) // { [sys_id]: bool }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [v, a, p, events, regs] = await Promise.all([
          getVolunteers(),
          getAssignments(),
          getProjects(),
          getAvailableEvents(user.sys_id),
          getEventRegistrations(user.sys_id)
        ])
        setVolunteers(v)
        setAssignments(a)
        setProjects(p)
        setAvailableEvents(events)
        setMyRegistrations(regs)
        // Find current user's volunteer record
        const myRecord = v.find(v => v.email === user.email)
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

  // Find my volunteer record
  const myRecord = volunteers.find(v => v.email === user.email)
  const myAssignments = assignments.filter(a =>
    a.u_volunteer === myRecord?.sys_id ||
    (myRecord && (a.u_volunteer || '').toLowerCase().includes((myRecord.name || '').toLowerCase()))
  )
  const myProjectIds = [...new Set(myAssignments.map(a => a.u_project).filter(Boolean))]
  const myProjects = projects.filter(p => myProjectIds.includes(p.sys_id) || myProjectIds.some(id => p.u_project_name === id))

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
              const projectName = projects.find(p => p.sys_id === a.u_project || p.u_project_name === a.u_project)?.u_project_name || a.u_project || 'Unknown Project'
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