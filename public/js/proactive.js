/* TWINKLE — PROACTIVE CHECK-IN ENGINE
   Creates bounded, local-first check-ins without background model spend. */

const Proactive = (() => {
  const STORAGE_PREFIX = 'twinkle_proactive_v1_';
  const DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    quietStartHour: 22,
    quietEndHour: 8,
    idleMinutes: 25,
    returnAfterHours: 4,
    cooldownHours: 4,
    dailyLimit: 2,
  });

  let _timer = null;
  let _activityHandler = null;
  let _pageHideHandler = null;
  let _lastActivityAt = Date.now();

  function _storageKey(uid) {
    return `${STORAGE_PREFIX}${uid}`;
  }

  function _dayKey(now) {
    const date = new Date(now);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function _defaultState(now = Date.now()) {
    return {
      ...DEFAULT_CONFIG,
      dayKey: _dayKey(now),
      deliveriesToday: 0,
      lastDeliveredAt: 0,
      lastSeenAt: 0,
    };
  }

  function _normalizeState(input = {}, now = Date.now()) {
    const state = { ..._defaultState(now), ...input };
    if (state.dayKey !== _dayKey(now)) {
      state.dayKey = _dayKey(now);
      state.deliveriesToday = 0;
    }
    return state;
  }

  function _load(uid, now = Date.now()) {
    if (!uid || typeof localStorage === 'undefined') return _defaultState(now);
    try {
      const raw = localStorage.getItem(_storageKey(uid));
      return _normalizeState(raw ? JSON.parse(raw) : {}, now);
    } catch {
      return _defaultState(now);
    }
  }

  function _save(uid, state) {
    if (!uid || typeof localStorage === 'undefined') return;
    localStorage.setItem(_storageKey(uid), JSON.stringify(state));
  }

  function _isQuietHour(now, state) {
    const hour = new Date(now).getHours();
    const start = state.quietStartHour;
    const end = state.quietEndHour;
    return start > end ? hour >= start || hour < end : hour >= start && hour < end;
  }

  function _safeInline(value, fallback = '') {
    const clean = String(value || fallback)
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 160);
    return clean
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _greeting(now) {
    const hour = new Date(now).getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function _message(kind, context, now, awayHours = 0) {
    const name = _safeInline(context.name, 'there');
    const goal = _safeInline(context.goal);
    const goalLine = goal
      ? ` Your current goal is **${goal}**.`
      : '';

    if (kind === 'welcome') {
      return `${_greeting(now)}, ${name}. I can check in without waiting for you to message first.${goalLine} What would make today a win?`;
    }

    if (kind === 'return') {
      const duration = awayHours >= 24
        ? `${Math.floor(awayHours / 24)} day${awayHours >= 48 ? 's' : ''}`
        : `${Math.max(1, Math.floor(awayHours))} hours`;
      return `Welcome back, ${name}. You have been away for about ${duration}.${goalLine} Should we choose the next concrete step?`;
    }

    if (kind === 'daily') {
      return `${_greeting(now)}, ${name}. Quick check-in:${goalLine} What is the single most important outcome for today?`;
    }

    return `Still with you, ${name}. It has been quiet for a while.${goalLine} Want me to help you decide the next step?`;
  }

  function planCheckIn({ context = {}, state: inputState = {}, reason = 'session', now = Date.now(), lastActivityAt = now }) {
    const state = _normalizeState(inputState, now);
    if (!state.enabled || _isQuietHour(now, state)) return null;
    if (state.deliveriesToday >= state.dailyLimit) return null;

    const cooldownMs = state.cooldownHours * 60 * 60 * 1000;
    if (state.lastDeliveredAt && now - state.lastDeliveredAt < cooldownMs) return null;

    let kind = null;
    let awayHours = 0;

    if (reason === 'session') {
      if (!state.lastSeenAt) {
        kind = 'welcome';
      } else {
        awayHours = (now - state.lastSeenAt) / (60 * 60 * 1000);
        const isNewDay = _dayKey(state.lastSeenAt) !== _dayKey(now);
        if (awayHours >= state.returnAfterHours) kind = 'return';
        else if (isNewDay) kind = 'daily';
      }
    } else if (reason === 'idle') {
      const idleMs = state.idleMinutes * 60 * 1000;
      if (now - lastActivityAt >= idleMs) kind = 'idle';
    }

    if (!kind) return null;
    return {
      id: `checkin_${kind}_${now}`,
      kind,
      title: 'Twinkle check-in',
      text: _message(kind, context, now, awayHours),
      createdAt: now,
    };
  }

  function getSessionCheckIn(uid, context, now = Date.now()) {
    const state = _load(uid, now);
    const checkIn = planCheckIn({ context, state, reason: 'session', now });
    state.lastSeenAt = now;
    _save(uid, state);
    return checkIn;
  }

  function recordDelivery(uid, checkIn, now = Date.now()) {
    if (!checkIn) return;
    const state = _load(uid, now);
    state.lastDeliveredAt = now;
    state.deliveriesToday += 1;
    state.lastSeenAt = now;
    _save(uid, state);
  }

  function touchSeen(uid, now = Date.now()) {
    const state = _load(uid, now);
    state.lastSeenAt = now;
    _save(uid, state);
  }

  function getSettings(uid) {
    return _load(uid);
  }

  function setEnabled(uid, enabled) {
    const state = _load(uid);
    state.enabled = Boolean(enabled);
    _save(uid, state);
    return state.enabled;
  }

  function startIdleMonitor({ uid, getContext, onCheckIn, intervalMs = 60_000 }) {
    stop();
    if (!uid || typeof window === 'undefined') return;

    _lastActivityAt = Date.now();
    _activityHandler = () => { _lastActivityAt = Date.now(); };
    ['pointerdown', 'keydown', 'scroll', 'focus'].forEach(eventName => {
      window.addEventListener(eventName, _activityHandler, { passive: true });
    });

    _pageHideHandler = () => touchSeen(uid);
    window.addEventListener('pagehide', _pageHideHandler);

    _timer = window.setInterval(() => {
      const now = Date.now();
      touchSeen(uid, now);
      const state = _load(uid, now);
      const checkIn = planCheckIn({
        context: typeof getContext === 'function' ? getContext() : {},
        state,
        reason: 'idle',
        now,
        lastActivityAt: _lastActivityAt,
      });
      if (!checkIn || typeof onCheckIn !== 'function') return;
      const delivered = onCheckIn(checkIn);
      if (delivered !== false) _lastActivityAt = now;
    }, intervalMs);
  }

  function stop() {
    if (typeof window !== 'undefined') {
      if (_timer) window.clearInterval(_timer);
      if (_activityHandler) {
        ['pointerdown', 'keydown', 'scroll', 'focus'].forEach(eventName => {
          window.removeEventListener(eventName, _activityHandler);
        });
      }
      if (_pageHideHandler) window.removeEventListener('pagehide', _pageHideHandler);
    }
    _timer = null;
    _activityHandler = null;
    _pageHideHandler = null;
  }

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.requestPermission();
  }

  function notify(checkIn) {
    if (!checkIn || typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    if (typeof document !== 'undefined' && !document.hidden) return false;
    new Notification('Twinkle', { body: checkIn.text.replace(/\*\*/g, '') });
    return true;
  }

  return {
    DEFAULT_CONFIG,
    planCheckIn,
    getSessionCheckIn,
    recordDelivery,
    touchSeen,
    getSettings,
    setEnabled,
    startIdleMonitor,
    stop,
    requestNotificationPermission,
    notify,
  };
})();
