/**
 * Unit tests — servicenow.js pure helper functions
 * (safeStr, refVal, refDisplay, mapVol / mapProject / mapAssignment shapes)
 */

import { describe, it, expect } from 'vitest'

// ─── Pure helpers (replicated for isolated testing) ──────────────────────────
const safeStr = (v) =>
  v && typeof v === 'object' ? (v.display_value || v.value || '') : (v || '')

function refVal(field) {
  if (!field) return ''
  return typeof field === 'object' ? (field.value || '') : field
}

function refDisplay(field) {
  if (!field) return ''
  return typeof field === 'object' ? (field.display_value || field.value || '') : field
}

function mapVol(r) {
  return {
    sys_id:            r.sys_id,
    name:              r.u_name             || '',
    email:             r.u_email            || '',
    mobile_phone:      r.u_phone            || '',
    u_skills:          r.u_skills           || '',
    u_availability:    r.u_availability     || '',
    u_address:         r.u_address          || '',
    u_approval_status: r.u_approval_status  || 'pending',
    active:            r.u_is_active === 'true' || r.u_is_active === true ? 'true' : 'false',
    u_sys_user_id:     r.u_sys_user_id      || '',
  }
}

function mapProject(r) {
  const s = safeStr
  return {
    sys_id:              r.sys_id,
    u_project_name:      s(r.u_project_name)  || 'Unnamed Project',
    u_description:       s(r.u_description),
    u_location:          s(r.u_location)       || 'Location TBD',
    u_start_date:        s(r.u_start_date).split(' ')[0],
    u_end_date:          s(r.u_end_date).split(' ')[0],
    u_required_skills:   s(r.u_required_skills) || 'General Volunteer',
    u_status:            s(r.u_status)          || 'planning',
    u_volunteers_needed: s(r.u_volunteers_needed) || '10',
  }
}

function mapAssignment(r) {
  const volField  = r.volunteer  || r.u_volunteer
  const projField = r.project    || r.u_project
  return {
    sys_id:              r.sys_id,
    u_volunteer:         refVal(volField),
    u_volunteer_name:    refDisplay(volField),
    u_project:           refVal(projField),
    u_project_name:      refDisplay(projField),
    u_assigned_date:     safeStr(r.assigned_date  || r.u_assigned_date),
    u_hours_worked:      safeStr(r.hours_worked   || r.u_hours_worked   || '0'),
    u_completion_status: safeStr(r.completion_status || r.u_completion_status || 'pending'),
  }
}

// ─── safeStr tests ────────────────────────────────────────────────────────────
describe('safeStr', () => {
  it('returns the string as-is', () => expect(safeStr('hello')).toBe('hello'))
  it('returns empty string for null', () => expect(safeStr(null)).toBe(''))
  it('returns empty string for undefined', () => expect(safeStr(undefined)).toBe(''))
  it('prefers display_value from object', () => expect(safeStr({ display_value: 'Foo', value: 'bar' })).toBe('Foo'))
  it('falls back to value if no display_value', () => expect(safeStr({ value: 'bar' })).toBe('bar'))
  it('returns empty string for empty object', () => expect(safeStr({})).toBe(''))
})

// ─── refVal / refDisplay tests ────────────────────────────────────────────────
describe('refVal', () => {
  it('extracts value from SN reference object', () =>
    expect(refVal({ value: 'abc123', display_value: 'Alice' })).toBe('abc123'))
  it('returns the string itself when not an object', () => expect(refVal('abc123')).toBe('abc123'))
  it('returns empty string for null', () => expect(refVal(null)).toBe(''))
})

describe('refDisplay', () => {
  it('extracts display_value from SN reference object', () =>
    expect(refDisplay({ value: 'abc123', display_value: 'Alice' })).toBe('Alice'))
  it('falls back to value when display_value is absent', () =>
    expect(refDisplay({ value: 'abc123' })).toBe('abc123'))
  it('returns the string itself when not an object', () => expect(refDisplay('Alice')).toBe('Alice'))
})

// ─── mapVol tests ─────────────────────────────────────────────────────────────
describe('mapVol', () => {
  const raw = {
    sys_id: 'v1', u_name: 'Priya', u_email: 'priya@test.com',
    u_phone: '9876543210', u_skills: 'Teaching',
    u_availability: 'weekends', u_address: 'Chennai',
    u_approval_status: 'approved', u_is_active: 'true', u_sys_user_id: 's1',
  }

  it('maps all fields correctly', () => {
    const vol = mapVol(raw)
    expect(vol.name).toBe('Priya')
    expect(vol.email).toBe('priya@test.com')
    expect(vol.active).toBe('true')
    expect(vol.u_sys_user_id).toBe('s1')
  })

  it('sets active to false when u_is_active is false', () => {
    expect(mapVol({ ...raw, u_is_active: 'false' }).active).toBe('false')
  })

  it('defaults approval_status to pending when missing', () => {
    expect(mapVol({ ...raw, u_approval_status: undefined }).u_approval_status).toBe('pending')
  })
})

// ─── mapProject tests ─────────────────────────────────────────────────────────
describe('mapProject', () => {
  const raw = {
    sys_id: 'p1', u_project_name: 'Literacy Drive',
    u_description: 'Teach basic skills', u_location: 'Chennai',
    u_start_date: '2025-06-01 00:00:00', u_end_date: '2025-08-31 00:00:00',
    u_required_skills: 'Teaching', u_status: 'active', u_volunteers_needed: '10',
  }

  it('strips time from dates', () => {
    const proj = mapProject(raw)
    expect(proj.u_start_date).toBe('2025-06-01')
    expect(proj.u_end_date).toBe('2025-08-31')
  })

  it('defaults missing project name to Unnamed Project', () => {
    expect(mapProject({ ...raw, u_project_name: '' }).u_project_name).toBe('Unnamed Project')
  })

  it('defaults missing status to planning', () => {
    expect(mapProject({ ...raw, u_status: undefined }).u_status).toBe('planning')
  })
})

// ─── mapAssignment tests ──────────────────────────────────────────────────────
describe('mapAssignment', () => {
  it('extracts sys_id (not display_value) for u_volunteer', () => {
    const raw = {
      sys_id: 'a1',
      volunteer: { value: 'v-sys-id', display_value: 'Priya Sharma' },
      project:   { value: 'p-sys-id', display_value: 'Literacy Drive' },
      assigned_date: '2025-06-01', hours_worked: '8', completion_status: 'in_progress',
    }
    const a = mapAssignment(raw)
    expect(a.u_volunteer).toBe('v-sys-id')
    expect(a.u_volunteer_name).toBe('Priya Sharma')
    expect(a.u_project).toBe('p-sys-id')
    expect(a.u_project_name).toBe('Literacy Drive')
  })

  it('defaults hours_worked to 0 when missing', () => {
    const raw = { sys_id: 'a2', volunteer: 'v1', project: 'p1' }
    expect(mapAssignment(raw).u_hours_worked).toBe('0')
  })

  it('defaults completion_status to pending when missing', () => {
    const raw = { sys_id: 'a3', volunteer: 'v1', project: 'p1' }
    expect(mapAssignment(raw).u_completion_status).toBe('pending')
  })
})
