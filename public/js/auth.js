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
      _authReady = true;
      _readyCallbacks.forEach(cb => cb(null));
      _readyCallbacks = [];
      window.dispatchEvent(new CustomEvent('twinkle:auth-error', { detail: { message: 'Google sign-in is temporarily unavailable. Check your connection and retry.' } }));
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    _auth = firebase.auth();
    _auth.getRedirectResult().catch((error) => {
      window.dispatchEvent(new CustomEvent('twinkle:auth-error', { detail: { message: authErrorMessage(error) } }));
    });

    window.setTimeout(() => {
      if (_authReady) return;
      _authReady = true;
      _readyCallbacks.forEach(cb => cb(null));
      _readyCallbacks = [];
      _changeCallbacks.forEach(cb => cb(null));
      window.dispatchEvent(new CustomEvent('twinkle:auth-error', { detail: { message: 'Sign-in is taking longer than expected. Check your connection and retry.' } }));
    }, 10_000);

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
  function googleProvider() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  function shouldUseRedirect() {
    return Boolean(window.matchMedia?.('(max-width: 720px), (pointer: coarse)').matches);
  }

  function authErrorMessage(error) {
    const messages = {
      'auth/popup-closed-by-user': 'Sign-in was cancelled. You can try again when you’re ready.',
      'auth/cancelled-popup-request': 'Another sign-in window is already open.',
      'auth/network-request-failed': 'The network is unavailable. Check your connection and try again.',
      'auth/unauthorized-domain': 'Google sign-in is not configured for this domain.',
      'auth/operation-not-supported-in-this-environment': 'Google sign-in is unavailable in this browser.',
    };
    return messages[error?.code] || 'Google sign-in could not be completed. Please try again.';
  }

  async function signInWithGoogle({ preferRedirect = shouldUseRedirect() } = {}) {
    if (!_auth) throw new Error('Auth not initialized');
    const provider = googleProvider();
    if (preferRedirect) return _auth.signInWithRedirect(provider);
    try { return await _auth.signInWithPopup(provider); }
    catch (error) {
      if (error?.code === 'auth/popup-blocked') return _auth.signInWithRedirect(provider);
      throw error;
    }
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
    signInWithGoogle, signOut, shouldUseRedirect, authErrorMessage,
    getToken, getCurrentUser, isSignedIn, getUserProfile,
    getPrefs, savePrefs, hasOnboarded,
  };
})();
