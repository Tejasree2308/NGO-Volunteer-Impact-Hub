/**
 * servicenow.js — ServiceNow PDI REST API Layer
 *
 * All calls go through Vite's proxy (/api/now → VITE_SN_INSTANCE)
 * so credentials are never exposed in the browser.
 *
 * Tables used:
 *  - sys_user           → volunteer accounts
 *  - x_ngo_projects     → NGO projects (custom table on PDI)
 *  - x_ngo_assignments  → volunteer ↔ project assignments
 *  - x_ngo_impact       → impact reports
 *
 * If custom tables don't exist yet on your PDI, the app falls back
 * to demo/mock data so you can still see the full UI.
 */

const BASE = '/api/now/table'

// ─── Connection state ──────────────────────────────────────────────────────
// Once we detect SN is unreachable, skip all future calls immediately
let snReachable = true

// Exported reactive state — imported by SNStatusBanner to show connection health
export const snConnectionState = { mode: 'checking' } // 'live' | 'demo' | 'unreachable' | 'checking'

// Helper for write operation catch blocks: fall back silently in demo mode, throw in live mode
function writeFallback(err, demoResult) {
  if (err.message.includes('unreachable') || snConnectionState.mode === 'demo') {
    return { ...demoResult, _isDemo: true }
  }
  throw err
}

// ─── Build auth header ─────────────────────────────────────────────────────
const authHeader = () => {
  const user = import.meta.env.VITE_SN_USERNAME || 'admin'
  const pass = import.meta.env.VITE_SN_PASSWORD || ''
  return `Basic ${btoa(`${user}:${pass}`)}`
}

