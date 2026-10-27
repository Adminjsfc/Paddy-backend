import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from "../src/app.js";
import { pool } from "../src/config/database.js";
import { passwordHash } from "../src/utils/core.js";
test('Browser cookie login, refresh, origin checks and revocation', async () => {
  const originalExecute = pool.execute,
    originalConnection = pool.getConnection;
  const oldEnv = {
    ...process.env
  };
  process.env.COOKIE_SECURE = 'false';
  process.env.FRONTEND_ORIGINS = 'http://localhost:5173';
  const user = {
    id: 1,
    email: 'admin@test.invalid',
    name: 'Admin',
    role: 'ADMIN',
    active: 1,
    password_hash: await passwordHash('test-password-123')
  };
  let session;
  const execute = async (sql, args = []) => {
    if (sql.includes(' FROM users ')) return [[args[0] === user.email ? user : undefined].filter(Boolean)];
    if (sql.startsWith('INSERT INTO sessions')) {
      const fields = sql.match(/\(([^)]+)\)/)[1].split(',');
      session = Object.fromEntries(fields.map((f, i) => [f, args[i]]));
      return [{
        insertId: 1
      }];
    }
    if (sql.includes('FROM sessions s JOIN users')) {
      const refreshing = sql.includes('s.refresh_token_hash=?');
      const valid = session && user.active && args[0] === session[refreshing ? 'refresh_token_hash' : 'token_hash'] && session[refreshing ? 'refresh_expires_at' : 'expires_at'] > new Date();
      return [valid ? [refreshing ? session : user] : []];
    }
    if (sql.startsWith('UPDATE sessions SET token_hash')) {
      session.token_hash = args[0];
      session.expires_at = args[1];
      return [{
        affectedRows: 1
      }];
    }
    if (sql.startsWith('DELETE FROM sessions')) {
      if (session && (args[0] === session.token_hash || args[1] === session.refresh_token_hash)) session = undefined;
      return [{
        affectedRows: 1
      }];
    }
    throw Error(`Unexpected SQL: ${sql}`);
  };
  pool.execute = execute;
  pool.getConnection = async () => ({
    execute,
    query: async () => [[]],
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {}
  });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const call = (path, options = {}) => fetch(base + path, options);
  const json = {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:5173'
  };
  try {
    let response = await call('/multilogin', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        email: user.email,
        password: 'test-password-123'
      })
    });
    assert.equal(response.status, 200);
    const login = await response.json();
    assert.equal(login.status, 200);
    assert.equal(login.data.user.password_hash, undefined);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    for (const cookie of cookies) {
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Lax/);
      assert.match(cookie, /Path=\/api\/v1/);
    }
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const cookie = cookies.map(v => v.split(';')[0]).join('; ');
    const refreshOnly = cookies.find(v => v.startsWith('refreshToken=')).split(';')[0];
    assert.equal((await call('/auth/me', {
      headers: {
        Cookie: cookie
      }
    })).status, 200);
    const identity = await (await call('/auth/me', {
      headers: {
        Cookie: cookie
      }
    })).json();
    assert.equal(identity.data.user_id, user.id);
    assert.equal(identity.data.role, 'ADMIN');
    assert.equal((await call('/auth/me', {
      headers: {
        Device: 'mobile',
        'X-Auth-Token': login.data.token
      }
    })).status, 200);
    assert.equal((await call('/auth/me', {
      headers: {
        'User-Agent': 'okhttp/4.0',
        'X-Auth-Token': login.data.token
      }
    })).status, 200);
    assert.equal((await call('/auth/me', {
      headers: {
        Device: 'mobile',
        'X-Auth-Token': 'invalid',
        Cookie: cookie
      }
    })).status, 401);
    assert.equal((await call('/auth/me', {
      headers: {
        Authorization: 'Bearer invalid',
        Cookie: cookie
      }
    })).status, 401);
    assert.equal((await call('/auth/me', {
      headers: {
        Cookie: refreshOnly
      }
    })).status, 401);
    session.expires_at = new Date(0);
    assert.equal((await call('/auth/me', {
      headers: {
        Cookie: cookie
      }
    })).status, 401);
    response = await call('/refresh-token', {
      method: 'POST',
      headers: {
        ...json,
        Cookie: cookie
      },
      body: '{}'
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, login.data.token);
    assert.equal((await call('/auth/me', {
      headers: {
        Cookie: cookie
      }
    })).status, 200);
    assert.equal((await call('/auth/me', {
      headers: {
        Authorization: `Bearer ${login.data.token}`
      }
    })).status, 200);
    assert.equal((await call('/refresh-token', {
      method: 'POST',
      headers: {
        ...json,
        Origin: 'https://evil.invalid',
        Cookie: cookie
      },
      body: '{}'
    })).status, 403);
    assert.equal((await call('/auth/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET'
      }
    })).status, 204);
    user.active = 0;
    assert.equal((await call('/auth/me', {
      headers: {
        Cookie: cookie
      }
    })).status, 401);
    assert.equal((await call('/refresh-token', {
      method: 'POST',
      headers: {
        ...json,
        Cookie: cookie
      },
      body: '{}'
    })).status, 401);
    user.active = 1;
    session.refresh_expires_at = new Date(0);
    assert.equal((await call('/refresh-token', {
      method: 'POST',
      headers: {
        ...json,
        Cookie: cookie
      },
      body: '{}'
    })).status, 401);
    session.refresh_expires_at = new Date(Date.now() + 60000);
    session.expires_at = new Date(0);
    response = await call('/all_userlogout', {
      method: 'POST',
      headers: {
        ...json,
        Cookie: cookie
      },
      body: '{}'
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal((await call('/refresh-token', {
      method: 'POST',
      headers: {
        ...json,
        Cookie: cookie
      },
      body: '{}'
    })).status, 401);
    assert.equal((await call('/auth/me', {
      headers: {
        Authorization: `Bearer ${login.data.token}`
      }
    })).status, 401);
  } finally {
    await new Promise(r => server.close(r));
    pool.execute = originalExecute;
    pool.getConnection = originalConnection;
    for (const key of ['COOKIE_SECURE', 'FRONTEND_ORIGINS']) {
      if (oldEnv[key] === undefined) delete process.env[key];else process.env[key] = oldEnv[key];
    }
    await pool.end();
  }
});
