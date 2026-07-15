/* ═══════════════════════════════════════════════════════════
   TWINKLE v3.0 — AUTH MODULE
   Firebase Google Authentication + User Preferences
   ═══════════════════════════════════════════════════════════ */

const Auth = (() => {
  /* Your Firebase config */
  const FIREBASE_CONFIG = {
    apiKey:            'AIzaSyDydi4M3K3jt1L4MKomA1FwuUPpE0x2pNk',
    authDomain:        'twinkle-agent.firebaseapp.com',
    projectId:         'twinkle-agent',
    storageBucket:     'twinkle-agent.firebasestorage.app',
    messagingSenderId: '807893178146',
    appId:             '1:807893178146:web:4e8bd56b9fc9d61377777b',
  };

  let _auth            = null;
  let _currentUser     = null;
  let _authReady       = false;
  let _readyCallbacks  = [];   // fire once when auth state first resolves
  let _changeCallbacks = [];   // fire on every subsequent change

  /* ── INIT ──────────────────────────────────────────────── */
  function init() {
    if (!window.firebase) {
      console.error('[Auth] Firebase compat SDK not loaded');
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    _auth = firebase.auth();

    _auth.onAuthStateChanged((user) => {
      _currentUser = user;

      if (!_authReady) {
        _authReady = true;
        _readyCallbacks.forEach(cb => cb(user));
        _readyCallbacks = [];
      }

      _changeCallbacks.forEach(cb => cb(user));
    });
  }

  /* ── LISTENERS ─────────────────────────────────────────── */
  /** Fires exactly once when Firebase resolves the initial auth state. */
  function onReady(callback) {
    if (_authReady) {
      callback(_currentUser);
    } else {
      _readyCallbacks.push(callback);
    }
  }

  /** Fires every time auth state changes (sign in / sign out). */
  function onAuthChange(callback) {
    _changeCallbacks.push(callback);
    if (_authReady) callback(_currentUser);
  }

  /* ── SIGN IN / OUT ─────────────────────────────────────── */
  async function signInWithGoogle() {
    if (!_auth) throw new Error('Auth not initialized');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return _auth.signInWithPopup(provider);
  }

  async function signOut() {
    if (!_auth) return;
    return _auth.signOut();
  }

  /* ── TOKEN ─────────────────────────────────────────────── */
  async function getToken(forceRefresh = false) {
    if (!_currentUser) return null;
    try {
      return await _currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }

  /* ── USER INFO ─────────────────────────────────────────── */
  function getCurrentUser()  { return _currentUser; }
  function isSignedIn()      { return !!_currentUser; }

  function getUserProfile() {
    if (!_currentUser) return null;
    const displayName = _currentUser.displayName || 'User';
    return {
      uid:       _currentUser.uid,
      name:      displayName,
      firstName: displayName.split(' ')[0],
      email:     _currentUser.email,
      photo:     _currentUser.photoURL,
    };
  }

  /* ── USER PREFERENCES (per-UID localStorage) ───────────── */
  const _prefsKey = (uid) => `twinkle_prefs_${uid}`;

  function getPrefs() {
    if (!_currentUser) return {};
    try {
      const raw = localStorage.getItem(_prefsKey(_currentUser.uid));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function savePrefs(patch) {
    if (!_currentUser) return;
    const current = getPrefs();
    localStorage.setItem(
      _prefsKey(_currentUser.uid),
      JSON.stringify({ ...current, ...patch, updatedAt: Date.now() })
    );
  }

  function hasOnboarded() {
    return getPrefs().onboarded === true;
  }

  return {
    init,
    onReady, onAuthChange,
    signInWithGoogle, signOut,
    getToken, getCurrentUser, isSignedIn, getUserProfile,
    getPrefs, savePrefs, hasOnboarded,
  };
})();