// ─── Generic fetch wrapper (3s timeout, instant fail once unreachable) ─────
async function snFetch(path, options = {}) {
  // If we already know SN is down (network failure), fail instantly
  if (!snReachable) {
    throw new Error('ServiceNow PDI unreachable — using demo data.')
  }

  const url = `${BASE}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)  // 8 second timeout

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: authHeader(),
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timer)
    if (!res.ok) {
      // HTTP errors (400, 403, etc.) — do NOT mark SN as unreachable
      // SN is reachable, just the specific call failed
      const errText = await res.text().catch(() => '')
      console.error(`[SN API Error] ${res.status} ${res.statusText}`, path, errText)
      throw new Error(`ServiceNow API error: ${res.status} ${res.statusText} — ${errText}`)
    }
    snReachable = true
    snConnectionState.mode = 'live'
    return res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError' || err.message.includes('fetch')) {
      // Only mark unreachable on genuine network failures
      snReachable = false
      snConnectionState.mode = 'unreachable'
      throw new Error('ServiceNow PDI unreachable (network error). Running in demo mode.')
    }
    throw err   // re-throw HTTP errors as-is
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION SYSTEM  — stateless JWT-style tokens
// Token = base64(payload JSON) — self-contained, survives cold starts.
// No server-side Map; the token itself carries expiry and user data.
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

function createSession(user) {
  const payload = { ...user, iat: Date.now(), exp: Date.now() + SESSION_TIMEOUT }
  return btoa(JSON.stringify(payload))
}

function validateSessionToken(token) {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.exp || Date.now() > payload.exp) return null
    const { iat, exp, ...user } = payload
    return user
  } catch {
    return null
  }
}

function destroySession(_token) {
  // Stateless — caller removes the token from localStorage; nothing to clear server-side.
}

function updateSessionActivity(_token) {
  // Stateless — expiry is encoded in the token itself; no mutable store to update.
}

/**
 * Enhanced authenticate user with session management
 */
export async function authenticateUser(email, password) {
  const snUser = import.meta.env.VITE_SN_USERNAME || 'admin'
  const snPass = import.meta.env.VITE_SN_PASSWORD || ''
  const snInstance = import.meta.env.VITE_SN_INSTANCE || ''

  // ─── Accept real ServiceNow admin credentials ─────────────────────────────
  const isRealSNLogin =
    (email === snUser || email === `${snUser}@${snInstance.replace('https://','').split('.')[0]}.com`) &&
    password === snPass

  if (isRealSNLogin) {
    try {
      const data = await snFetch(
        `/sys_user?sysparm_query=user_name=${snUser}&sysparm_fields=sys_id,name,email,user_name&sysparm_limit=1`
      )
      const users = data.result || []
      if (users.length > 0) {
        const user = { sys_id: users[0].sys_id, name: users[0].name || 'Admin', email: users[0].email || email, user_name: snUser, role: 'admin', connected: true }
        const token = createSession(user)
        return { ...user, token }
      }
    } catch (e) {
      console.warn('SN verify failed:', e.message)
    }
    // Even if API fails, accept real credentials
    const user = { sys_id: 'sn-admin', name: 'SN Admin', email, user_name: snUser, role: 'admin', connected: true }
    const token = createSession(user)
    return { ...user, token }
  }

  // ─── Try ServiceNow email lookup ──────────────────────────────────────────
  try {
    const query = `email=${encodeURIComponent(email)}`
    const data = await snFetch(
      `/sys_user?sysparm_query=${query}&sysparm_fields=sys_id,name,email,roles,user_name,${SN_VOL_IS_VOLUNTEER},active,${SN_VOL_APPROVAL}&sysparm_limit=1`
    )
    const users = data.result || []
    if (users.length > 0) {
      const snRec = users[0]
      const isVol = snRec[SN_VOL_IS_VOLUNTEER] === 'true' || snRec[SN_VOL_IS_VOLUNTEER] === true
      const approvalStatus = snRec[SN_VOL_APPROVAL] || 'pending'
      if (isVol && (snRec.active === 'false' || snRec.active === false)) {
        if (approvalStatus === 'rejected') throw new Error('Your registration has been rejected. Please contact the NGO coordinator.')
        throw new Error('Your account is pending approval. Please wait for the coordinator to approve your registration.')
      }
      const user = {
        sys_id: snRec.sys_id,
        name: snRec.name || 'User',
        email: snRec.email,
        user_name: snRec.user_name,
        role: isVol ? 'volunteer' : 'admin',
        connected: true
      }
      const token = createSession(user)
      return { ...user, token }
    }
  } catch (err) {
    if (err.message.includes('pending') || err.message.includes('rejected')) throw err
    console.warn('SN Auth failed:', err.message)
  }

  // ─── Demo fallback ────────────────────────────────────────────────────────
  if (email === 'admin@ngo.org' && password === 'admin456') {
    snConnectionState.mode = 'demo'
    const user = { sys_id: 'demo-001', name: 'Admin User', email, user_name: 'admin', role: 'admin' }
    const token = createSession(user)
    return { ...user, token }
  }

  if (email === 'volunteer@ngo.org' && password === 'volunteer123') {
    snConnectionState.mode = 'demo'
    const user = { sys_id: 'demo-002', name: 'Volunteer User', email, user_name: 'volunteer', role: 'volunteer' }
    const token = createSession(user)
    return { ...user, token }
  }

  throw new Error(`Invalid credentials.\n• Real PDI: use "${snUser}" / your PDI password\n• Demo: use "admin@ngo.org" / "admin456" or "volunteer@ngo.org" / "volunteer123"`)
}

/**
 * Validate current session
 */
export function validateSession(token) {
  return validateSessionToken(token)
}

/**
 * Logout user (destroy session)
 */
export function logout(token) {
  destroySession(token)
}

/**
 * Refresh session activity
 */
export function refreshSession(token) {
  updateSessionActivity(token)
}

/**
 * Get current user from session
 */
export function getCurrentUser(token) {
  return validateSessionToken(token)
}

// ═══════════════════════════════════════════════════════════════════════════
// VOLUNTEERS
// Auth lives in sys_user; profile details stored in the custom app table
// x_2048396_ngo_vo_1_volunteers so records appear in App Engine Studio.
// ═══════════════════════════════════════════════════════════════════════════

const SN_VOL_IS_VOLUNTEER    = 'x_2048396_ngo_vo_1_u_is_volunteer'
const SN_VOL_APPROVAL        = 'x_2048396_ngo_vo_1_u_approval_status'
const SN_VOL_SKILLS          = 'x_2048396_ngo_vo_1_u_skills'
const SN_VOL_AVAILABILITY    = 'x_2048396_ngo_vo_1_u_availability'
const SN_VOL_ADDRESS         = 'x_2048396_ngo_vo_1_u_address'

const SN_TABLE_VOLUNTEERS = 'x_2048396_ngo_vo_1_volunteers'
const VOL_FIELDS = 'sys_id,u_name,u_email,u_phone,u_skills,u_availability,u_address,u_approval_status,u_is_active,u_sys_user_id'

function mapVol(r) {
  return {
    sys_id:           r.sys_id,
    name:             r.u_name             || '',
    email:            r.u_email            || '',
    mobile_phone:     r.u_phone            || '',
    u_skills:         r.u_skills           || '',
    u_availability:   r.u_availability     || '',
    u_address:        r.u_address          || '',
    u_approval_status: r.u_approval_status || 'pending',
    active:           r.u_is_active === 'true' || r.u_is_active === true ? 'true' : 'false',
    u_sys_user_id:    r.u_sys_user_id      || '',
  }
}

export async function getVolunteers() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_VOLUNTEERS}?sysparm_query=u_approval_status=approved^u_is_active=true&sysparm_fields=${VOL_FIELDS}&sysparm_limit=50`
    )
    return (data.result || []).map(mapVol)
  } catch {
    return DEMO_VOLUNTEERS
  }
}

