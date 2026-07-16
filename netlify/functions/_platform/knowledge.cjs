const crypto = require('node:crypto');
const { newId } = require('./store.cjs');
const { safeHttpsBase } = require('./providers.cjs');

const MAX_SOURCE_CHARS = 250_000;
const MAX_CHUNKS = 200;

function cleanText(value, max = MAX_SOURCE_CHARS) {
  return String(value || '').replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function tokenize(value) {
  return [...new Set(cleanText(value, 20_000).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])];
}

function chunkText(text, size = 1_500, overlap = 200) {
  const clean = cleanText(text);
  const chunks = [];
  let offset = 0;
  while (offset < clean.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(clean.length, offset + size);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end));
      if (boundary > offset + Math.floor(size * 0.6)) end = boundary + 1;
    }
    const content = clean.slice(offset, end).trim();
    if (content) chunks.push(content);
    if (end >= clean.length) break;
    offset = Math.max(offset + 1, end - overlap);
  }
  return chunks;
}

function lexicalScore(query, content) {
  const terms = tokenize(query);
  if (!terms.length) return 0;
  const body = new Set(tokenize(content));
  return terms.reduce((score, term) => score + (body.has(term) ? 1 : 0), 0) / terms.length;
}

function cosine(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0; let a = 0; let b = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]; a += left[index] ** 2; b += right[index] ** 2;
  }
  return a && b ? dot / (Math.sqrt(a) * Math.sqrt(b)) : 0;
}

async function embed(text) {
  const base = safeHttpsBase(process.env.EMBEDDING_API_URL || '');
  const model = String(process.env.EMBEDDING_MODEL || '').trim().slice(0, 200);
  if (!base || !model) return null;
  const key = String(process.env.EMBEDDING_API_KEY || '').trim().slice(0, 10_000);
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, input: cleanText(text, 20_000) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const vector = data.data?.[0]?.embedding || data.embedding;
  return Array.isArray(vector) && vector.length <= 8_192 && vector.every(Number.isFinite) ? vector : null;
}

async function ingestKnowledge(store, input) {
  const text = cleanText(input.text);
  if (!text) throw new Error('Extracted document text is required.');
  const sourceId = input.id || newId('source');
  const source = await store.put('knowledgeSources', sourceId, {
    title: cleanText(input.title || 'Untitled source', 200),
    type: cleanText(input.type || 'text', 40),
    url: cleanText(input.url || '', 2_000),
    projectId: cleanText(input.projectId || '', 120),
    private: input.private !== false,
    size: Buffer.byteLength(text, 'utf8'),
    createdAt: new Date().toISOString(),
  });
  const chunks = chunkText(text);
  for (let index = 0; index < chunks.length; index += 1) {
    const content = chunks[index];
    let vector = null;
    try { vector = await embed(content); } catch { vector = null; }
    const id = `${sourceId}_${String(index).padStart(3, '0')}`;
    await store.put('knowledgeChunks', id, {
      sourceId, projectId: source.projectId, index, content, vector,
      checksum: crypto.createHash('sha256').update(content).digest('hex'),
      citation: { sourceId, title: source.title, url: source.url || null, chunk: index + 1 },
    });
  }
  return { source, chunkCount: chunks.length };
}

async function searchKnowledge(store, query, options = {}) {
  const cleanQuery = cleanText(query, 4_000);
  if (!cleanQuery) return [];
  let queryVector = null;
  try { queryVector = await embed(cleanQuery); } catch { queryVector = null; }
  const chunks = await store.list('knowledgeChunks', 500);
  return chunks
    .filter((chunk) => !options.projectId || chunk.projectId === options.projectId)
    .map((chunk) => {
      const keyword = lexicalScore(cleanQuery, chunk.content);
      const semantic = cosine(queryVector, chunk.vector);
      return { ...chunk, score: Number((keyword * 0.55 + semantic * 0.45).toFixed(4)), match: queryVector ? 'hybrid' : 'keyword' };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(12, Math.max(1, options.limit || 6)))
    .map(({ vector, ...chunk }) => chunk);
}

async function deleteKnowledge(store, sourceId) {
  const chunks = await store.list('knowledgeChunks', 500);
  await Promise.all(chunks.filter((chunk) => chunk.sourceId === sourceId).map((chunk) => store.delete('knowledgeChunks', chunk.id)));
  await store.delete('knowledgeSources', sourceId);
  return true;
}

module.exports = { chunkText, cosine, deleteKnowledge, ingestKnowledge, lexicalScore, searchKnowledge, tokenize };
