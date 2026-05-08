import { useState, useEffect } from 'react'
import logoImg from './assets/image.png'
import { authenticateUser } from './api/servicenow'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import VolunteersPage from './pages/VolunteersPage'
import ProjectsPage from './pages/ProjectsPage'
import AssignmentsPage from './pages/AssignmentsPage'
import ReportsPage from './pages/ReportsPage'
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
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState({})
  const [toast,    setToast]    = useState(null)
  const [toastVis, setToastVis] = useState(false)

  const snInstance = import.meta.env.VITE_SN_INSTANCE || 'ServiceNow PDI'

  function showToast(type, msg) {
    setToast({ type, msg })
    setToastVis(true)
    setTimeout(() => {
      setToastVis(false)
      setTimeout(() => setToast(null), 400)
    }, 3200)
  }

  function validate() {
    const e = {}
    if (!email.trim())                    e.email    = 'Username or email is required.'
    else if (email.trim().length < 3)     e.email    = 'Minimum 3 characters required.'
    if (!password)                        e.password = 'Password is required.'
    else if (!validatePassword(password)) e.password = 'Minimum 6 characters required.'
    return e
  }

  async function handleSubmit(evt) {
    evt.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      const user = await authenticateUser(email, password)
      if (remember) localStorage.setItem('ngo_session', JSON.stringify({ email, name: user.name }))
      showToast('success', `Welcome back, ${user.name || 'Admin'}!`)
      setTimeout(() => onLogin(user), 1000)
    } catch (err) {
      showToast('error', err.message || 'Login failed. Please check credentials.')
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
        <div className="login-card" role="main">
          {/* Logo */}
          <div className="login-logo">
            <img src={logoImg} alt="NGO Impact Hub" className="logo-img"/>
          </div>

          {/* Heading */}
          <div className="login-heading">
            <h1>NGO <span>Impact Hub</span></h1>
            <p>Sign in to access your volunteer dashboard</p>
          </div>

          {/* ServiceNow connection banner */}
          <div className="sn-connect-banner">
            <div className="sn-dot"/>
            <span>Connecting to {snInstance.replace('https://', '')}</span>
          </div>

          {/* Form */}
          <form id="login-form" className="login-form" onSubmit={handleSubmit} noValidate aria-label="Login form">
            {/* Username / Email */}
            <div className="field-group">
              <label className="field-label" htmlFor="email-input">Username or Email</label>
              <div className="field-wrap">
                <span className="field-icon"><IconMail/></span>
                <input id="email-input" type="text"
                  className={`field-input${errors.email ? ' error' : ''}`}
                  placeholder="admin  or  admin@ngo.org"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({...p, email: ''})) }}
                  autoComplete="username"
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && <span id="email-error" className="error-msg" role="alert">⚠ {errors.email}</span>}
            </div>

            {/* Password */}
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
                  autoComplete="current-password"
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  aria-invalid={!!errors.password}
                />
                <button type="button" className="toggle-btn"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd ? <IconEyeOff/> : <IconEye/>}
                </button>
              </div>
              {errors.password && <span id="password-error" className="error-msg" role="alert">⚠ {errors.password}</span>}
            </div>

            {/* Remember / Forgot */}
            <div className="form-extras">
              <label className="remember-label" htmlFor="remember-me">
                <input id="remember-me" type="checkbox" className="remember-checkbox"
                  checked={remember} onChange={e => setRemember(e.target.checked)}/>
                Remember me
              </label>
              <a href="#" className="forgot-link"
                onClick={e => { e.preventDefault(); showToast('info', 'Contact your ServiceNow admin to reset your password.') }}>
                Forgot password?
              </a>
            </div>

            {/* Submit */}
            <button id="login-submit-btn" type="submit" className="btn-submit"
              disabled={loading} aria-busy={loading}>
              {loading && <span className="spinner" aria-hidden="true"/>}
              {loading ? 'Authenticating with ServiceNow…' : 'Sign In to Portal'}
            </button>
          </form>

          {/* Demo hint */}
          <div className="demo-hint">
            <span>🧪 Demo mode:</span> Use <strong>admin@ngo.org</strong> / <strong>admin123</strong>
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

  const pages = {
    dashboard:   <Dashboard />,
    volunteers:  <VolunteersPage />,
    projects:    <ProjectsPage />,
    assignments: <AssignmentsPage />,
    reports:     <ReportsPage />,
  }

  return (
    <div className="portal-layout">
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        onLogout={onLogout}
        user={user}
      />
      <main className="portal-content">
        {pages[page] || <Dashboard />}
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
