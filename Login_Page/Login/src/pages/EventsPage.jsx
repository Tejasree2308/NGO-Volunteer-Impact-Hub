import React, { useState, useEffect } from 'react'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../api/servicenow'
import Modal from '../components/Modal'
import './Pages.css'

const STATUS_OPTIONS = ['open', 'closed', 'cancelled']
const STATUS_LABELS  = { open: 'Open for Registration', closed: 'Registration Closed', cancelled: 'Cancelled' }
const STATUS_COLORS  = { open: 'badge-green', closed: 'badge-gray', cancelled: 'badge-gold' }

export default function EventsPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({
    u_event_name: '',
    u_description: '',
    u_location: '',
    u_event_date: '',
    u_start_time: '',
    u_end_time: '',
    u_required_skills: '',
    u_max_participants: '',
    u_status: 'open'
  })
  const [errors, setErrors] = useState({})

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    try {
      const data = await getEvents()
      setEvents(data)
    } catch (e) { showToast('error', e.message) }
    finally { setLoading(false) }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3500)
  }

  function resetForm() {
    setForm({
      u_event_name: '',
      u_description: '',
      u_location: '',
      u_event_date: '',
      u_start_time: '',
      u_end_time: '',
      u_required_skills: '',
      u_max_participants: '',
      u_status: 'open'
    })
    setErrors({})
    setEditingEvent(null)
  }

  function openCreateModal() {
    resetForm()
    setModalOpen(true)
  }

  function openEditModal(event) {
    setForm({
      u_event_name: event.u_event_name,
      u_description: event.u_description,
      u_location: event.u_location,
      u_event_date: event.u_event_date,
      u_start_time: event.u_start_time,
      u_end_time: event.u_end_time,
      u_required_skills: event.u_required_skills,
      u_max_participants: event.u_max_participants,
      u_status: event.u_status
    })
    setEditingEvent(event)
    setModalOpen(true)
  }

  function validate() {
    const e = {}
    if (!form.u_event_name.trim()) e.u_event_name = 'Event name is required'
    if (!form.u_description.trim()) e.u_description = 'Description is required'
    if (!form.u_location.trim()) e.u_location = 'Location is required'
    if (!form.u_event_date) e.u_event_date = 'Event date is required'
    if (!form.u_start_time) e.u_start_time = 'Start time is required'
    if (!form.u_end_time) e.u_end_time = 'End time is required'
    if (form.u_max_participants && (isNaN(form.u_max_participants) || form.u_max_participants < 1)) {
      e.u_max_participants = 'Max participants must be a positive number'
    }
    return e
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      let result
      if (editingEvent) {
        result = await updateEvent(editingEvent.sys_id, form)
        setEvents(prev => prev.map(e => e.sys_id === editingEvent.sys_id ? result : e))
        showToast('success', `Event updated: ${form.u_event_name}`)
      } else {
        result = await createEvent(form)
        setEvents(prev => [result, ...prev])
        showToast('success', `Event created: ${form.u_event_name}`)
      }
      setModalOpen(false)
      resetForm()
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(event) {
    if (!confirm(`Delete event "${event.u_event_name}"? This action cannot be undone.`)) return
    try {
      await deleteEvent(event.sys_id)
      setEvents(prev => prev.filter(e => e.sys_id !== event.sys_id))
      showToast('success', `Event deleted: ${event.u_event_name}`)
    } catch (e) {
      showToast('error', e.message)
    }
  }

  function TableSkeleton() {
    return (
      <div className="table-card">
        <div className="skeleton-header">
          <div className="skeleton-line" style={{width: '200px'}}></div>
          <div className="skeleton-line" style={{width: '150px'}}></div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-line" style={{width: '180px'}}></div>
            <div className="skeleton-line" style={{width: '120px'}}></div>
            <div className="skeleton-line" style={{width: '100px'}}></div>
            <div className="skeleton-line" style={{width: '80px'}}></div>
            <div className="skeleton-line" style={{width: '120px'}}></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      {toast && <div className={`page-toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Events & Tasks</h1>
          <p className="page-sub">Create events and volunteer opportunities for registration</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal} id="add-event-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Event
        </button>
      </div>

      {loading ? <TableSkeleton /> : (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event Name</th>
                <th>Date & Time</th>
                <th>Location</th>
                <th>Participants</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map(event => (
                <tr key={event.sys_id}>
                  <td>
                    <div className="event-name-cell">
                      <strong>{event.u_event_name}</strong>
                      <div className="event-description">{event.u_description}</div>
                    </div>
                  </td>
                  <td>
                    <div className="event-datetime">
                      {new Date(event.u_event_date).toLocaleDateString()}
                      <br/>
                      <small>{event.u_start_time} - {event.u_end_time}</small>
                    </div>
                  </td>
                  <td>{event.u_location}</td>
                  <td>
                    <span className="participant-count">
                      {event.u_registered_count || 0}
                      {event.u_max_participants && ` / ${event.u_max_participants}`}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[event.u_status]}`}>
                      {STATUS_LABELS[event.u_status]}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-icon" onClick={() => openEditModal(event)} title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button className="btn-icon danger" onClick={() => handleDelete(event)} title="Delete">
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
          {events.length === 0 && (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h3>No events yet</h3>
              <p>Create your first volunteer event to get started</p>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); resetForm() }}
        title={editingEvent ? 'Edit Event' : 'Create New Event'}
      >
        <div className="form-grid">
          <div className="form-field span-2">
            <label className="form-label">Event Name <span className="req">*</span></label>
            <input
              type="text"
              value={form.u_event_name}
              onChange={e => setForm(prev => ({...prev, u_event_name: e.target.value}))}
              className={`form-input${errors.u_event_name ? ' input-error' : ''}`}
              placeholder="e.g., Community Clean-up Drive"
            />
            {errors.u_event_name && <span className="field-error">{errors.u_event_name}</span>}
          </div>

          <div className="form-field span-2">
            <label className="form-label">Description <span className="req">*</span></label>
            <textarea
              value={form.u_description}
              onChange={e => setForm(prev => ({...prev, u_description: e.target.value}))}
              className={`form-input${errors.u_description ? ' input-error' : ''}`}
              placeholder="Describe the event and what volunteers will do..."
              rows="3"
            />
            {errors.u_description && <span className="field-error">{errors.u_description}</span>}
          </div>

          <div className="form-field span-2">
            <label className="form-label">Location <span className="req">*</span></label>
            <input
              type="text"
              value={form.u_location}
              onChange={e => setForm(prev => ({...prev, u_location: e.target.value}))}
              className={`form-input${errors.u_location ? ' input-error' : ''}`}
              placeholder="e.g., Central Park, Downtown Community Center"
            />
            {errors.u_location && <span className="field-error">{errors.u_location}</span>}
          </div>

          <div className="form-field span-2">
            <label className="form-label">Event Date <span className="req">*</span></label>
            <input
              type="date"
              value={form.u_event_date}
              onChange={e => setForm(prev => ({...prev, u_event_date: e.target.value}))}
              className={`form-input${errors.u_event_date ? ' input-error' : ''}`}
              min={new Date().toISOString().split('T')[0]}
            />
            {errors.u_event_date && <span className="field-error">{errors.u_event_date}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Start Time <span className="req">*</span></label>
            <input
              type="time"
              value={form.u_start_time}
              onChange={e => setForm(prev => ({...prev, u_start_time: e.target.value}))}
              className={`form-input${errors.u_start_time ? ' input-error' : ''}`}
            />
            {errors.u_start_time && <span className="field-error">{errors.u_start_time}</span>}
          </div>
          <div className="form-field">
            <label className="form-label">End Time <span className="req">*</span></label>
            <input
              type="time"
              value={form.u_end_time}
              onChange={e => setForm(prev => ({...prev, u_end_time: e.target.value}))}
              className={`form-input${errors.u_end_time ? ' input-error' : ''}`}
            />
            {errors.u_end_time && <span className="field-error">{errors.u_end_time}</span>}
          </div>

          <div className="form-field span-2">
            <label className="form-label">Required Skills</label>
            <input
              type="text"
              value={form.u_required_skills}
              onChange={e => setForm(prev => ({...prev, u_required_skills: e.target.value}))}
              className="form-input"
              placeholder="e.g., cleaning, organization, leadership (comma-separated)"
            />
          </div>

          <div className="form-field">
            <label className="form-label">Max Participants</label>
            <input
              type="number"
              value={form.u_max_participants}
              onChange={e => setForm(prev => ({...prev, u_max_participants: e.target.value}))}
              className={`form-input${errors.u_max_participants ? ' input-error' : ''}`}
              placeholder="Leave empty for unlimited"
              min="1"
            />
            {errors.u_max_participants && <span className="field-error">{errors.u_max_participants}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Status</label>
            <select
              value={form.u_status}
              onChange={e => setForm(prev => ({...prev, u_status: e.target.value}))}
              className="form-input"
            >
              {STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => { setModalOpen(false); resetForm() }}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
          </button>
        </div>
      </Modal>
    </div>
  )
}