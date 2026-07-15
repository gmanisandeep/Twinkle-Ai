/* ═══════════════════════════════════════════════════════════
   TWINKLE v2.0 — PROJECTS MODULE
   ═══════════════════════════════════════════════════════════ */

const Projects = (() => {
  const KEY = 'twinkle_projects_v2';

  const COLORS = ['#ffffff','#60a5fa','#34d399','#f472b6','#a78bfa','#fbbf24','#f87171','#38bdf8'];

  function _load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }
  function _save(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
  function _genId() { return 'proj_' + Date.now(); }

  return {
    COLORS,
    getAll() { return _load(); },
    get(id) { return _load().find(p => p.id === id) || null; },

    create(name, description = '', color = '#ffffff') {
      const proj = { id: _genId(), name, description, color, chatIds: [], createdAt: Date.now() };
      const all = _load();
      all.unshift(proj);
      _save(all);
      return proj;
    },

    delete(id) { _save(_load().filter(p => p.id !== id)); },

    linkChat(projectId, chatId) {
      const all = _load();
      const proj = all.find(p => p.id === projectId);
      if (proj && !proj.chatIds.includes(chatId)) {
        proj.chatIds.push(chatId);
        _save(all);
      }
    },

    unlinkChat(projectId, chatId) {
      const all = _load();
      const proj = all.find(p => p.id === projectId);
      if (proj) { proj.chatIds = proj.chatIds.filter(id => id !== chatId); _save(all); }
    },

    getChatsForProject(projectId) {
      const proj = this.get(projectId);
      if (!proj) return [];
      return proj.chatIds;
    },

    /* Returns a context string to inject into system prompt */
    getContext(projectId) {
      const proj = this.get(projectId);
      if (!proj) return '';
      return `\n\n## ACTIVE PROJECT CONTEXT\nProject: ${proj.name}\n${proj.description ? 'Description: ' + proj.description : ''}\nAll responses should be relevant to this project.`;
    }
  };
})();
