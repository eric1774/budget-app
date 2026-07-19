import { describe, it, expect } from 'vitest'
import { userFromClaims, takePendingLogin, _setPendingLogin } from '../src/server/auth/oidc'

describe('userFromClaims', () => {
  it('maps an admin from the groups claim', () => {
    const u = userFromClaims(
      { sub: 'u1', name: 'Eric', email: 'e@x.com', groups: ['family', 'budget-admin'] },
      'budget-admin'
    )
    expect(u).toEqual({ sub: 'u1', name: 'Eric', email: 'e@x.com', role: 'admin' })
  })

  it('defaults to member without the admin group', () => {
    expect(userFromClaims({ sub: 'u2', name: 'Kid', groups: ['family'] }, 'budget-admin').role).toBe('member')
  })

  it('treats a missing or malformed groups claim as member', () => {
    expect(userFromClaims({ sub: 'u3' }, 'budget-admin').role).toBe('member')
    expect(userFromClaims({ sub: 'u3', groups: 'budget-admin' }, 'budget-admin').role).toBe('member')
  })

  it('falls back name → preferred_username → email → sub', () => {
    expect(userFromClaims({ sub: 'u4', preferred_username: 'ricky' }, 'g').name).toBe('ricky')
    expect(userFromClaims({ sub: 'u4', email: 'r@x.com' }, 'g').name).toBe('r@x.com')
    expect(userFromClaims({ sub: 'u4' }, 'g').name).toBe('u4')
  })

  it('throws without a sub claim', () => {
    expect(() => userFromClaims({ name: 'ghost' }, 'g')).toThrow(/sub/)
  })
})

describe('pending logins', () => {
  it('returns an entry exactly once', () => {
    _setPendingLogin('l1', { verifier: 'v', state: 's', createdAt: Date.now() })
    expect(takePendingLogin('l1')).toMatchObject({ verifier: 'v', state: 's' })
    expect(takePendingLogin('l1')).toBeNull()
  })

  it('expires entries older than 10 minutes', () => {
    _setPendingLogin('l2', { verifier: 'v', state: 's', createdAt: Date.now() - 11 * 60 * 1000 })
    expect(takePendingLogin('l2')).toBeNull()
  })
})
