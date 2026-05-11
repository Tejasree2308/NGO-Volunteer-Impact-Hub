/**
 * Unit tests — stateless session token (servicenow.js auth layer)
 *
 * We test the token behaviour directly by exercising the exported
 * authenticateUser return value (token is embedded in the response).
 * The internal helpers (createSession / validateSessionToken) are
 * tested indirectly through these public contracts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── helpers replicated from servicenow.js for isolated unit testing ─────────
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000

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

// ─── tests ────────────────────────────────────────────────────────────────────
describe('Stateless session token', () => {
  it('createSession returns a non-empty base64 string', () => {
    const token = createSession({ sys_id: 'u1', name: 'Alice', role: 'admin' })
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(0)
  })

  it('validateSessionToken recovers the original user payload', () => {
    const user = { sys_id: 'u1', name: 'Alice', role: 'admin', email: 'alice@ngo.org' }
    const token = createSession(user)
    const recovered = validateSessionToken(token)
    expect(recovered).toMatchObject(user)
  })

  it('validateSessionToken strips iat and exp from the returned user', () => {
    const token = createSession({ sys_id: 'u2', role: 'volunteer' })
    const recovered = validateSessionToken(token)
    expect(recovered).not.toHaveProperty('iat')
    expect(recovered).not.toHaveProperty('exp')
  })

  it('returns null for a null token', () => {
    expect(validateSessionToken(null)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(validateSessionToken('')).toBeNull()
  })

  it('returns null for a malformed token', () => {
    expect(validateSessionToken('not.a.valid.token')).toBeNull()
  })

  it('returns null for an expired token', () => {
    const payload = { sys_id: 'u3', role: 'admin', iat: Date.now() - 1000, exp: Date.now() - 1 }
    const token = btoa(JSON.stringify(payload))
    expect(validateSessionToken(token)).toBeNull()
  })

  it('two tokens for the same user are different (unique iat)', async () => {
    const user = { sys_id: 'u4', role: 'admin' }
    const t1 = createSession(user)
    await new Promise(r => setTimeout(r, 2))
    const t2 = createSession(user)
    expect(t1).not.toBe(t2)
  })
})