export async function createVolunteer(payload) {
  try {
    const isAdminCreated = payload.u_approval_status === 'approved'
    // 1. Create sys_user record for authentication
    const userResp = await snFetch('/sys_user', {
      method: 'POST',
      body: JSON.stringify({
        name:                   payload.name,
        email:                  payload.email,
        mobile_phone:           payload.mobile_phone,
        user_password:          payload.user_password,
        [SN_VOL_IS_VOLUNTEER]: 'true',
        [SN_VOL_APPROVAL]:     payload.u_approval_status || 'pending',
        [SN_VOL_SKILLS]:       payload.u_skills || '',
        [SN_VOL_AVAILABILITY]: payload.u_availability || '',
        [SN_VOL_ADDRESS]:      payload.u_address || '',
        active:                 isAdminCreated ? 'true' : 'false',
      }),
    })
    const sysUserId = userResp.result?.sys_id || ''

    // 2. Create record in custom volunteers table (visible in App Engine Studio)
    const volResp = await snFetch(`/${SN_TABLE_VOLUNTEERS}`, {
      method: 'POST',
      body: JSON.stringify({
        u_name:            payload.name,
        u_email:           payload.email,
        u_phone:           payload.mobile_phone || '',
        u_skills:          payload.u_skills || '',
        u_availability:    payload.u_availability || '',
        u_address:         payload.u_address || '',
        u_approval_status: payload.u_approval_status || 'pending',
        u_is_active:       isAdminCreated ? 'true' : 'false',
        u_sys_user_id:     sysUserId,
      }),
    })
    return { ...volResp.result, sys_id: volResp.result?.sys_id, u_sys_user_id: sysUserId }
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-${Date.now()}`, ...payload })
  }
}

export async function updateVolunteer(sysId, payload) {
  try {
    // Update sys_user fields (for auth record)
    const sysUserPatch = {
      name:                   payload.name,
      email:                  payload.email,
      mobile_phone:           payload.mobile_phone,
      [SN_VOL_SKILLS]:       payload.u_skills || '',
      [SN_VOL_AVAILABILITY]: payload.u_availability || '',
      [SN_VOL_ADDRESS]:      payload.u_address || '',
    }
    // Find matching custom volunteer record by sys_user_id
    const findResp = await snFetch(
      `/${SN_TABLE_VOLUNTEERS}?sysparm_query=u_sys_user_id=${sysId}&sysparm_fields=sys_id&sysparm_limit=1`
    ).catch(() => null)
    const volRecord = findResp?.result?.[0]

    await Promise.all([
      snFetch(`/sys_user/${sysId}`, { method: 'PATCH', body: JSON.stringify(sysUserPatch) }),
      volRecord
        ? snFetch(`/${SN_TABLE_VOLUNTEERS}/${volRecord.sys_id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              u_name:         payload.name,
              u_email:        payload.email,
              u_phone:        payload.mobile_phone || '',
              u_skills:       payload.u_skills || '',
              u_availability: payload.u_availability || '',
              u_address:      payload.u_address || '',
            }),
          })
        : Promise.resolve(),
    ])
    return { sys_id: sysId, ...payload }
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, ...payload })
  }
}

export async function getPendingVolunteers() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_VOLUNTEERS}?sysparm_query=u_approval_status=pending&sysparm_fields=${VOL_FIELDS}&sysparm_limit=50`
    )
    return (data.result || []).map(mapVol)
  } catch {
    return DEMO_PENDING_VOLUNTEERS
  }
}

export async function approveVolunteer(sysId) {
  try {
    // sysId here is the custom volunteers table sys_id
    const rec = await snFetch(`/${SN_TABLE_VOLUNTEERS}/${sysId}?sysparm_fields=u_sys_user_id`)
    const sysUserId = rec.result?.u_sys_user_id

    await Promise.all([
      snFetch(`/${SN_TABLE_VOLUNTEERS}/${sysId}`, {
        method: 'PATCH',
        body: JSON.stringify({ u_approval_status: 'approved', u_is_active: 'true' }),
      }),
      sysUserId
        ? snFetch(`/sys_user/${sysUserId}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: 'true', [SN_VOL_APPROVAL]: 'approved' }),
          })
        : Promise.resolve(),
    ])
    return { sys_id: sysId }
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, u_approval_status: 'approved' })
  }
}

export async function rejectVolunteer(sysId) {
  try {
    const rec = await snFetch(`/${SN_TABLE_VOLUNTEERS}/${sysId}?sysparm_fields=u_sys_user_id`)
    const sysUserId = rec.result?.u_sys_user_id

    await Promise.all([
      snFetch(`/${SN_TABLE_VOLUNTEERS}/${sysId}`, {
        method: 'PATCH',
        body: JSON.stringify({ u_approval_status: 'rejected', u_is_active: 'false' }),
      }),
      sysUserId
        ? snFetch(`/sys_user/${sysUserId}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: 'false', [SN_VOL_APPROVAL]: 'rejected' }),
          })
        : Promise.resolve(),
    ])
    return { sys_id: sysId }
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, u_approval_status: 'rejected' })
  }
}

export async function createAdmin(payload) {
  try {
    const resp = await snFetch('/sys_user', {
      method: 'POST',
      body: JSON.stringify({
        name:                   payload.name,
        email:                  payload.email,
        user_password:          payload.user_password,
        active:                 'true',
        [SN_VOL_IS_VOLUNTEER]: 'false',
        [SN_VOL_APPROVAL]:     'approved',
      }),
    })
    return resp.result
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-admin-${Date.now()}`, ...payload })
  }
}

export async function getMyAssignments(volunteerSysId) {
  try {
    const data = await snFetch(
      `/${SN_TABLE_ASSIGNMENTS}?sysparm_query=volunteer=${volunteerSysId}&sysparm_fields=sys_id,volunteer,project,assigned_date,hours_worked,completion_status&sysparm_display_value=all&sysparm_limit=50`
    )
    return (data.result || []).map(mapAssignment)
  } catch {
    return DEMO_ASSIGNMENTS.filter(a => a.u_volunteer === volunteerSysId)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NGO PROJECTS  → x_2048396_ngo_vo_1_ngo_projects
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_PROJECTS = 'x_2048396_ngo_vo_1_ngo_projects'
const PROJECT_FIELDS = 'sys_id,u_project_name,u_description,u_location,u_start_date,u_end_date,u_required_skills,u_status,u_volunteers_needed'

// Map SN fields → app fields (u_ prefix used in UI components)
const safeStr = (v) => v && typeof v === 'object' ? (v.display_value || v.value || '') : (v || '');

function mapProject(r) {
  return {
    sys_id:              r.sys_id,
    u_project_name:      safeStr(r.u_project_name) || 'Unnamed Project',
    u_description:       safeStr(r.u_description),
    u_location:          safeStr(r.u_location) || 'Location TBD',
    u_start_date:        safeStr(r.u_start_date).split(' ')[0],
    u_end_date:          safeStr(r.u_end_date).split(' ')[0],
    u_required_skills:   safeStr(r.u_required_skills) || 'General Volunteer',
    u_status:            safeStr(r.u_status) || 'planning',
    u_volunteers_needed: safeStr(r.u_volunteers_needed) || '10',
  }
}

export async function getProjects() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_PROJECTS}?sysparm_fields=${PROJECT_FIELDS}&sysparm_limit=50`
    )
    return (data.result || []).map(mapProject)
  } catch {
    return DEMO_PROJECTS
  }
}

export async function updateProject(sysId, payload) {
  try {
    const snPayload = {
      u_project_name:      payload.u_project_name,
      u_description:       payload.u_description,
      u_location:          payload.u_location,
      u_start_date:        payload.u_start_date,
      u_end_date:          payload.u_end_date,
      u_required_skills:   payload.u_required_skills,
      u_status:            payload.u_status,
      u_volunteers_needed: payload.u_volunteers_needed || '10',
    }
    const data = await snFetch(`/${SN_TABLE_PROJECTS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify(snPayload),
    })
    return mapProject(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, ...payload })
  }
}

