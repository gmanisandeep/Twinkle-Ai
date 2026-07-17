const TwinklePlatform = (() => {
  let cache = { memories: [], projects: [], sources: [], jobs: [], tasks: [], files: [], usage: null, providers: [], tools: [] };
  async function request(action, payload = {}, options = {}) {
    const token = await Auth.getToken();
    if (!token) throw new Error('You are not signed in.');
    const response = await fetch('/.netlify/functions/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, payload }),
      signal: options.signal,
    });
    if (response.status === 401 && !options.refreshed) {
      const refreshed = await Auth.getToken(true);
      if (refreshed) return request(action, payload, { ...options, refreshed: true });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Operation failed (${response.status}).`);
    return data.result;
  }

  async function runAgent(goal, options = {}) {
    let execution = await request('agent.run', {
      goal, projectId: options.projectId || '', role: options.role || 'planner', privacy: options.privacy || 'cloud', temporary: Boolean(options.temporary),
    }, { signal: options.signal });
    options.onProgress?.(execution);
    while (execution.status === 'awaiting_approval') {
      const pending = execution.pending;
      const approved = await options.onApproval?.(pending);
      execution = await request('agent.approve', { executionId: execution.id, approved: Boolean(approved) }, { signal: options.signal });
      options.onProgress?.(execution);
    }
    return execution;
  }

  async function extractPdf(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source = new TextDecoder('latin1').decode(bytes);
    const strings = [];
    for (const match of source.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)) strings.push(match[1]);
    for (const match of source.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      for (const item of match[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)) strings.push(item[1]);
    }
    return strings.join(' ').replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n').trim();
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot extract Word files.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extractDocx(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
      if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break; }
    }
    if (eocd < 0) throw new Error('Invalid Word document.');
    const entries = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    for (let count = 0; count < entries; count += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const compression = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      if (name === 'word/document.xml') {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = bytes.slice(start, start + compressedSize);
        const content = compression === 0 ? compressed : compression === 8 ? await inflateRaw(compressed) : null;
        if (!content) throw new Error('Unsupported Word compression format.');
        const xml = new TextDecoder().decode(content);
        return xml.replace(/<w:tab\s*\/>/g, '\t').replace(/<w:br\s*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error('Word document text was not found.');
  }

  async function extractFile(file) {
    const name = file.name.toLowerCase();
    if (file.size > 10_000_000) throw new Error('Files must be 10 MB or smaller.');
    if (name.endsWith('.pdf')) return extractPdf(file);
    if (name.endsWith('.docx')) return extractDocx(file);
    if (file.type.startsWith('text/') || /\.(csv|tsv|json|md|js|mjs|cjs|ts|tsx|jsx|html|css|py|java|c|cpp|h|sql|xml|yaml|yml)$/i.test(name)) return file.text();
    throw new Error('Supported uploads are PDF, DOCX, text, CSV, JSON, Markdown, and source-code files.');
  }

  async function imageData(file) {
    if (!file.type.startsWith('image/') || file.size > 3_000_000) throw new Error('Images must be JPEG, PNG, WebP, or GIF and no larger than 3 MB.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Image could not be read.'));
      reader.readAsDataURL(file);
    });
    return String(dataUrl).split(',')[1] || '';
  }

  async function ingestFile(file, projectId = '') {
    const text = file.type.startsWith('image/')
      ? (await request('vision.analyze', { mimeType: file.type, data: await imageData(file) })).text
      : await extractFile(file);
    if (!text.trim()) throw new Error('No readable text was found in this file.');
    return request('knowledge.ingest', { title: file.name, type: file.type || file.name.split('.').pop(), text, projectId, private: true });
  }

  async function exportAccount() {
    const data = await request('account.export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `twinkle-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 1_000);
    return data;
  }

  async function sync() {
    const actions = ['memory.list', 'projects.list', 'knowledge.list', 'jobs.list', 'usage.get', 'providers.health', 'tools.list', 'tasks.list', 'files.list', 'notes.list'];
    const results = await Promise.allSettled(actions.map((action) => request(action)));
    const value = (index) => results[index].status === 'fulfilled' ? results[index].value : {};
    cache = {
      ...cache,
      memories: value(0).memories || cache.memories,
      projects: value(1).projects || cache.projects,
      sources: value(2).sources || cache.sources,
      jobs: value(3).jobs || cache.jobs,
      usage: value(4).usage || cache.usage,
      providers: value(5).providers || cache.providers,
      tools: value(6).tools || cache.tools,
      tasks: value(7).tasks || cache.tasks,
      files: value(8).files || cache.files,
      notes: value(9).notes || cache.notes,
    };
    document.dispatchEvent(new CustomEvent('twinkle:platform-sync', { detail: cache }));
    return cache;
  }

  function snapshot() { return JSON.parse(JSON.stringify(cache)); }

  return { exportAccount, extractDocx, extractFile, extractPdf, imageData, ingestFile, request, runAgent, snapshot, sync };
})();
