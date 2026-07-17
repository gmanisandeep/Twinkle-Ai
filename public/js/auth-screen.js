(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AuthScreen = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  let inFlight = false;

  function googleButtonHTML() {
    return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg><span>Continue with Google</span>`;
  }

  function init({ auth = root.Auth, document = root.document } = {}) {
    const button = document?.getElementById('google-signin-btn');
    const error = document?.getElementById('login-error');
    if (!button || !error || button.dataset.authReady === 'true') return;
    button.dataset.authReady = 'true';

    const reset = () => {
      inFlight = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = googleButtonHTML();
    };
    const showError = (message) => {
      error.textContent = message;
      error.classList.remove('hidden');
      reset();
      button.focus();
    };

    root.addEventListener?.('twinkle:auth-error', (event) => showError(event.detail?.message || 'Google sign-in could not be completed. Please try again.'));
    button.addEventListener('click', async () => {
      if (inFlight) return;
      inFlight = true;
      const preferRedirect = Boolean(auth.shouldUseRedirect?.());
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = preferRedirect ? 'Redirecting to Google…' : 'Opening Google sign-in…';
      error.classList.add('hidden');
      try {
        await auth.signInWithGoogle({ preferRedirect });
      } catch (authError) {
        showError(auth.authErrorMessage?.(authError) || 'Google sign-in could not be completed. Please try again.');
      }
    });
  }

  function isBusy() { return inFlight; }

  return { googleButtonHTML, init, isBusy };
});
