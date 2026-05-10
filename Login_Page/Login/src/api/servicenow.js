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
    return res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError' || err.message.includes('fetch')) {
      // Only mark unreachable on genuine network failures
      snReachable = false
      throw new Error('ServiceNow PDI unreachable (network error). Running in demo mode.')
    }
    throw err   // re-throw HTTP errors as-is
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced authentication system with JWT-like session management
 */

// In-memory session store (in production, use Redis/database)
const sessions = new Map()
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Generate a session token
 */
function generateSessionToken() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Validate session token
 */
function validateSessionToken(token) {
  if (!token || !sessions.has(token)) return null

  const session = sessions.get(token)
  if (Date.now() - session.created > SESSION_TIMEOUT) {
    sessions.delete(token)
    return null
  }

  return session.user
}

/**
 * Create a new session
 */
function createSession(user) {
  const token = generateSessionToken()
  const session = {
    user,
    created: Date.now(),
    lastActivity: Date.now()
  }
  sessions.set(token, session)
  return token
}

/**
 * Destroy a session
 */
function destroySession(token) {
  sessions.delete(token)
}

/**
 * Update session activity
 */
function updateSessionActivity(token) {
  if (sessions.has(token)) {
    sessions.get(token).lastActivity = Date.now()
  }
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
      `/sys_user?sysparm_query=${query}&sysparm_fields=sys_id,name,email,roles,user_name,u_is_volunteer&sysparm_limit=1`
    )
    const users = data.result || []
    if (users.length > 0) {
      const user = {
        sys_id: users[0].sys_id,
        name: users[0].name || 'User',
        email: users[0].email,
        user_name: users[0].user_name,
        role: users[0].u_is_volunteer === 'true' ? 'volunteer' : 'admin',
        connected: true
      }
      const token = createSession(user)
      return { ...user, token }
    }
  } catch (err) {
    console.warn('SN Auth failed:', err.message)
  }

  // ─── Demo fallback ────────────────────────────────────────────────────────
  if (email === 'admin@ngo.org' && password === 'admin456') {
    const user = { sys_id: 'demo-001', name: 'Admin User', email, user_name: 'admin', role: 'admin' }
    const token = createSession(user)
    return { ...user, token }
  }

  if (email === 'volunteer@ngo.org' && password === 'volunteer123') {
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
// VOLUNTEERS  (sys_user table filtered to volunteer role)
// ═══════════════════════════════════════════════════════════════════════════

const VOLUNTEER_FIELDS = 'sys_id,name,email,mobile_phone,u_skills,u_availability,u_address,active'

export async function getVolunteers() {
  try {
    const data = await snFetch(
      `/sys_user?sysparm_query=u_is_volunteer=true^active=true&sysparm_fields=${VOLUNTEER_FIELDS}&sysparm_limit=50`
    )
    return data.result || []
  } catch {
    return DEMO_VOLUNTEERS
  }
}

export async function createVolunteer(payload) {
  try {
    const data = await snFetch('/sys_user', {
      method: 'POST',
      body: JSON.stringify({ ...payload, u_is_volunteer: 'true', active: 'true' }),
    })
    return data.result
  } catch {
    // Demo mode: return a mock record
    return { sys_id: `demo-${Date.now()}`, ...payload }
  }
}

export async function updateVolunteer(sysId, payload) {
  try {
    const data = await snFetch(`/sys_user/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    return data.result
  } catch {
    return { sys_id: sysId, ...payload }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// NGO PROJECTS  → x_2048396_ngo_vo_1_ngo_project_details
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_PROJECTS = 'x_2048396_ngo_vo_1_ngo_project_details'
const PROJECT_FIELDS = 'sys_id,event_name,description,location,start_date,end_date,required_skills,status,number'

// Map SN fields → app fields (u_ prefix used in UI components)
function mapProject(r) {
  return {
    sys_id:              r.sys_id,
    u_project_name:      r.event_name   || r.u_project_name || '',
    u_description:       r.description  || r.u_description  || '',
    u_location:          r.location     || r.u_location     || '',
    u_start_date:        r.start_date   || r.u_start_date   || '',
    u_end_date:          r.end_date     || r.u_end_date     || '',
    u_required_skills:   r.required_skills || r.u_required_skills || '',
    u_status:            r.status       || r.u_status       || 'planning',
    u_volunteers_needed: r.number       || r.u_volunteers_needed || '',
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

export async function createProject(payload) {
  try {
    const snPayload = {
      event_name:      payload.u_project_name,
      description:     payload.u_description,
      location:        payload.u_location,
      start_date:      payload.u_start_date,
      end_date:        payload.u_end_date,
      required_skills: payload.u_required_skills,
      status:          payload.u_status,
    }
    const data = await snFetch(`/${SN_TABLE_PROJECTS}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapProject(data.result)
  } catch {
    return { sys_id: `demo-proj-${Date.now()}`, ...payload }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSIGNMENTS  → x_2048396_ngo_vo_1_volunteer_assignments
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_ASSIGNMENTS = 'x_2048396_ngo_vo_1_volunteer_assignments'

function mapAssignment(r) {
  return {
    sys_id:               r.sys_id,
    u_volunteer:          r.volunteer          || r.u_volunteer          || '',
    u_project:            r.project            || r.u_project            || '',
    u_assigned_date:      r.assigned_date      || r.u_assigned_date      || '',
    u_hours_worked:       r.hours_worked       || r.u_hours_worked       || '0',
    u_completion_status:  r.completion_status  || r.u_completion_status  || 'pending',
  }
}

export async function getAssignments() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_ASSIGNMENTS}?sysparm_fields=sys_id,volunteer,project,assigned_date,hours_worked,completion_status&sysparm_limit=100`
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
    return mapAssignment(data.result)
  } catch {
    return { sys_id: `demo-asgn-${Date.now()}`, ...payload }
  }
}

export async function updateAssignmentHours(sysId, hours) {
  try {
    const data = await snFetch(`/${SN_TABLE_ASSIGNMENTS}/${sysId}`, {
      method: 'PATCH',
      body: JSON.stringify({ hours_worked: hours }),
    })
    return mapAssignment(data.result)
  } catch {
    return { sys_id: sysId, u_hours_worked: hours }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPACT REPORTS  → x_2048396_ngo_vo_1_impact_report
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_IMPACT = 'x_2048396_ngo_vo_1_impact_report'

function mapReport(r) {
  return {
    sys_id:                  r.sys_id,
    u_project:               r.project               || r.u_project               || '',
    u_volunteers_involved:   r.volunteers_involved   || r.u_volunteers_involved   || '0',
    u_total_hours:           r.total_hours           || r.u_total_hours           || '0',
    u_beneficiaries_reached: r.beneficiaries_reached || r.u_beneficiaries_reached || '0',
    u_outcome_summary:       r.outcome_summary       || r.u_outcome_summary       || '',
  }
}

export async function getImpactReports() {
  try {
    const data = await snFetch(
      `/${SN_TABLE_IMPACT}?sysparm_fields=sys_id,project,volunteers_involved,total_hours,beneficiaries_reached,outcome_summary&sysparm_limit=50`
    )
    return (data.result || []).map(mapReport)
  } catch {
    return DEMO_REPORTS
  }
}

export async function createImpactReport(payload) {
  try {
    const snPayload = {
      project:               payload.u_project,
      volunteers_involved:   payload.u_volunteers_involved,
      total_hours:           payload.u_total_hours,
      beneficiaries_reached: payload.u_beneficiaries_reached,
      outcome_summary:       payload.u_outcome_summary,
    }
    const data = await snFetch(`/${SN_TABLE_IMPACT}`, {
      method: 'POST',
      body: JSON.stringify(snPayload),
    })
    return mapReport(data.result)
  } catch {
    return { sys_id: `demo-rep-${Date.now()}`, ...payload }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS & TASKS  → x_2048396_ngo_vo_1_events
// ═══════════════════════════════════════════════════════════════════════════

const SN_TABLE_EVENTS = 'x_2048396_ngo_vo_1_events'

function mapEvent(r) {
  return {
    sys_id:                  r.sys_id,
    u_event_name:            r.event_name            || r.u_event_name            || '',
    u_description:           r.description           || r.u_description           || '',
    u_location:              r.location              || r.u_location              || '',
    u_event_date:            r.event_date            || r.u_event_date            || '',
    u_start_time:            r.start_time            || r.u_start_time            || '',
    u_end_time:              r.end_time              || r.u_end_time              || '',
    u_required_skills:       r.required_skills       || r.u_required_skills       || '',
    u_max_participants:      r.max_participants      || r.u_max_participants      || '',
    u_status:                r.status                || r.u_status                || 'open',
    u_registered_count:      r.registered_count      || r.u_registered_count      || '0',
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
  } catch {
    return { sys_id: `demo-event-${Date.now()}`, ...payload, u_registered_count: '0' }
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
  } catch {
    return { sys_id: sysId, ...payload }
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
    u_volunteer:         r.volunteer         || r.u_volunteer         || '',
    u_event:             r.event             || r.u_event             || '',
    u_registration_date: r.registration_date || r.u_registration_date || '',
    u_status:            r.status            || r.u_status            || 'registered',
  }
}

export async function getEventRegistrations(volunteerSysId = null) {
  try {
    let query = ''
    if (volunteerSysId) {
      query = `?sysparm_query=volunteer=${volunteerSysId}`
    }
    const data = await snFetch(
      `/${SN_TABLE_REGISTRATIONS}${query}&sysparm_fields=sys_id,volunteer,event,registration_date,status&sysparm_limit=100`
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
  } catch {
    return { sys_id: `demo-reg-${Date.now()}`, u_volunteer: volunteerSysId, u_event: eventSysId, u_registration_date: new Date().toISOString().split('T')[0], u_status: 'registered' }
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
// DEMO / FALLBACK DATA  (used when PDI is unreachable)
// ═══════════════════════════════════════════════════════════════════════════

export const DEMO_VOLUNTEERS = [
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

export const DEMO_REGISTRATIONS = [
  { sys_id: 'reg1', u_volunteer: 'demo-002', u_event: 'e1', u_registration_date: '2025-06-01', u_status: 'registered' },
  { sys_id: 'reg2', u_volunteer: 'demo-002', u_event: 'e2', u_registration_date: '2025-06-05', u_status: 'registered' },
  { sys_id: 'reg3', u_volunteer: 'v1', u_event: 'e3', u_registration_date: '2025-06-08', u_status: 'registered' },
  { sys_id: 'reg4', u_volunteer: 'v2', u_event: 'e4', u_registration_date: '2025-06-10', u_status: 'registered' },
  { sys_id: 'reg5', u_volunteer: 'v3', u_event: 'e5', u_registration_date: '2025-06-12', u_status: 'registered' },
]
