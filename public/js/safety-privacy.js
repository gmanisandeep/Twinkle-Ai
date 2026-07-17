(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SafetyPrivacy = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const CONFIG = Object.freeze({ lastUpdated: '2026-07-17' });
  const LOCAL_KEYS = Object.freeze([
    'twinkle_convs_v2',
    'twinkle_projects_v2',
    'twinkle_memory_v1',
    'twinkle_stats_v1',
    'twinkle_news_cache',
    'twinkle_agent_mode',
    'twinkle_voice_output',
    'twinkle_locale',
    'twinkle_theme_v1',
  ]);
  let panel;
  let destructiveDialog;
  let returnFocus;
  let currentAction;
  let deletionPromise;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  function PrivacySummaryItem({ icon, title, summary, details }) {
    return `<details class="sp-summary-item">
      <summary><span class="sp-icon" aria-hidden="true">${escapeHtml(icon)}</span><span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(summary)}</span></span><span class="sp-chevron" aria-hidden="true"></span></summary>
      <div class="sp-details">${escapeHtml(details)}</div>
    </details>`;
  }

  function DataControls({ signedIn }) {
    if (!signedIn) return `<section class="sp-data-controls" aria-labelledby="sp-controls-title">
      <h2 id="sp-controls-title">Your data controls</h2>
      <p>Sign in to review or use controls for profile data, conversations, projects, memory, and your Twinkle data export.</p>
    </section>`;
    const controls = [
      ['profile', 'Edit profile', 'Review and update the profile details Twinkle uses.'],
      ['conversations', 'Clear conversations', 'Remove saved conversations from this browser.'],
      ['memory', 'Clear saved memory', 'Remove saved memory from this browser and your UID-scoped cloud record.'],
      ['projects', 'Delete projects', 'Open Projects to review and delete projects individually.'],
      ['export', 'Export Twinkle data', 'Download supported UID-scoped cloud records as JSON.'],
    ];
    return `<section class="sp-data-controls" aria-labelledby="sp-controls-title">
      <h2 id="sp-controls-title">Your data controls</h2>
      <div class="sp-control-list">${controls.map(([action, label, help]) => `<div class="sp-control"><span><strong>${label}</strong><small>${help}</small></span><button type="button" class="btn-secondary small" data-sp-action="${action}">${action === 'projects' ? 'Open' : action === 'export' ? 'Export' : action === 'profile' ? 'Edit' : 'Clear'}</button></div>`).join('')}</div>
      <div class="sp-danger-zone">
        <strong>Delete all Twinkle data</strong>
        <p>Delete supported local data and UID-scoped cloud records. Your Google login and Firebase Authentication account will remain.</p>
        <button type="button" class="btn-danger small" data-sp-action="delete-all">Review deletion</button>
      </div>
    </section>`;
  }

  function SafetyPrivacyPanel({ signedIn }) {
    const items = [
      ['👤', 'Your account', 'Google authentication through Firebase identifies your account.', 'Twinkle does not receive or store your Google password. Firebase provides an ID token, which protected server functions verify before accepting AI or account-data requests.'],
      ['🔑', 'Protected AI access', 'AI requests pass through Twinkle’s server-side Netlify Functions.', 'AI provider keys are read from protected server environment variables. They are not stored in frontend JavaScript, HTML, browser storage, client-visible errors, or URLs returned to the browser.'],
      ['🛡️', 'Usage protection', 'Request controls help protect service availability and reduce abuse.', 'Authenticated requests have bounded sizes, allowed-origin checks, per-user rate limits, and provider timeouts. Limits may vary by account, plan, model, or service capacity.'],
      ['📁', 'Your data', 'Twinkle stores only the data needed for its supported personalized features.', 'This browser can store conversations, preferences, projects, memory, and settings. When cloud storage is configured, records such as memory, projects, knowledge, jobs, execution logs, and usage are scoped to the authenticated Firebase UID.'],
      ['⚙️', 'Your control', 'Review, edit, export, and delete supported Twinkle data.', 'Destructive actions require confirmation. Cloud deletion reports any data groups that could not be removed so you can retry. Deleting Twinkle data does not delete your Google login or Firebase Authentication account.'],
      ['⚠️', 'AI awareness', 'AI output may be incomplete or incorrect.', 'Verify important medical, legal, financial, academic, and professional decisions using reliable sources.'],
    ];
    return `<div id="safety-privacy-overlay" class="sp-overlay hidden" aria-hidden="true">
      <section class="sp-panel" role="dialog" aria-modal="true" aria-labelledby="sp-title" aria-describedby="sp-intro" tabindex="-1">
        <header class="sp-header"><div><p class="sp-eyebrow">Settings</p><h1 id="sp-title">Safety &amp; Privacy</h1></div><button type="button" class="sp-close" data-sp-close aria-label="Close Safety and Privacy">×</button></header>
        <div class="sp-scroll"><p id="sp-intro" class="sp-intro">How Twinkle handles account access, AI requests, saved data, and your controls.</p>
          <p class="sp-updated">Last updated: <time datetime="${CONFIG.lastUpdated}">${formatDate(CONFIG.lastUpdated)}</time></p>
          <div class="sp-summary-list">${items.map(([icon, title, summary, details]) => PrivacySummaryItem({ icon, title, summary, details })).join('')}</div>
          ${DataControls({ signedIn })}
          <div id="sp-status" class="sp-status" role="status" aria-live="polite"></div>
        </div>
      </section>
    </div>`;
  }

  function DestructiveActionDialog() {
    return `<div id="sp-destructive-overlay" class="sp-overlay sp-confirm-overlay hidden" aria-hidden="true">
      <section class="sp-confirm" role="alertdialog" aria-modal="true" aria-labelledby="sp-confirm-title" aria-describedby="sp-confirm-copy" tabindex="-1">
        <h2 id="sp-confirm-title"></h2><div id="sp-confirm-copy"></div>
        <label id="sp-confirm-label" class="sp-confirm-label hidden" for="sp-confirm-input">Type <strong>DELETE</strong> to confirm<input id="sp-confirm-input" autocomplete="off" spellcheck="false" /></label>
        <div id="sp-confirm-result" class="sp-confirm-result" role="status" aria-live="polite"></div>
        <div class="sp-confirm-actions"><button type="button" class="btn-secondary" data-sp-cancel>Cancel</button><button type="button" class="btn-danger" data-sp-confirm>Continue</button></div>
      </section>
    </div>`;
  }

  function signedIn() {
    return Boolean(root.Auth?.isSignedIn?.());
  }

  function getFocusable(container) {
    return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], summary, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.closest('.hidden'));
  }

  function trapFocus(event, container) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(container);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && root.document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && root.document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function setBodyLocked(locked) {
    root.document?.body?.classList.toggle('sp-modal-open', locked);
  }

  function open(trigger) {
    if (!root.document) return;
    returnFocus = trigger || root.document.activeElement;
    panel?.remove();
    root.document.body.insertAdjacentHTML('beforeend', SafetyPrivacyPanel({ signedIn: signedIn() }));
    panel = root.document.getElementById('safety-privacy-overlay');
    bindPanel();
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    setBodyLocked(true);
    panel.querySelector('.sp-panel').focus();
  }

  function close() {
    if (!panel || deletionPromise) return;
    closeDestructive();
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    setBodyLocked(false);
    returnFocus?.focus?.();
  }

  function closeDestructive() {
    if (!destructiveDialog || deletionPromise) return;
    destructiveDialog.classList.add('hidden');
    destructiveDialog.setAttribute('aria-hidden', 'true');
    panel?.setAttribute('aria-hidden', 'false');
    currentAction = null;
    panel?.querySelector('.sp-panel')?.focus();
  }

  function showDestructive(action) {
    currentAction = action;
    destructiveDialog?.remove();
    root.document.body.insertAdjacentHTML('beforeend', DestructiveActionDialog());
    destructiveDialog = root.document.getElementById('sp-destructive-overlay');
    const title = destructiveDialog.querySelector('#sp-confirm-title');
    const copy = destructiveDialog.querySelector('#sp-confirm-copy');
    const confirm = destructiveDialog.querySelector('[data-sp-confirm]');
    const label = destructiveDialog.querySelector('#sp-confirm-label');
    if (action === 'delete-all') {
      title.textContent = 'Delete all Twinkle data?';
      copy.innerHTML = '<p>This removes supported conversations, projects, memory, preferences, settings, cached content, and UID-scoped cloud records including knowledge, jobs, execution logs, usage, and audit records.</p><p><strong>Your Google login and Firebase Authentication account will not be deleted.</strong></p>';
      confirm.textContent = 'Continue';
    } else {
      title.textContent = action === 'conversations' ? 'Clear conversations?' : 'Clear saved memory?';
      copy.textContent = action === 'conversations' ? 'Saved conversations will be removed from this browser. This cannot be undone.' : 'Saved memory will be removed from this browser and its UID-scoped cloud collection. This cannot be undone.';
      confirm.textContent = action === 'conversations' ? 'Clear conversations' : 'Clear memory';
    }
    destructiveDialog.classList.remove('hidden');
    destructiveDialog.setAttribute('aria-hidden', 'false');
    panel?.setAttribute('aria-hidden', 'true');
    destructiveDialog.addEventListener('click', (event) => { if (event.target === destructiveDialog) closeDestructive(); });
    destructiveDialog.querySelector('[data-sp-cancel]').addEventListener('click', closeDestructive);
    confirm.addEventListener('click', async () => {
      if (action === 'delete-all' && label.classList.contains('hidden')) {
        label.classList.remove('hidden');
        confirm.textContent = 'Delete Twinkle data';
        confirm.disabled = true;
        destructiveDialog.querySelector('#sp-confirm-input').focus();
        return;
      }
      await performConfirmedAction(action);
    });
    destructiveDialog.querySelector('#sp-confirm-input').addEventListener('input', (event) => { confirm.disabled = event.target.value !== 'DELETE'; });
    destructiveDialog.querySelector('.sp-confirm').focus();
  }

  function removeLocalData(storage, uid) {
    const keys = [...LOCAL_KEYS, `twinkle_prefs_${uid}`, `twinkle_proactive_v1_${uid}`];
    const removed = [];
    const failures = [];
    keys.forEach((key) => {
      try { storage.removeItem(key); removed.push(key); }
      catch (error) { failures.push(key); }
    });
    return { removed, failures };
  }

  async function deleteAllTwinkleData(options = {}) {
    if (deletionPromise) return deletionPromise;
    const platform = options.platform || root.TwinklePlatform;
    const storage = options.storage || root.localStorage;
    const uid = options.uid || root.Auth?.getCurrentUser?.()?.uid || '';
    deletionPromise = (async () => {
      let server;
      let serverError = '';
      try { server = await platform.request('account.delete'); }
      catch (error) { serverError = error?.message || 'Cloud data could not be deleted.'; }
      const local = removeLocalData(storage, uid);
      return { complete: !serverError && server?.complete !== false && local.failures.length === 0, server, serverError, local };
    })();
    try { return await deletionPromise; }
    finally { deletionPromise = null; }
  }

  async function performConfirmedAction(action) {
    const confirm = destructiveDialog.querySelector('[data-sp-confirm]');
    const cancel = destructiveDialog.querySelector('[data-sp-cancel]');
    const resultEl = destructiveDialog.querySelector('#sp-confirm-result');
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.textContent = action === 'delete-all' ? 'Deleting…' : 'Clearing…';
    try {
      if (action === 'conversations') {
        root.localStorage.removeItem('twinkle_convs_v2');
        root.API?.clearHistory?.();
        root.document.dispatchEvent(new CustomEvent('twinkle:data-cleared', { detail: { scope: 'conversations' } }));
        resultEl.textContent = 'Conversations cleared from this browser.';
      } else if (action === 'memory') {
        let serverError = '';
        try { await root.TwinklePlatform.request('memory.clear'); } catch (error) { serverError = error.message; }
        root.localStorage.removeItem('twinkle_memory_v1');
        resultEl.textContent = serverError ? `Browser memory was cleared, but cloud memory was not: ${serverError} You can retry.` : 'Saved memory cleared.';
        if (serverError) throw new Error(serverError);
      } else {
        const result = await deleteAllTwinkleData();
        const failedGroups = result.server?.failures || [];
        if (!result.complete) {
          const details = [result.serverError, failedGroups.length ? `Cloud groups not deleted: ${failedGroups.join(', ')}.` : '', result.local.failures.length ? `Browser items not deleted: ${result.local.failures.length}.` : ''].filter(Boolean).join(' ');
          resultEl.textContent = `Deletion was only partially completed. ${details} You can retry safely.`;
          confirm.textContent = 'Retry deletion';
          confirm.disabled = false;
          cancel.textContent = 'Close';
          cancel.disabled = false;
          return;
        }
        root.API?.clearHistory?.();
        root.document.dispatchEvent(new CustomEvent('twinkle:data-cleared', { detail: { scope: 'all' } }));
        resultEl.textContent = 'Twinkle data was deleted. Your Google login and Firebase Authentication account remain.';
      }
      confirm.classList.add('hidden');
      cancel.textContent = 'Done';
      cancel.disabled = false;
    } catch (error) {
      if (!resultEl.textContent) resultEl.textContent = `This action was only partially completed: ${error.message} You can retry.`;
      confirm.textContent = 'Retry';
      confirm.disabled = false;
      cancel.textContent = 'Close';
      cancel.disabled = false;
    }
  }

  async function handleAction(action) {
    if (action === 'profile') {
      close();
      root.document.getElementById('settings-edit-profile')?.click();
    } else if (action === 'projects') {
      close();
      root.Workspace?.setView?.('projects');
    } else if (action === 'export') {
      const status = panel.querySelector('#sp-status');
      status.textContent = 'Preparing export…';
      try { await root.TwinklePlatform.exportAccount(); status.textContent = 'Your Twinkle data export is ready.'; }
      catch (error) { status.textContent = `Export failed: ${error.message}`; }
    } else showDestructive(action);
  }

  function bindPanel() {
    panel.querySelector('[data-sp-close]').addEventListener('click', close);
    panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
    panel.querySelectorAll('[data-sp-action]').forEach((button) => button.addEventListener('click', () => handleAction(button.dataset.spAction)));
  }

  function handleKeydown(event) {
    if (destructiveDialog && !destructiveDialog.classList.contains('hidden')) {
      if (event.key === 'Escape') closeDestructive();
      trapFocus(event, destructiveDialog);
    } else if (panel && !panel.classList.contains('hidden')) {
      if (event.key === 'Escape') close();
      trapFocus(event, panel);
    }
  }

  function init() {
    if (!root.document || root.document.documentElement.dataset.safetyPrivacyReady) return;
    root.document.documentElement.dataset.safetyPrivacyReady = 'true';
    root.document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-open-safety-privacy]');
      if (trigger) { event.preventDefault(); open(trigger); }
    });
    root.document.addEventListener('keydown', handleKeydown);
  }

  return { CONFIG, LOCAL_KEYS, PrivacySummaryItem, DataControls, SafetyPrivacyPanel, DestructiveActionDialog, deleteAllTwinkleData, init, open, close };
});