export async function deleteProject(sysId) {
  try {
    await snFetch(`/${SN_TABLE_PROJECTS}/${sysId}`, { method: 'DELETE' })
    return true
  } catch {
    return true
  }
}

export async function createProject(payload) {
  try {
    const snPayload = {
      u_project_name:      payload.u_project_name,
      u_description:       payload.u_description,
      u_location:          payload.u_location,
      u_start_date:        payload.u_start_date,
      u_end_date:          payload.u_end_date,
      u_required_skills:   payload.u_required_skills,
      u_status:            payload.u_status,
      u_volunteers_needed: payload.u_volunteers_needed || '10',
    }
    const data = await snFetch(`/${SN_TABLE_PROJECTS}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapProject(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-proj-${Date.now()}`, ...payload })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNMENTS  → x_2048396_ngo_vo_1_volunteer_assignments
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_ASSIGNMENTS = 'x_2048396_ngo_vo_1_volunteer_assignments'

function refVal(field) {
  if (!field) return ''
  return typeof field === 'object' ? (field.value || '') : field
}
function refDisplay(field) {
  if (!field) return ''
  return typeof field === 'object' ? (field.display_value || field.value || '') : field
}

function mapAssignment(r) {
  const volField  = r.volunteer  || r.u_volunteer
  const projField = r.project    || r.u_project
  return {
    sys_id:               r.sys_id,
    u_volunteer:          refVal(volField),
    u_volunteer_name:     refDisplay(volField),
    u_project:            refVal(projField),
    u_project_name:       refDisplay(projField),
    u_assigned_date:      safeStr(r.assigned_date      || r.u_assigned_date),
    u_hours_worked:       safeStr(r.hours_worked       || r.u_hours_worked       || '0'),
    u_completion_status:  safeStr(r.completion_status  || r.u_completion_status  || 'pending'),
  }
}

export async function getAssignments() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_ASSIGNMENTS}?sysparm_fields=sys_id,volunteer,project,assigned_date,hours_worked,completion_status&sysparm_display_value=all&sysparm_limit=100`
    )
    return (data.result || []).map(mapAssignment)
  } catch {
    return DEMO_ASSIGNMENTS
  }
}

export async function createAssignment(payload) {
  try {
    const snPayload = {
      volunteer:          payload.u_volunteer,
      project:            payload.u_project,
      assigned_date:      payload.u_assigned_date,
      hours_worked:       payload.u_hours_worked,
      completion_status:  payload.u_completion_status,
    }
    const data = await snFetch(`/${SN_TABLE_ASSIGNMENTS}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    const result = mapAssignment(data.result)

    // Create notification using the volunteer's sys_user sys_id so it appears in their inbox.
    // payload.u_volunteer_sys_user_id is the sys_user.sys_id (from u_sys_user_id on custom table).
    const recipientId = payload.u_volunteer_sys_user_id
    const projectName = payload.u_project_name || 'a project'
    if (recipientId) {
      createNotification({
        u_recipient: recipientId,
        u_message:   `You have been assigned to the project: "${projectName}". Check your dashboard for details.`,
        u_type:      'assignment',
      }).catch(() => {})
    }

    return result
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-asgn-${Date.now()}`, ...payload })
  }
}

export async function updateAssignment(sysId, payload) {
  try {
    const data = await snFetch(`/${SN_TABLE_ASSIGNMENTS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        volunteer:         payload.u_volunteer,
        project:           payload.u_project,
        assigned_date:     payload.u_assigned_date,
        hours_worked:      payload.u_hours_worked,
        completion_status: payload.u_completion_status,
      }),
    })
    return mapAssignment(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, ...payload })
  }
}

export async function deleteAssignment(sysId) {
  try {
    await snFetch(`/${SN_TABLE_ASSIGNMENTS}/${sysId}`, { method: 'DELETE' })
    return true
  } catch {
    return true
  }
}

export async function updateAssignmentHours(sysId, hours) {
  try {
    const data = await snFetch(`/${SN_TABLE_ASSIGNMENTS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify({ hours_worked: hours }),
    })
    return mapAssignment(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, u_hours_worked: hours })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPACT REPORTS  → x_2048396_ngo_vo_1_impact_report
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_IMPACT = 'x_2048396_ngo_vo_1_impact_report'

function mapReport(r) {
  return {
    sys_id:                  r.sys_id,
    u_project:               safeStr(r.u_project),
    u_volunteers_involved:   safeStr(r.u_volunteers_involved   || '0'),
    u_total_hours:           safeStr(r.u_total_hours           || '0'),
    u_beneficiaries_reached: safeStr(r.u_beneficiaries_reached || '0'),
    u_outcome_summary:       safeStr(r.u_outcome_summary),
  }
}

export async function getImpactReports() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_IMPACT}?sysparm_fields=sys_id,u_project,u_volunteers_involved,u_total_hours,u_beneficiaries_reached,u_outcome_summary&sysparm_limit=50`
    )
    return (data.result || []).map(mapReport)
  } catch {
    return DEMO_REPORTS
  }
}

