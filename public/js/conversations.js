/* ═══════════════════════════════════════════════════════════
   TWINKLE v2.0 — CONVERSATIONS MODULE
   Multi-chat storage, grouping, search, categorization
   ═══════════════════════════════════════════════════════════ */

const Conversations = (() => {
  const KEY = 'twinkle_convs_v2';
  const STATS_KEY = 'twinkle_stats_v1';

  const CATEGORY_MAP = {
    coding:    { icon: '💻', label: 'Coding' },
    marketing: { icon: '📣', label: 'Marketing' },
    social:    { icon: '📱', label: 'Social' },
    leads:     { icon: '🎯', label: 'Lead Gen' },
    research:  { icon: '🔍', label: 'Research' },
    analytics: { icon: '📊', label: 'Analytics' },
    reviewing: { icon: '🧾', label: 'Review' },
    content:   { icon: '✍️', label: 'Content' },
    finance:   { icon: '💰', label: 'Finance' },
    designing: { icon: '🎨', label: 'Design' },
    laptop:    { icon: '🖥️', label: 'Laptop' },
    phone:     { icon: '📲', label: 'Phone' },
    general:   { icon: '🤖', label: 'General' }
  };

  function _load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function _save(convs) {
    localStorage.setItem(KEY, JSON.stringify(convs));
  }

  function _genId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  /* Generate a short title from first user message */
  function _autoTitle(text) {
    const clean = text.replace(/hey twinkle[,.]?/i, '').trim();
    const words = clean.split(' ').slice(0, 6).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1) || 'New Chat';
  }

  /* Group conversations by date */
  function _groupByDate(convs) {
    const now = Date.now();
    const ONE_DAY = 86400000;
    const groups = { Today: [], Yesterday: [], 'Last 7 Days': [], Older: [] };

    convs.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach(c => {
      const diff = now - c.updatedAt;
      if (diff < ONE_DAY) groups.Today.push(c);
      else if (diff < 2 * ONE_DAY) groups.Yesterday.push(c);
      else if (diff < 7 * ONE_DAY) groups['Last 7 Days'].push(c);
      else groups.Older.push(c);
    });

    return groups;
  }

  /* Public API */
  return {
    CATEGORY_MAP,

    getAll() { return _load(); },

    get(id) { return _load().find(c => c.id === id) || null; },

    create(projectId = null) {
      const conv = {
        id: _genId(),
        title: 'New Chat',
        category: 'general',
        projectId,
        messages: [],  // { role, text, domain, time }
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      const all = _load();
      all.unshift(conv);
      _save(all);
      return conv;
    },

    save(conv) {
      const all = _load();
      const idx = all.findIndex(c => c.id === conv.id);
      if (idx >= 0) all[idx] = { ...conv, updatedAt: Date.now() };
      else all.unshift({ ...conv, updatedAt: Date.now() });
      _save(all);
    },

    addMessage(id, message) {
      const all = _load();
      const conv = all.find(c => c.id === id);
      if (!conv) return;
      conv.messages.push(message);
      conv.updatedAt = Date.now();
      // Auto title from first user message
      if (conv.title === 'New Chat' && message.role === 'user') {
        conv.title = _autoTitle(message.text);
      }
      // Auto category from domain
      if (message.domain && message.domain !== 'general') {
        conv.category = message.domain;
      }
      _save(all);
      return conv;
    },

    rename(id, title) {
      const all = _load();
      const conv = all.find(c => c.id === id);
      if (conv) { conv.title = title; _save(all); }
    },

    delete(id) {
      const all = _load().filter(c => c.id !== id);
      _save(all);
    },

    search(query) {
      const q = query.toLowerCase();
      return _load().filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some(m => m.text && m.text.toLowerCase().includes(q))
      );
    },

    groupByDate() { return _groupByDate(_load()); },

    searchGrouped(query) {
      if (!query.trim()) return this.groupByDate();
      const results = this.search(query);
      return { Results: results };
    },

    getCategoryInfo(category) {
      return CATEGORY_MAP[category] || CATEGORY_MAP.general;
    },

    /* Stats */
    stats: {
      get() {
        try {
          const raw = localStorage.getItem(STATS_KEY);
          const s = raw ? JSON.parse(raw) : {};
          s.domainsUsed = new Set(s.domainsUsed || []);
          return s;
        } catch { return { domainsUsed: new Set() }; }
      },
      increment(field) {
        try {
          const raw = localStorage.getItem(STATS_KEY);
          const s = raw ? JSON.parse(raw) : {};
          s.domainsUsed = new Set(s.domainsUsed || []);
          if (field === 'messages') s.messages = (s.messages || 0) + 1;
          if (field === 'tasks') s.tasksCompleted = (s.tasksCompleted || 0) + 1;
          localStorage.setItem(STATS_KEY, JSON.stringify({ ...s, domainsUsed: [...s.domainsUsed] }));
        } catch {}
      },
      addDomain(d) {
        try {
          const raw = localStorage.getItem(STATS_KEY);
          const s = raw ? JSON.parse(raw) : {};
          const set = new Set(s.domainsUsed || []);
          set.add(d);
          s.domainsUsed = [...set];
          localStorage.setItem(STATS_KEY, JSON.stringify(s));
        } catch {}
      }
    }
  };
})();
