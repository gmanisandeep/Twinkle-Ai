const dns = require('node:dns').promises;
const net = require('node:net');
const { searchKnowledge } = require('./knowledge.cjs');
const { newId } = require('./store.cjs');

const MAX_WEB_BYTES = 1_000_000;

const DEFINITIONS = [
  { name: 'web.search', permission: 'safe', description: 'Search the public web through the configured search service.' },
  { name: 'web.read', permission: 'safe', description: 'Read a public HTTP(S) page with private-network protection.' },
  { name: 'memory.search', permission: 'safe', description: 'Search the current user memory.' },
  { name: 'memory.remember', permission: 'sensitive', description: 'Save useful context to user-visible memory.' },
  { name: 'knowledge.search', permission: 'safe', description: 'Search uploaded project knowledge with citations.' },
  { name: 'projects.list', permission: 'safe', description: 'List this user projects.' },
  { name: 'tasks.create', permission: 'sensitive', description: 'Create a task for the current user.' },
  { name: 'notes.create', permission: 'sensitive', description: 'Create a private note.' },
  { name: 'email.draft', permission: 'sensitive', description: 'Draft, but never send, an email.' },
  { name: 'calendar.reminder', permission: 'sensitive', description: 'Create a reminder record; connected calendars require a connector.' },
  { name: 'files.write', permission: 'dangerous', description: 'Write a file into the Twinkle project workspace.' },
  { name: 'github.request', permission: 'dangerous', description: 'Request a GitHub connector operation.' },
  { name: 'sandbox.execute', permission: 'dangerous', description: 'Execute code through a separately configured sandbox.' },
  { name: 'mcp.call', permission: 'dangerous', description: 'Call an allowlisted external MCP gateway.' },
];