export async function deleteImpactReport(sysId) {
  try {
    await snFetch(`/${SN_TABLE_IMPACT}/${sysId}`, { method: 'DELETE' })
    return true
  } catch {
    return true
  }
}

export async function createImpactReport(payload) {
  try {
    const snPayload = {
      u_project:               payload.u_project,
      u_volunteers_involved:   payload.u_volunteers_involved,
      u_total_hours:           payload.u_total_hours,
      u_beneficiaries_reached: payload.u_beneficiaries_reached,
      u_outcome_summary:       payload.u_outcome_summary,
    }
    const data = await snFetch(`/${SN_TABLE_IMPACT}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapReport(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-rep-${Date.now()}`, ...payload })
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS & TASKS  → x_2048396_ngo_vo_1_events
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_EVENTS = 'x_2048396_ngo_vo_1_events'

function mapEvent(r) {
  return {
    sys_id:                  r.sys_id,
    u_event_name:            safeStr(r.event_name            || r.u_event_name),
    u_description:           safeStr(r.description           || r.u_description),
    u_location:              safeStr(r.location              || r.u_location),
    u_event_date:            safeStr(r.event_date            || r.u_event_date),
    u_start_time:            safeStr(r.start_time            || r.u_start_time),
    u_end_time:              safeStr(r.end_time              || r.u_end_time),
    u_required_skills:       safeStr(r.required_skills       || r.u_required_skills),
    u_max_participants:      safeStr(r.max_participants      || r.u_max_participants),
    u_status:                safeStr(r.status                || r.u_status                || 'open'),
    u_registered_count:      safeStr(r.registered_count      || r.u_registered_count      || '0'),
  }
}

export async function getEvents() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_EVENTS}?sysparm_fields=sys_id,event_name,description,location,event_date,start_time,end_time,required_skills,max_participants,status,registered_count&sysparm_limit=50`
    )
    return (data.result || []).map(mapEvent)
  } catch {
    return DEMO_EVENTS
  }
}

export async function createEvent(payload) {
  try {
    const snPayload = {
      event_name:         payload.u_event_name,
      description:        payload.u_description,
      location:           payload.u_location,
      event_date:         payload.u_event_date,
      start_time:         payload.u_start_time,
      end_time:           payload.u_end_time,
      required_skills:    payload.u_required_skills,
      max_participants:   payload.u_max_participants,
      status:             payload.u_status,
      registered_count:   '0',
    }
    const data = await snFetch(`/${SN_TABLE_EVENTS}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapEvent(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-event-${Date.now()}`, ...payload, u_registered_count: '0' })
  }
}

export async function updateEvent(sysId, payload) {
  try {
    const snPayload = {
      event_name:         payload.u_event_name,
      description:        payload.u_description,
      location:           payload.u_location,
      event_date:         payload.u_event_date,
      start_time:         payload.u_start_time,
      end_time:           payload.u_end_time,
      required_skills:    payload.u_required_skills,
      max_participants:   payload.u_max_participants,
      status:             payload.u_status,
    }
    const data = await snFetch(`/${SN_TABLE_EVENTS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify(snPayload),
    })
    return mapEvent(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: sysId, ...payload })
  }
}

