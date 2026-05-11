import { useState, useEffect } from 'react'
import logoImg from './assets/image.png'
import { authenticateUser, createVolunteer, getNotifications } from './api/servicenow'
import Sidebar from './components/Sidebar'
import SNStatusBanner from './components/SNStatusBanner'
import Dashboard from './pages/Dashboard'
import VolunteerDashboard from './pages/VolunteerDashboard'
import VolunteersPage from './pages/VolunteersPage'
import ProjectsPage from './pages/ProjectsPage'
import AssignmentsPage from './pages/AssignmentsPage'
import EventsPage from './pages/EventsPage'
import ReportsPage from './pages/ReportsPage'
import NotificationsPage from './pages/NotificationsPage'
import './App.css'

/* ═══════════════════════════════════════════════════════════════════════════
   SVG Icons
   ═══════════════════════════════════════════════════════════════════════════ */
const IconMail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <polyline points="2,4 12,13 22,4"/>
  </svg>
)
const IconLock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
)
const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
const validateEmail    = v => v.trim().length >= 3   // accept username OR email
const validatePassword = v => v.length >= 6

/* ═══════════════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
function LoginPage({ onLogin }) {
  const [authView, setAuthView] = useState('login') // 'login', 'signup', 'forgot'
  
  // Form state
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [phone,    setPhone]    = useState('')
  
  const [role,     setRole]     = useState('admin')
  const [roleAnim, setRoleAnim] = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState({})
  const [toast,    setToast]    = useState(null)
  const [toastVis, setToastVis] = useState(false)

  const snInstance = import.meta.env.VITE_SN_INSTANCE || 'ServiceNow PDI'
  const today = new Date().toISOString().split('T')[0]

  function showToast(type, msg) {
    setToast({ type, msg })
    setToastVis(true)
    setTimeout(() => {
      setToastVis(false)
      setTimeout(() => setToast(null), 400)
    }, 3200)
  }

  useEffect(() => {
    if (!roleAnim) return
    const timer = setTimeout(() => setRoleAnim(false), 450)
    return () => clearTimeout(timer)
  }, [roleAnim])

  function validate() {
    const e = {}
    if (authView === 'login') {
      if (!email.trim())                    e.email    = 'Username or email is required.'
      else if (email.trim().length < 3)     e.email    = 'Minimum 3 characters required.'
      if (!password)                        e.password = 'Password is required.'
      else if (!validatePassword(password)) e.password = 'Minimum 6 characters required.'
    } else if (authView === 'signup') {
      if (!name.trim()) e.name = 'Full Name is required.'
      if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email is required.'
      if (!password) e.password = 'Password is required.'
      else if (!validatePassword(password)) e.password = 'Minimum 6 characters required.'
      
      // Only numbers, exactly 10 digits
      if (!phone.trim()) e.phone = 'Phone number is required.'
      else if (!/^\d{10}$/.test(phone.trim())) e.phone = 'Must be exactly 10 digits (numbers only).'
    } else if (authView === 'forgot') {
      if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email is required.'
    }
    return e
  }

  async function handleSubmit(evt) {
    evt.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)

    try {
      if (authView === 'login') {
        const user = await authenticateUser(email, password)
        // Enforce role: the selected role must match the account's actual role
        if (user.role !== role) {
          throw new Error(
            role === 'admin'
              ? 'This account is a Volunteer account. Please select "Volunteer" to log in.'
              : 'This account is an Admin account. Please select "Admin" to log in.'
          )
        }
        if (remember) localStorage.setItem('ngo_session', JSON.stringify({ email, name: user.name, role: user.role }))
        showToast('success', `Welcome back, ${user.name || 'User'}!`)
        setTimeout(() => onLogin(user), 1000)
      } else if (authView === 'signup') {
        await createVolunteer({
          name,
          email,
          user_password: password,
          mobile_phone: phone,
        })
        showToast('success', 'Registration successful! Please log in.')
        setAuthView('login')
        setPassword('')
      } else if (authView === 'forgot') {
        showToast('success', 'Password reset link sent to your email!')
        setAuthView('login')
      }
    } catch (err) {
      showToast('error', err.message || 'Operation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Background */}
      <div className="login-bg" aria-hidden="true">
        <div className="corner-accent top-left"/>
        <div className="corner-accent top-right"/>
        <div className="corner-accent bot-left"/>
        <div className="corner-accent bot-right"/>
      </div>

      <main className="login-wrapper">
        <div className={`login-card${roleAnim ? ' role-switched' : ''}`} role="main" style={{ maxHeight: authView === 'signup' ? '95vh' : undefined, overflowY: authView === 'signup' ? 'auto' : undefined }}>
          {/* Logo */}
          <div className="login-logo">
            <img src={logoImg} alt="NGO Impact Hub" className="logo-img"/>
          </div>

          {/* Heading */}
          <div className="login-heading">
            <h1>NGO <span>Impact Hub</span></h1>
            <p>
              {authView === 'login' ? `Sign in to access your ${role === 'admin' ? 'admin portal' : 'volunteer dashboard'}`
              : authView === 'signup' ? 'Register as a new volunteer'
              : 'Reset your password'}
            </p>
          </div>

          {authView === 'login' && (
            <div className="login-role-switcher" role="tablist" aria-label="Login user role">
              <button type="button"
                className={`role-btn${role === 'admin' ? ' active' : ''}`}
                onClick={() => { if (role !== 'admin') { setRole('admin'); setRoleAnim(true) } }}
                aria-selected={role === 'admin'}
              >Admin</button>
              <button type="button"
                className={`role-btn${role === 'volunteer' ? ' active' : ''}`}
                onClick={() => { if (role !== 'volunteer') { setRole('volunteer'); setRoleAnim(true) } }}
                aria-selected={role === 'volunteer'}
              >Volunteer</button>
            </div>
          )}

          {/* ServiceNow connection banner */}
          <div className="sn-connect-banner">
            <div className="sn-dot"/>
            <span>Connecting to {snInstance.replace('https://', '')}</span>
          </div>

          {/* Form */}
          <form id="login-form" className="login-form" onSubmit={handleSubmit} noValidate aria-label={`${authView} form`}>
            
            {authView === 'signup' && (
              <div className="field-group">
                <label className="field-label" htmlFor="name-input">Full Name</label>
                <div className="field-wrap">
                  <input id="name-input" type="text"
                    className={`field-input${errors.name ? ' error' : ''}`}
                    placeholder="e.g. Priya Sharma"
                    value={name} onChange={e => { setName(e.target.value); setErrors(p => ({...p, name: ''})) }}
                  />
                </div>
                {errors.name && <span className="error-msg" role="alert">⚠ {errors.name}</span>}
              </div>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="email-input">Email {authView === 'login' && role === 'admin' ? 'or Username' : ''}</label>
              <div className="field-wrap">
                <span className="field-icon"><IconMail/></span>
                <input id="email-input" type="text"
                  className={`field-input${errors.email ? ' error' : ''}`}
                  placeholder={authView === 'login' && role === 'admin' ? 'admin or admin@ngo.org' : 'volunteer@ngo.org'}
                  value={email}
                  onChange={e => { 
                    const val = e.target.value;
                    setEmail(val);
                    if (/\s/.test(val)) {
                      setErrors(p => ({...p, email: 'Spaces are not allowed in email or username.'}));
                    } else {
                      setErrors(p => ({...p, email: ''}));
                    }
                  }}
                  onBlur={e => {
                    if (authView !== 'login' && email && !/\S+@\S+\.\S+/.test(email)) {
                      setErrors(p => ({...p, email: 'Invalid email format. Example: user@example.com'}));
                    }
                  }}
                  autoComplete="username"
                />
              </div>
              {errors.email && <span className="error-msg" role="alert">⚠ {errors.email}</span>}
            </div>

            {authView !== 'forgot' && (
              <div className="field-group">
                <label className="field-label" htmlFor="password-input">Password</label>
                <div className="field-wrap">
                  <span className="field-icon"><IconLock/></span>
                  <input id="password-input"
                    type={showPwd ? 'text' : 'password'}
                    className={`field-input${errors.password ? ' error' : ''}`}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(p => ({...p, password: ''})) }}
                    onBlur={e => {
                      if (password && password.length < 6) {
                        setErrors(p => ({...p, password: 'Password must be at least 6 characters.'}));
                      }
                    }}
                    autoComplete={authView === 'signup' ? 'new-password' : 'current-password'}
                  />
                  <button type="button" className="toggle-btn"
                    onClick={() => setShowPwd(v => !v)}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}>
                    {showPwd ? <IconEyeOff/> : <IconEye/>}
                  </button>
                </div>
                {errors.password && <span className="error-msg" role="alert">⚠ {errors.password}</span>}
              </div>
            )}

            {authView === 'signup' && (
              <div className="field-group">
                <label className="field-label" htmlFor="phone-input">Phone Number (10 digits)</label>
                <div className="field-wrap">
                  <input id="phone-input" type="text"
                    className={`field-input${errors.phone ? ' error' : ''}`}
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => {
                      const raw = e.target.value;
                      if (/[^\d]/.test(raw)) {
                        setErrors(p => ({...p, phone: 'Warning: Please enter numbers only.'}));
                      } else {
                        setErrors(p => ({...p, phone: ''}));
                      }
                      setPhone(raw.replace(/\D/g, '').slice(0, 10));
                    }}
                    onBlur={e => {
                      if (phone && phone.length < 10) {
                        setErrors(p => ({...p, phone: 'Phone number must be exactly 10 digits.'}));
                      }
                    }}
                  />
                </div>
                {errors.phone && <span className="error-msg" role="alert">⚠ {errors.phone}</span>}
              </div>
            )}

            {authView === 'login' && (
              <div className="form-extras">
                <label className="remember-label" htmlFor="remember-me">
                  <input id="remember-me" type="checkbox" className="remember-checkbox"
                    checked={remember} onChange={e => setRemember(e.target.checked)}/>
                  Remember me
                </label>
                <a href="#" className="forgot-link"
                  onClick={e => { e.preventDefault(); setAuthView('forgot'); setErrors({}) }}>
                  Forgot password?
                </a>
              </div>
            )}

            <button id="login-submit-btn" type="submit" className="btn-submit"
              disabled={loading} aria-busy={loading} style={{ marginTop: '1rem' }}>
              {loading && <span className="spinner" aria-hidden="true"/>}
              {loading ? 'Processing…' 
                : authView === 'login' ? `Sign In as ${role === 'admin' ? 'Admin' : 'Volunteer'}`
                : authView === 'signup' ? 'Create Account'
                : 'Send Reset Link'}
            </button>

            {authView === 'login' && role === 'volunteer' && (
              <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-light)' }}>Don't have an account? </span>
                <a href="#" style={{ color: 'var(--brand-green)', fontWeight: 500, textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setAuthView('signup'); setErrors({}) }}>
                  Sign Up
                </a>
              </div>
            )}

            {authView !== 'login' && (
              <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.9rem' }}>
                <a href="#" style={{ color: 'var(--brand-green)', fontWeight: 500, textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setAuthView('login'); setErrors({}) }}>
                  &larr; Back to Login
                </a>
              </div>
            )}
          </form>

          {/* Demo hint */}
          <div className="demo-hint" style={{ marginTop: '1.5rem' }}>
            <span>🧪 Demo mode:</span> Use <strong>{role === 'admin' ? 'admin@ngo.org' : 'volunteer@ngo.org'}</strong> / <strong>{role === 'admin' ? 'admin456' : 'volunteer123'}</strong>
          </div>

          {/* Footer tagline */}
          <div className="card-tagline">
            <span className="tagline-dot teal"/>Collaborate
            <span className="tagline-dot gold"/>Empower
            <span className="tagline-dot green"/>Transform
          </div>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div role="status" aria-live="polite"
          className={`toast${toastVis ? ' show' : ''}${toast.type === 'success' ? ' success' : toast.type === 'error' ? ' error-toast' : ''}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? <IconCheck/> : toast.type === 'error' ? '✕' : '💬'}
          </span>
          {toast.msg}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PORTAL LAYOUT (authenticated)
   ═══════════════════════════════════════════════════════════════════════════ */
function Portal({ user, onLogout }) {
  const [page, setPage] = useState('dashboard')
  const [notifCount, setNotifCount] = useState(0)

  const isAdmin = user.role === 'admin'

  useEffect(() => {
    if (!user.sys_id) return
    getNotifications(user.sys_id)
      .then(notifs => setNotifCount(notifs.filter(n => !n.u_is_read).length))
      .catch(() => {})
  }, [user.sys_id])

  const pages = {
    dashboard:     isAdmin ? <Dashboard /> : <VolunteerDashboard user={user} />,
    notifications: <NotificationsPage user={user} onRead={() => setNotifCount(c => Math.max(0, c - 1))} />,
    ...(isAdmin ? {
      volunteers:  <VolunteersPage />,
      projects:    <ProjectsPage />,
      assignments: <AssignmentsPage />,
      events:      <EventsPage />,
      reports:     <ReportsPage />,
    } : {}),
  }

  return (
    <div className="portal-layout">
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        onLogout={onLogout}
        user={user}
        isAdmin={isAdmin}
        notifCount={notifCount}
      />
      <main className="portal-content">
        <SNStatusBanner />
        {pages[page] || (isAdmin ? <Dashboard /> : <VolunteerDashboard user={user} />)}
      </main>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROOT APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [user, setUser] = useState(null)

  // Restore session from localStorage
  useEffect(() => {
    try {
      const session = localStorage.getItem('ngo_session')
      if (session) setUser(JSON.parse(session))
    } catch {}
  }, [])

  function handleLogin(userData) {
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('ngo_session')
    setUser(null)
  }

  if (!user) return <LoginPage onLogin={handleLogin} />
  return <Portal user={user} onLogout={handleLogout} />
}