function toolOverrides() {
  try {
    const value = JSON.parse(process.env.TOOL_PERMISSIONS_JSON || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function connectorConfigured(name) {
  if (name === 'web.search') return Boolean(process.env.SEARCH_API_URL);
  if (name === 'github.request') return Boolean(process.env.GITHUB_TOOL_WEBHOOK_URL);
  if (name === 'sandbox.execute') return Boolean(process.env.SANDBOX_RUNNER_URL);
  if (name === 'mcp.call') return Boolean(process.env.MCP_GATEWAY_URL);
  return true;
}

function listTools() {
  const overrides = toolOverrides();
  return DEFINITIONS.map((tool) => {
    const requested = overrides[tool.name];
    const permission = ['safe', 'sensitive', 'dangerous', 'disabled'].includes(requested) ? requested : tool.permission;
    const configured = connectorConfigured(tool.name);
    return { ...tool, permission: configured ? permission : 'disabled', configured };
  });
}

function getTool(name) {
  return listTools().find((tool) => tool.name === name) || null;
}

function isPrivateAddress(address) {
  if (!net.isIP(address)) return true;
  if (address === '::1' || address === '0:0:0:0:0:0:0:1' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb')) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const value = mapped || address;
  if (net.isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

async function validatePublicUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP(S) URLs are allowed.');
  if (['localhost', 'localhost.localdomain'].includes(url.hostname) || net.isIP(url.hostname) && isPrivateAddress(url.hostname)) throw new Error('Private-network URLs are blocked.');
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error('Private-network URLs are blocked.');
  return url;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim().slice(0, 80_000);
}

async function readWebPage(input) {
  let url = await validatePublicUrl(input.url);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,text/plain,application/json;q=0.8', 'User-Agent': 'TwinkleOS/1.0 knowledge-reader' },
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Web page returned an invalid redirect.');
      url = await validatePublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Web page could not be read (${response.status}).`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_WEB_BYTES) throw new Error('Web page is too large.');
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_WEB_BYTES) throw new Error('Web page is too large.');
    const type = response.headers.get('content-type') || '';
    return { url: url.toString(), title: new URL(url).hostname, content: type.includes('html') ? stripHtml(body) : body.slice(0, 80_000) };
  }
  throw new Error('Web page redirected too many times.');
}

async function searchWeb(input) {
  const endpoint = String(process.env.SEARCH_API_URL || '').trim();
  if (!endpoint) throw new Error('Web search is not configured.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('Search service must use HTTPS.');
  url.searchParams.set('q', String(input.query || '').slice(0, 500));
  const key = String(process.env.SEARCH_API_KEY || '').trim();
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Web search is unavailable (${response.status}).`);
  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : Array.isArray(data.items) ? data.items : [];
  return results.slice(0, 8).map((item) => ({ title: String(item.title || '').slice(0, 300), url: String(item.url || item.link || '').slice(0, 2_000), snippet: String(item.snippet || item.description || '').slice(0, 1_000) }));
}

async function connectorCall(envName, payload) {
  const endpoint = String(process.env[envName] || '').trim();
  if (!endpoint || new URL(endpoint).protocol !== 'https:') throw new Error('Connector is not configured.');
  const token = String(process.env.CONNECTOR_SHARED_TOKEN || '').trim();
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Connector request failed (${response.status}).`);
  return response.json().catch(() => ({ ok: true }));
}

async function executeTool(name, args, context) {
  const tool = getTool(name);
  if (!tool || tool.permission === 'disabled') throw new Error('Tool is unavailable or disabled.');
  const { store } = context;
  if (name === 'web.search') return searchWeb(args);
  if (name === 'web.read') return readWebPage(args);
  if (name === 'knowledge.search') return searchKnowledge(store, args.query, { projectId: args.projectId, limit: args.limit });
  if (name === 'memory.search') {
    const query = String(args.query || '').toLowerCase();
    return (await store.list('memories', 500)).filter((item) => JSON.stringify(item).toLowerCase().includes(query)).slice(0, 12);
  }
  if (name === 'memory.remember') return store.put('memories', newId('memory'), { text: String(args.text || '').slice(0, 8_000), category: String(args.category || 'context').slice(0, 40), projectId: String(args.projectId || '').slice(0, 120), createdAt: new Date().toISOString() });
  if (name === 'projects.list') return store.list('projects', 100);
  if (name === 'tasks.create') return store.put('tasks', newId('task'), { title: String(args.title || '').slice(0, 300), details: String(args.details || '').slice(0, 4_000), dueAt: args.dueAt || null, done: false, projectId: args.projectId || '', createdAt: new Date().toISOString() });
  if (name === 'notes.create' || name === 'email.draft') return store.put('notes', newId(name === 'email.draft' ? 'draft' : 'note'), { type: name, title: String(args.title || args.subject || '').slice(0, 300), content: String(args.content || args.body || '').slice(0, 20_000), to: name === 'email.draft' ? String(args.to || '').slice(0, 500) : '', createdAt: new Date().toISOString() });
  if (name === 'calendar.reminder') return store.put('jobs', newId('reminder'), { name: String(args.title || 'Reminder').slice(0, 200), goal: String(args.details || args.title || '').slice(0, 4_000), schedule: { type: 'once', at: args.at }, enabled: true, nextRunAt: args.at, createdAt: new Date().toISOString() });
  if (name === 'files.write') return store.put('files', newId('file'), { name: String(args.name || 'untitled.txt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 200), content: String(args.content || '').slice(0, 200_000), projectId: String(args.projectId || '').slice(0, 120), mimeType: String(args.mimeType || 'text/plain').slice(0, 100), createdAt: new Date().toISOString() });
  if (name === 'github.request') return connectorCall('GITHUB_TOOL_WEBHOOK_URL', { tool: name, arguments: args, userId: context.userId });
  if (name === 'sandbox.execute') return connectorCall('SANDBOX_RUNNER_URL', { tool: name, arguments: args, userId: context.userId });
  if (name === 'mcp.call') return connectorCall('MCP_GATEWAY_URL', { tool: name, arguments: args, userId: context.userId });
  throw new Error('Tool is not implemented.');
}

module.exports = { executeTool, getTool, isPrivateAddress, listTools, readWebPage, stripHtml, validatePublicUrl };