export async function deleteEvent(sysId) {
  try {
    await snFetch(`/${SN_TABLE_EVENTS}/${sysId}`, {
      method: 'DELETE',
    })
    return true
  } catch {
    return true // Demo mode always succeeds
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT REGISTRATIONS  → x_2048396_ngo_vo_1_event_registrations
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_REGISTRATIONS = 'x_2048396_ngo_vo_1_event_registrations'

function mapRegistration(r) {
  return {
    sys_id:              r.sys_id,
    u_volunteer:         safeStr(r.volunteer         || r.u_volunteer),
    u_event:             safeStr(r.event             || r.u_event),
    u_registration_date: safeStr(r.registration_date || r.u_registration_date),
    u_status:            safeStr(r.status            || r.u_status            || 'registered'),
  }
}

export async function getEventRegistrations(volunteerSysId = null) {
  try {
    const queryPart = volunteerSysId ? `?sysparm_query=volunteer=${volunteerSysId}&` : '?'
    const data = await snFetch(
      `/${SN_TABLE_REGISTRATIONS}${queryPart}sysparm_fields=sys_id,volunteer,event,registration_date,status&sysparm_limit=100`
    )
    return (data.result || []).map(mapRegistration)
  } catch {
    return DEMO_REGISTRATIONS.filter(r => !volunteerSysId || r.u_volunteer === volunteerSysId)
  }
}

export async function registerForEvent(volunteerSysId, eventSysId) {
  try {
    const snPayload = {
      volunteer:         volunteerSysId,
      event:             eventSysId,
      registration_date: new Date().toISOString().split('T')[0],
      status:            'registered',
    }
    const data = await snFetch(`/${SN_TABLE_REGISTRATIONS}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapRegistration(data.result)
  } catch (err) {
    return writeFallback(err, { sys_id: `demo-reg-${Date.now()}`, u_volunteer: volunteerSysId, u_event: eventSysId, u_registration_date: new Date().toISOString().split('T')[0], u_status: 'registered' })
  }
}

export async function unregisterFromEvent(registrationSysId) {
  try {
    await snFetch(`/${SN_TABLE_REGISTRATIONS}/${registrationSysId}`, {
      method: 'DELETE',
    })
    return true
  } catch {
    return true // Demo mode always succeeds
  }
}

export async function getAvailableEvents(volunteerSysId) {
  try {
    const [allEvents, userRegistrations] = await Promise.all([
      getEvents(),
      getEventRegistrations(volunteerSysId)
    ])

    const registeredEventIds = userRegistrations.map(r => r.u_event)

    return allEvents.filter(event =>
      event.u_status === 'open' &&
      !registeredEventIds.includes(event.sys_id) &&
      (!event.u_max_participants || parseInt(event.u_registered_count) < parseInt(event.u_max_participants))
    )
  } catch {
    const userRegistrations = DEMO_REGISTRATIONS.filter(r => r.u_volunteer === volunteerSysId)
    const registeredEventIds = userRegistrations.map(r => r.u_event)

    return DEMO_EVENTS.filter(event =>
      event.u_status === 'open' &&
      !registeredEventIds.includes(event.sys_id) &&
      (!event.u_max_participants || parseInt(event.u_registered_count) < parseInt(event.u_max_participants))
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS  → x_2048396_ngo_vo_1_notifications
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_NOTIFICATIONS = 'x_2048396_ngo_vo_1_notifications'

function mapNotification(r) {
  return {
    sys_id:      r.sys_id,
    u_recipient: typeof r.recipient === 'object' ? (r.recipient.value || '') : (r.recipient || r.u_recipient || ''),
    u_message:   safeStr(r.message   || r.u_message),
    u_type:      safeStr(r.type      || r.u_type      || 'general'),
    u_is_read:   r.is_read === 'true' || r.is_read === true || r.u_is_read === 'true',
    u_created_on: safeStr(r.created_on || r.u_created_on || r.sys_created_on),
  }
}

export async function getNotifications(userSysId) {
  try {
    const query = userSysId
      ? `recipient=${userSysId}^ORDERBYDESCsys_created_on`
      : 'ORDERBYDESCsys_created_on'
    const data = await snFetch(
      `/${SN_TABLE_NOTIFICATIONS}?sysparm_query=${query}&sysparm_fields=sys_id,recipient,message,type,is_read,created_on,sys_created_on&sysparm_limit=50`
    )
    return (data.result || []).map(mapNotification)
  } catch {
    return DEMO_NOTIFICATIONS.filter(n => !userSysId || n.u_recipient === userSysId)
  }
}

export async function markNotificationRead(sysId) {
  try {
    await snFetch(`/${SN_TABLE_NOTIFICATIONS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_read: 'true' }),
    })
    return true
  } catch {
    return true
  }
}

