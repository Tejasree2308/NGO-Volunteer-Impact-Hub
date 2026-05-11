import React, { useState, useEffect } from 'react'
import { getNotifications, markNotificationRead } from '../api/servicenow'
import './Pages.css'

const TYPE_CONFIG = {
  approval:   { label: 'Approval',   color: '#10B981', bg: '#D1FAE5' },
  assignment: { label: 'Assignment', color: '#3B82F6', bg: '#DBEAFE' },
  event:      { label: 'Event',      color: '#8B5CF6', bg: '#EDE9FE' },
  reminder:   { label: 'Reminder',   color: '#F59E0B', bg: '#FEF3C7' },
  general:    { label: 'General',    color: '#6B7280', bg: '#F3F4F6' },
}

export default function NotificationsPage({ user, onRead }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await getNotifications(user.sys_id)
        setNotifications(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user.sys_id])

  async function handleMarkRead(notif) {
    if (notif.u_is_read) return
    try {
      await markNotificationRead(notif.sys_id)
      setNotifications(prev =>
        prev.map(n => n.sys_id === notif.sys_id ? { ...n, u_is_read: true } : n)
      )
      onRead && onRead()
    } catch (err) {
      console.error(err)
    }
  }

  async function handleMarkAllRead() {
    const unread = notifications.filter(n => !n.u_is_read)
    await Promise.all(unread.map(n => markNotificationRead(n.sys_id)))
    setNotifications(prev => prev.map(n => ({ ...n, u_is_read: true })))
    unread.forEach(() => onRead && onRead())
  }

  const unreadCount = notifications.filter(n => !n.u_is_read).length

  function formatDate(dateStr) {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diffMs = now - d
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHrs = Math.floor(diffMins / 60)
      if (diffHrs < 24) return `${diffHrs}h ago`
      const diffDays = Math.floor(diffHrs / 24)
      return `${diffDays}d ago`
    } catch {
      return dateStr
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn-secondary" onClick={handleMarkAllRead} style={{ borderRadius: '8px' }}>
            Mark All as Read
          </button>
        )}
      </div>

      {loading ? (
        <div className="table-card">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton-row" style={{ height: '72px', marginBottom: '8px' }} />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="table-card" style={{ padding: '64px', textAlign: 'center', color: 'var(--text-light)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔔</div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>No notifications yet</div>
          <div style={{ fontSize: '0.875rem' }}>You'll be notified about assignments, approvals, and events here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map(n => {
            const cfg = TYPE_CONFIG[n.u_type] || TYPE_CONFIG.general
            return (
              <div
                key={n.sys_id}
                onClick={() => handleMarkRead(n)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  background: n.u_is_read ? '#fff' : '#F0FDF4',
                  border: `1px solid ${n.u_is_read ? '#E5E7EB' : '#86EFAC'}`,
                  borderRadius: '12px', padding: '16px 20px',
                  cursor: n.u_is_read ? 'default' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {/* Type badge */}
                <div style={{
                  minWidth: '8px', width: '8px', height: '8px', borderRadius: '50%',
                  background: cfg.color, marginTop: '6px', flexShrink: 0,
                  boxShadow: n.u_is_read ? 'none' : `0 0 0 3px ${cfg.bg}`,
                }} />

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: '99px'
                    }}>{cfg.label}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{formatDate(n.u_created_on)}</span>
                  </div>
                  <p style={{ margin: 0, color: n.u_is_read ? '#6B7280' : '#111827', fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {n.u_message}
                  </p>
                </div>

                {!n.u_is_read && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: '6px' }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
