/**
 * Unit tests — form validation logic
 *
 * Each validate() function is extracted here as a pure function so it can be
 * tested without rendering a React component.
 */

import { describe, it, expect } from 'vitest'

// ─── Project form validation (mirrors ProjectsPage.jsx) ───────────────────────
function validateProject(form) {
  const e = {}
  const today = new Date().toISOString().split('T')[0]
  if (!form.u_project_name.trim()) e.u_project_name = 'Project name required'
  if (!form.u_location.trim())     e.u_location     = 'Location required'
  if (!form.u_start_date)          e.u_start_date   = 'Start date required'
  else if (form.u_start_date < today) e.u_start_date = 'Start date cannot be in the past'
  if (form.u_end_date && form.u_end_date < today)
    e.u_end_date = 'End date cannot be in the past'
  if (form.u_end_date && form.u_start_date && form.u_end_date < form.u_start_date)
    e.u_end_date = 'End date must be after start date'
  return e
}

// ─── Assignment form validation (mirrors AssignmentsPage.jsx) ─────────────────
function validateAssignment(form) {
  const e = {}
  const today = new Date().toISOString().split('T')[0]
  if (!form.u_volunteer) e.u_volunteer = 'Select a volunteer'
  if (!form.u_project)   e.u_project   = 'Select a project'
  if (form.u_assigned_date && form.u_assigned_date < today)
    e.u_assigned_date = 'Assigned date cannot be in the past'
  return e
}

// ─── Event form validation (mirrors EventsPage.jsx) ───────────────────────────
function validateEvent(form) {
  const e = {}
  const today = new Date().toISOString().split('T')[0]
  if (!form.u_event_name.trim())   e.u_event_name   = 'Event name is required'
  if (!form.u_description.trim())  e.u_description  = 'Description is required'
  if (!form.u_location.trim())     e.u_location     = 'Location is required'
  if (!form.u_event_date)          e.u_event_date   = 'Event date is required'
  else if (form.u_event_date < today) e.u_event_date = 'Event date cannot be in the past'
  if (!form.u_start_time)          e.u_start_time   = 'Start time is required'
  if (!form.u_end_time)            e.u_end_time     = 'End time is required'
  return e
}

const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
const PAST   = '2020-01-01'

// ─── Project tests ────────────────────────────────────────────────────────────
describe('Project form validation', () => {
  it('passes with all valid fields', () => {
    const errs = validateProject({
      u_project_name: 'Literacy Drive', u_location: 'Chennai',
      u_start_date: FUTURE, u_end_date: '',
    })
    expect(Object.keys(errs)).toHaveLength(0)
  })

  it('requires project name', () => {
    const errs = validateProject({ u_project_name: '  ', u_location: 'Chennai', u_start_date: FUTURE, u_end_date: '' })
    expect(errs.u_project_name).toBe('Project name required')
  })

  it('requires location', () => {
    const errs = validateProject({ u_project_name: 'X', u_location: '', u_start_date: FUTURE, u_end_date: '' })
    expect(errs.u_location).toBe('Location required')
  })

  it('requires start date', () => {
    const errs = validateProject({ u_project_name: 'X', u_location: 'Y', u_start_date: '', u_end_date: '' })
    expect(errs.u_start_date).toBe('Start date required')
  })

  it('rejects a past start date', () => {
    const errs = validateProject({ u_project_name: 'X', u_location: 'Y', u_start_date: PAST, u_end_date: '' })
    expect(errs.u_start_date).toBe('Start date cannot be in the past')
  })

  it('rejects a past end date', () => {
    const errs = validateProject({ u_project_name: 'X', u_location: 'Y', u_start_date: FUTURE, u_end_date: PAST })
    expect(errs.u_end_date).toBeTruthy()
  })

  it('accepts end date after start date', () => {
    const start = FUTURE                                                             // +7 days
    const end   = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0] // +14 days
    const errs  = validateProject({ u_project_name: 'X', u_location: 'Y', u_start_date: start, u_end_date: end })
    expect(Object.keys(errs)).toHaveLength(0)
  })

  it('rejects end date before start date', () => {
    const start = FUTURE                                                            // +7 days
    const end   = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] // +2 days < start
    const errs  = validateProject({ u_project_name: 'X', u_location: 'Y', u_start_date: start, u_end_date: end })
    expect(errs.u_end_date).toBe('End date must be after start date')
  })
})

// ─── Assignment tests ─────────────────────────────────────────────────────────
describe('Assignment form validation', () => {
  it('passes with volunteer, project and future date', () => {
    const errs = validateAssignment({ u_volunteer: 'v1', u_project: 'p1', u_assigned_date: FUTURE })
    expect(Object.keys(errs)).toHaveLength(0)
  })

  it('requires volunteer', () => {
    const errs = validateAssignment({ u_volunteer: '', u_project: 'p1', u_assigned_date: FUTURE })
    expect(errs.u_volunteer).toBe('Select a volunteer')
  })

  it('requires project', () => {
    const errs = validateAssignment({ u_volunteer: 'v1', u_project: '', u_assigned_date: FUTURE })
    expect(errs.u_project).toBe('Select a project')
  })

  it('rejects a past assigned date', () => {
    const errs = validateAssignment({ u_volunteer: 'v1', u_project: 'p1', u_assigned_date: PAST })
    expect(errs.u_assigned_date).toBe('Assigned date cannot be in the past')
  })

  it('allows today as assigned date', () => {
    const today = new Date().toISOString().split('T')[0]
    const errs = validateAssignment({ u_volunteer: 'v1', u_project: 'p1', u_assigned_date: today })
    expect(errs.u_assigned_date).toBeUndefined()
  })
})

// ─── Event tests ──────────────────────────────────────────────────────────────
describe('Event form validation', () => {
  const valid = {
    u_event_name: 'Clean-up Drive', u_description: 'Join us!',
    u_location: 'Park', u_event_date: FUTURE,
    u_start_time: '09:00', u_end_time: '13:00',
  }

  it('passes with all valid fields', () => {
    expect(Object.keys(validateEvent(valid))).toHaveLength(0)
  })

  it('requires event name', () => {
    const errs = validateEvent({ ...valid, u_event_name: '' })
    expect(errs.u_event_name).toBeTruthy()
  })

  it('requires description', () => {
    const errs = validateEvent({ ...valid, u_description: '  ' })
    expect(errs.u_description).toBeTruthy()
  })

  it('requires event date', () => {
    const errs = validateEvent({ ...valid, u_event_date: '' })
    expect(errs.u_event_date).toBe('Event date is required')
  })

  it('rejects a past event date', () => {
    const errs = validateEvent({ ...valid, u_event_date: PAST })
    expect(errs.u_event_date).toBe('Event date cannot be in the past')
  })

  it('requires start time', () => {
    const errs = validateEvent({ ...valid, u_start_time: '' })
    expect(errs.u_start_time).toBeTruthy()
  })

  it('requires end time', () => {
    const errs = validateEvent({ ...valid, u_end_time: '' })
    expect(errs.u_end_time).toBeTruthy()
  })
})
