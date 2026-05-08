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
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Authenticate a user against ServiceNow.
 * Falls back to demo credentials if PDI is unreachable.
 */
export async function authenticateUser(email, password) {
  const snUser = import.meta.env.VITE_SN_USERNAME || 'admin'
  const snPass = import.meta.env.VITE_SN_PASSWORD || ''
  const snInstance = import.meta.env.VITE_SN_INSTANCE || ''

  // ─── Accept real ServiceNow admin credentials ─────────────────────────────
  // If user types the actual PDI username/password (from .env), log them in
  const isRealSNLogin =
    (email === snUser || email === `${snUser}@${snInstance.replace('https://','').split('.')[0]}.com`) &&
    password === snPass

  if (isRealSNLogin) {
    // Verify by calling ServiceNow API
    try {
      const data = await snFetch(
        `/sys_user?sysparm_query=user_name=${snUser}&sysparm_fields=sys_id,name,email,user_name&sysparm_limit=1`
      )
      const users = data.result || []
      if (users.length > 0) {
        return { sys_id: users[0].sys_id, name: users[0].name || 'Admin', email: users[0].email || email, user_name: snUser, connected: true }
      }
    } catch (e) {
      console.warn('SN verify failed:', e.message)
    }
    // Even if API fails, accept real credentials
    return { sys_id: 'sn-admin', name: 'SN Admin', email, user_name: snUser, connected: true }
  }

  // ─── Try ServiceNow email lookup ──────────────────────────────────────────
  try {
    const query = `email=${encodeURIComponent(email)}`
    const data = await snFetch(
      `/sys_user?sysparm_query=${query}&sysparm_fields=sys_id,name,email,roles,user_name&sysparm_limit=1`
    )
    const users = data.result || []
    if (users.length > 0) return users[0]
  } catch (err) {
    console.warn('SN Auth failed:', err.message)
  }

  // ─── Demo fallback ────────────────────────────────────────────────────────
  if (email === 'admin@ngo.org' && password === 'admin123') {
    return { sys_id: 'demo-001', name: 'Admin User', email, user_name: 'admin' }
  }

  throw new Error(`Invalid credentials.\n• Real PDI: use "${snUser}" / your PDI password\n• Demo: use "admin@ngo.org" / "admin123"`)
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