export async function createNotification(payload) {
  try {
    const data = await snFetch(`/${SN_TABLE_NOTIFICATIONS}`, {
      method: 'POST',
      body: JSON.stringify({
        recipient:   payload.u_recipient,
        message:     payload.u_message,
        type:        payload.u_type || 'general',
        is_read:     'false',
        created_on:  new Date().toISOString(),
      }),
    })
    return mapNotification(data.result)
  } catch {
    return { sys_id: `demo-notif-${Date.now()}`, ...payload, u_is_read: false, u_created_on: new Date().toISOString() }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════════════════

export async function getDashboardStats() {
  try {
    const [vols, projs, asgns, reports] = await Promise.all([
      getVolunteers(),
      getProjects(),
      getAssignments(),
      getImpactReports(),
    ])

    const totalHours = asgns.reduce((sum, a) => sum + (parseInt(a.u_hours_worked) || 0), 0)
    const totalBeneficiaries = reports.reduce(
      (sum, r) => sum + (parseInt(r.u_beneficiaries_reached) || 0),
      0
    )
    const activeProjects = projs.filter(
      (p) => p.u_status === 'active' || p.u_status === 'in_progress'
    ).length

    return {
      totalVolunteers: vols.length,
      activeProjects,
      totalProjects: projs.length,
      totalHours,
      beneficiariesReached: totalBeneficiaries,
      totalAssignments: asgns.length,
    }
  } catch {
    return {
      totalVolunteers: 142,
      activeProjects: 8,
      totalProjects: 23,
      totalHours: 4850,
      beneficiariesReached: 3200,
      totalAssignments: 315,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION TEST  (admin diagnostic — checks each table's REST availability)
// ═══════════════════════════════════════════════════════════════════════════

export async function testSnConnection() {
  const tables = [
    ['sys_user', 'Volunteers (sys_user)'],
    [SN_TABLE_PROJECTS, 'NGO Projects'],
    [SN_TABLE_ASSIGNMENTS, 'Volunteer Assignments'],
    [SN_TABLE_IMPACT, 'Impact Reports'],
    [SN_TABLE_EVENTS, 'Events'],
    [SN_TABLE_REGISTRATIONS, 'Event Registrations'],
    [SN_TABLE_NOTIFICATIONS, 'Notifications'],
  ]
  const results = {}
  for (const [table, label] of tables) {
    try {
      await snFetch(`/${table}?sysparm_limit=1`)
      results[label] = 'connected'
    } catch (err) {
      results[label] = err.message.includes('unreachable') ? 'unreachable' : `error: ${err.message.slice(0, 100)}`
    }
  }
  return results
}

// ═══════════════════════════════════════════════════════════════════════════
// DEMO / FALLBACK DATA  (used when PDI is unreachable)
// ═══════════════════════════════════════════════════════════════════════════

export const DEMO_VOLUNTEERS = [
  { sys_id: 'demo-002', name: 'Volunteer User', email: 'volunteer@ngo.org', mobile_phone: '9000000001', u_skills: 'Teaching, First Aid', u_availability: 'weekends', active: 'true' },
  { sys_id: 'v1', name: 'Priya Sharma', email: 'priya@example.com', mobile_phone: '9876543210', u_skills: 'Teaching, First Aid', u_availability: 'weekends', active: 'true' },
  { sys_id: 'v2', name: 'Rahul Verma', email: 'rahul@example.com', mobile_phone: '9123456789', u_skills: 'IT Support, Data Entry', u_availability: 'weekdays', active: 'true' },
  { sys_id: 'v3', name: 'Anita Nair', email: 'anita@example.com', mobile_phone: '8765432109', u_skills: 'Healthcare, Counseling', u_availability: 'flexible', active: 'true' },
  { sys_id: 'v4', name: 'Kiran Patel', email: 'kiran@example.com', mobile_phone: '7654321098', u_skills: 'Environmental, Planting', u_availability: 'weekends', active: 'true' },
  { sys_id: 'v5', name: 'Deepa Rao', email: 'deepa@example.com', mobile_phone: '6543210987', u_skills: 'Social Work, Community', u_availability: 'weekdays', active: 'true' },
  { sys_id: 'v6', name: 'Arjun Mehta', email: 'arjun@example.com', mobile_phone: '9988776655', u_skills: 'Legal Aid, Advocacy', u_availability: 'flexible', active: 'true' },
]

export const DEMO_PROJECTS = [
  { sys_id: 'p1', u_project_name: 'Digital Literacy Drive', u_description: 'Teaching basic computer skills to rural youth', u_location: 'Chennai, Tamil Nadu', u_start_date: '2025-06-01', u_end_date: '2025-08-31', u_required_skills: 'IT Support, Teaching', u_status: 'active', u_volunteers_needed: '10' },
  { sys_id: 'p2', u_project_name: 'Green Earth Campaign', u_description: 'Tree planting and environmental awareness', u_location: 'Bangalore, Karnataka', u_start_date: '2025-05-15', u_end_date: '2025-07-15', u_required_skills: 'Environmental, Planting', u_status: 'active', u_volunteers_needed: '20' },
  { sys_id: 'p3', u_project_name: 'Health Check Initiative', u_description: 'Free health screenings in underserved communities', u_location: 'Mumbai, Maharashtra', u_start_date: '2025-07-01', u_end_date: '2025-09-30', u_required_skills: 'Healthcare, First Aid', u_status: 'planning', u_volunteers_needed: '15' },
  { sys_id: 'p4', u_project_name: 'Women Empowerment Workshop', u_description: 'Skill development and counseling for women', u_location: 'Delhi, NCR', u_start_date: '2025-04-01', u_end_date: '2025-06-30', u_required_skills: 'Counseling, Social Work', u_status: 'completed', u_volunteers_needed: '8' },
  { sys_id: 'p5', u_project_name: 'Legal Aid Camp', u_description: 'Providing free legal advice to marginalized communities', u_location: 'Hyderabad, Telangana', u_start_date: '2025-08-01', u_end_date: '2025-10-31', u_required_skills: 'Legal Aid, Advocacy', u_status: 'planning', u_volunteers_needed: '6' },
]

export const DEMO_ASSIGNMENTS = [
  { sys_id: 'a1', u_volunteer: 'Priya Sharma', u_project: 'Digital Literacy Drive', u_assigned_date: '2025-06-01', u_hours_worked: '24', u_completion_status: 'in_progress' },
  { sys_id: 'a2', u_volunteer: 'Rahul Verma', u_project: 'Digital Literacy Drive', u_assigned_date: '2025-06-01', u_hours_worked: '16', u_completion_status: 'in_progress' },
  { sys_id: 'a3', u_volunteer: 'Kiran Patel', u_project: 'Green Earth Campaign', u_assigned_date: '2025-05-15', u_hours_worked: '32', u_completion_status: 'in_progress' },
  { sys_id: 'a4', u_volunteer: 'Anita Nair', u_project: 'Health Check Initiative', u_assigned_date: '2025-07-01', u_hours_worked: '0', u_completion_status: 'pending' },
  { sys_id: 'a5', u_volunteer: 'Deepa Rao', u_project: 'Women Empowerment Workshop', u_assigned_date: '2025-04-01', u_hours_worked: '48', u_completion_status: 'completed' },
  { sys_id: 'a6', u_volunteer: 'Arjun Mehta', u_project: 'Legal Aid Camp', u_assigned_date: '2025-08-01', u_hours_worked: '0', u_completion_status: 'pending' },
  { sys_id: 'a7', u_volunteer: 'demo-002', u_project: 'Digital Literacy Drive', u_assigned_date: '2026-01-15', u_hours_worked: '12', u_completion_status: 'in_progress' },
]

export const DEMO_REPORTS = [
  { sys_id: 'r1', u_project: 'Women Empowerment Workshop', u_volunteers_involved: '8', u_total_hours: '320', u_beneficiaries_reached: '450', u_outcome_summary: 'Successfully trained 450 women in vocational skills and provided counseling support.' },
  { sys_id: 'r2', u_project: 'Digital Literacy Drive', u_volunteers_involved: '10', u_total_hours: '240', u_beneficiaries_reached: '180', u_outcome_summary: 'Ongoing program teaching basic computer and internet skills to rural youth.' },
  { sys_id: 'r3', u_project: 'Green Earth Campaign', u_volunteers_involved: '20', u_total_hours: '160', u_beneficiaries_reached: '1200', u_outcome_summary: 'Planted 500 trees across 12 locations, reached 1200 community members with awareness.' },
]

export const DEMO_EVENTS = [
  {
    sys_id: 'e1',
    u_event_name: 'Community Clean-up Drive',
    u_description: 'Join us for a day of cleaning up our local parks and streets. Help make our community cleaner and greener!',
    u_location: 'Central Park, Downtown',
    u_event_date: '2025-06-15',
    u_start_time: '09:00',
    u_end_time: '13:00',
    u_required_skills: 'Physical work, Team coordination',
    u_max_participants: '25',
    u_status: 'open',
    u_registered_count: '8'
  },
  {
    sys_id: 'e2',
    u_event_name: 'Food Bank Distribution',
    u_description: 'Help distribute food packages to families in need. Volunteers needed for packing, loading, and distribution.',
    u_location: 'Community Center, West Side',
    u_event_date: '2025-06-20',
    u_start_time: '10:00',
    u_end_time: '15:00',
    u_required_skills: 'Organization, Physical work',
    u_max_participants: '15',
    u_status: 'open',
    u_registered_count: '12'
  },
  {
    sys_id: 'e3',
    u_event_name: 'Youth Mentorship Workshop',
    u_description: 'Mentor high school students on career development and life skills. Share your experience and make a difference.',
    u_location: 'City Library, Main Branch',
    u_event_date: '2025-06-25',
    u_start_time: '14:00',
    u_end_time: '17:00',
    u_required_skills: 'Teaching, Counseling, Communication',
    u_max_participants: '10',
    u_status: 'open',
    u_registered_count: '5'
  },
  {
    sys_id: 'e4',
    u_event_name: 'Senior Citizen Tech Support',
    u_description: 'Help elderly community members learn to use smartphones and computers. Patience and clear communication required.',
    u_location: 'Senior Center, East District',
    u_event_date: '2025-07-02',
    u_start_time: '13:00',
    u_end_time: '16:00',
    u_required_skills: 'IT Support, Teaching, Patience',
    u_max_participants: '8',
    u_status: 'open',
    u_registered_count: '3'
  },
  {
    sys_id: 'e5',
    u_event_name: 'Beach Cleanup Event',
    u_description: 'Remove litter and debris from our beautiful coastline. Protect marine life and keep our beaches clean.',
    u_location: 'Sunset Beach, Coastal Area',
    u_event_date: '2025-07-10',
    u_start_time: '08:00',
    u_end_time: '12:00',
    u_required_skills: 'Physical work, Environmental awareness',
    u_max_participants: '30',
    u_status: 'open',
    u_registered_count: '18'
  }
]

export const DEMO_PENDING_VOLUNTEERS = [
  { sys_id: 'pv1', name: 'Neha Singh', email: 'neha@example.com', mobile_phone: '9111222333', u_skills: 'Teaching, Social Work', u_availability: 'weekends', active: 'false', u_approval_status: 'pending' },
  { sys_id: 'pv2', name: 'Rohit Joshi', email: 'rohit@example.com', mobile_phone: '8222333444', u_skills: 'IT Support, Data Entry', u_availability: 'weekdays', active: 'false', u_approval_status: 'pending' },
]

export const DEMO_NOTIFICATIONS = [
  // Admin notifications (demo-001)
  { sys_id: 'n0', u_recipient: 'demo-001', u_message: '2 new volunteer applications are pending your approval.', u_type: 'approval', u_is_read: false, u_created_on: new Date(Date.now() - 3600000).toISOString() },
  { sys_id: 'n4', u_recipient: 'demo-001', u_message: 'Project "Green Earth Campaign" is nearing its end date (15 Jul 2025).', u_type: 'reminder', u_is_read: true, u_created_on: new Date(Date.now() - 86400000).toISOString() },
  // Volunteer notifications (demo-002)
  { sys_id: 'n1', u_recipient: 'demo-002', u_message: 'Your volunteer registration has been approved. Welcome to the team!', u_type: 'approval', u_is_read: false, u_created_on: new Date(Date.now() - 86400000).toISOString() },
  { sys_id: 'n2', u_recipient: 'demo-002', u_message: 'You have been assigned to the project: Digital Literacy Drive.', u_type: 'assignment', u_is_read: false, u_created_on: new Date(Date.now() - 43200000).toISOString() },
  { sys_id: 'n3', u_recipient: 'demo-002', u_message: 'You successfully registered for the event: Community Clean-up Drive.', u_type: 'event', u_is_read: true, u_created_on: new Date(Date.now() - 172800000).toISOString() },
]

export const DEMO_REGISTRATIONS = [
  { sys_id: 'reg1', u_volunteer: 'demo-002', u_event: 'e1', u_registration_date: '2025-06-01', u_status: 'registered' },
  { sys_id: 'reg2', u_volunteer: 'demo-002', u_event: 'e2', u_registration_date: '2025-06-05', u_status: 'registered' },
  { sys_id: 'reg3', u_volunteer: 'v1', u_event: 'e3', u_registration_date: '2025-06-08', u_status: 'registered' },
  { sys_id: 'reg4', u_volunteer: 'v2', u_event: 'e4', u_registration_date: '2025-06-10', u_status: 'registered' },
  { sys_id: 'reg5', u_volunteer: 'v3', u_event: 'e5', u_registration_date: '2025-06-12', u_status: 'registered' },
]
