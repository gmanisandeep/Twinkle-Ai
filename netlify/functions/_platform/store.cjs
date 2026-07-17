const crypto = require('node:crypto');

const COLLECTIONS = new Set([
  'executions', 'files', 'jobs', 'knowledgeChunks', 'knowledgeSources',
  'memories', 'notes', 'projects', 'tasks', 'usage', 'audit',
]);
const MAX_DOCUMENT_BYTES = 500_000;
const memoryDatabase = globalThis.__twinkleMemoryDatabase || new Map();
globalThis.__twinkleMemoryDatabase = memoryDatabase;
let adminTokenCache = null;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function serviceAccount() {
  try {
    const value = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
    if (!value?.client_email || !value?.private_key || !value?.project_id) return null;
    return value;
  } catch { return null; }
}

async function firebaseAdminToken(account) {
  if (adminTokenCache?.expiresAt > Date.now() + 60_000) return adminTokenCache.token;
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3_600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Server storage authentication failed.');
  const data = await response.json();
  if (!data.access_token) throw new Error('Server storage authentication failed.');
  adminTokenCache = { token: data.access_token, expiresAt: Date.now() + Math.min(3_600, data.expires_in || 3_600) * 1_000 };
  return adminTokenCache.token;
}

function safeSegment(value, label = 'identifier') {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(text)) throw new Error(`Invalid ${label}.`);
  return text;
}

function safeCollection(value) {
  const collection = safeSegment(value, 'collection');
  if (!COLLECTIONS.has(collection)) throw new Error('Unsupported collection.');
  return collection;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validateDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document must be an object.');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('Document is too large.');
}

class MemoryStore {
  constructor(userId) {
    this.userId = safeSegment(userId, 'user');
  }

  key(collection, id) {
    return `${this.userId}:${safeCollection(collection)}:${safeSegment(id)}`;
  }

  async get(collection, id) {
    return clone(memoryDatabase.get(this.key(collection, id)) || null);
  }

  async put(collection, id, value) {
    validateDocument(value);
    const document = { ...clone(value), id: safeSegment(id), updatedAt: new Date().toISOString() };
    memoryDatabase.set(this.key(collection, id), document);
    return clone(document);
  }

  async delete(collection, id) {
    return memoryDatabase.delete(this.key(collection, id));
  }

  async list(collection, limit = 100) {
    const prefix = `${this.userId}:${safeCollection(collection)}:`;
    return [...memoryDatabase.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => clone(value))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.min(500, Math.max(1, limit)));
  }

  async clear(collection) {
    const prefix = `${this.userId}:${safeCollection(collection)}:`;
    let count = 0;
    for (const key of memoryDatabase.keys()) {
      if (key.startsWith(prefix)) {
        memoryDatabase.delete(key);
        count += 1;
      }
    }
    return count;
  }
}

function firestoreValue(value) {
  return { stringValue: JSON.stringify(value) };
}

function parseFirestoreDocument(document) {
  if (!document?.fields?.payload?.stringValue) return null;
  try { return JSON.parse(document.fields.payload.stringValue); } catch { return null; }
}

class FirestoreStore {
  constructor(userId, account, projectId) {
    this.userId = safeSegment(userId, 'user');
    this.account = account;
    this.projectId = safeSegment(projectId, 'Firebase project');
    this.root = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/twinkleUsers/${this.userId}`;
  }

  async headers() {
    return { Authorization: `Bearer ${await firebaseAdminToken(this.account)}`, 'Content-Type': 'application/json' };
  }

  url(collection, id = '') {
    const base = `${this.root}/${safeCollection(collection)}`;
    return id ? `${base}/${safeSegment(id)}` : base;
  }

  async request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...await this.headers(), ...(options.headers || {}) }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Storage request failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  }

  async get(collection, id) {
    return parseFirestoreDocument(await this.request(this.url(collection, id)));
  }

  async put(collection, id, value) {
    validateDocument(value);
    const document = { ...clone(value), id: safeSegment(id), updatedAt: new Date().toISOString() };
    await this.request(this.url(collection, id), {
      method: 'PATCH',
      body: JSON.stringify({ fields: { payload: firestoreValue(document) } }),
    });
    return document;
  }

  async delete(collection, id) {
    await this.request(this.url(collection, id), { method: 'DELETE' });
    return true;
  }

  async list(collection, limit = 100) {
    const cap = Math.min(500, Math.max(1, limit));
    const data = await this.request(`${this.url(collection)}?pageSize=${cap}&orderBy=__name__`) || {};
    return (data.documents || []).map(parseFirestoreDocument).filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async clear(collection) {
    let deleted = 0;
    for (let page = 0; page < 20; page += 1) {
      const documents = await this.list(collection, 500);
      if (!documents.length) break;
      await Promise.all(documents.map((document) => this.delete(collection, document.id)));
      deleted += documents.length;
      if (documents.length < 500) break;
    }
    return deleted;
  }
}

function createStore({ userId, idToken }) {
  void idToken;
  const account = serviceAccount();
  const projectId = String(process.env.FIREBASE_PROJECT_ID || account?.project_id || '').trim();
  if (projectId && account) return new FirestoreStore(userId, account, projectId);
  return new MemoryStore(userId);
}

function newId(prefix = 'item') {
  return `${safeSegment(prefix)}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { COLLECTIONS, FirestoreStore, MemoryStore, createStore, firebaseAdminToken, newId, safeSegment, serviceAccount };
