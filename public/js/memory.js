/* ═══════════════════════════════════════════════════════════
   TWINKLE — MEMORY MODULE
   Persistent memory via localStorage
   ═══════════════════════════════════════════════════════════ */

const Memory = (() => {
  const KEY = 'twinkle_memory_v1';
  const STATS_KEY = 'twinkle_stats_v1';

  function _load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : _defaults();
    } catch { return _defaults(); }
  }

  function _save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function _defaults() {
    return {
      projects: [],
      preferences: [],
      log: [],
      tasks: [],
      lastSession: null,
      pendingReminders: []
    };
  }

  function _loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      return raw ? JSON.parse(raw) : { messages: 0, tasksCompleted: 0, domainsUsed: new Set(), memoryItems: 0 };
    } catch { return { messages: 0, tasksCompleted: 0, domainsUsed: [], memoryItems: 0 }; }
  }

  function _saveStats(s) {
    const toSave = { ...s, domainsUsed: [...s.domainsUsed] };
    localStorage.setItem(STATS_KEY, JSON.stringify(toSave));
  }

  /* PUBLIC API */
  return {
    get() { return _load(); },

    addProject(name, status = 'active') {
      const data = _load();
      const exists = data.projects.find(p => p.name === name);
      if (!exists) {
        data.projects.push({ name, status, createdAt: Date.now() });
        _save(data);
      }
    },

    addPreference(key, value) {
      const data = _load();
      const idx = data.preferences.findIndex(p => p.key === key);
      if (idx >= 0) data.preferences[idx].value = value;
      else data.preferences.push({ key, value });
      _save(data);
    },

    log(entry) {
      const data = _load();
      data.log.unshift({ text: entry, ts: Date.now() });
      if (data.log.length > 80) data.log = data.log.slice(0, 80);
      _save(data);
    },

    addTask(description, domain) {
      const data = _load();
      data.tasks.push({ description, domain, ts: Date.now(), done: false });
      _save(data);
    },

    markTaskDone(idx) {
      const data = _load();
      if (data.tasks[idx]) data.tasks[idx].done = true;
      _save(data);
    },

    setLastSession() {
      const data = _load();
      data.lastSession = Date.now();
      _save(data);
    },

    addReminder(text, dueMs) {
      const data = _load();
      data.pendingReminders.push({ text, dueMs });
      _save(data);
    },

    getPendingReminders() {
      const data = _load();
      const now = Date.now();
      return data.pendingReminders.filter(r => r.dueMs <= now);
    },

    clearAll() {
      localStorage.removeItem(KEY);
      localStorage.removeItem(STATS_KEY);
    },

    /* Stats */
    stats: {
      get() {
        const s = _loadStats();
        s.domainsUsed = new Set(s.domainsUsed || []);
        return s;
      },
      increment(field) {
        const s = _loadStats();
        s.domainsUsed = new Set(s.domainsUsed || []);
        if (field === 'messages') s.messages = (s.messages || 0) + 1;
        if (field === 'tasks') s.tasksCompleted = (s.tasksCompleted || 0) + 1;
        _saveStats({ ...s, domainsUsed: [...s.domainsUsed] });
      },
      addDomain(domain) {
        const s = _loadStats();
        const set = new Set(s.domainsUsed || []);
        set.add(domain);
        s.domainsUsed = [...set];
        _saveStats(s);
      },
      updateMemoryCount(count) {
        const s = _loadStats();
        s.memoryItems = count;
        _saveStats(s);
      }
    }
  };
})();
