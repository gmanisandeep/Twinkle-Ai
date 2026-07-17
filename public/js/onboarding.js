(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TwinkleOnboarding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  let initialized = false;
  let busy = false;
  let selected = new Set();
  let onComplete = () => {};

  function elements(document = root.document) {
    return {
      overlay: document.getElementById('onboarding-overlay'),
      name: document.getElementById('ob-name'),
      goal: document.getElementById('ob-goal'),
      progress: document.getElementById('ob-progress'),
      progressBar: document.getElementById('ob-progress-bar'),
      status: document.getElementById('onboarding-status'),
    };
  }

  function currentPayload(document = root.document) {
    const ui = elements(document);
    return {
      displayName: ui.name?.value.trim() || '',
      focusAreas: [...selected],
      primaryGoal: ui.goal?.value.trim() || '',
    };
  }

  function setStatus(message, error = false, document = root.document) {
    const status = elements(document).status;
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function goToStep(step, { focus = true, document = root.document } = {}) {
    const value = Math.min(3, Math.max(1, Number(step) || 1));
    [1, 2, 3].forEach((index) => document.getElementById(`ob-step-${index}`)?.classList.toggle('hidden', index !== value));
    const ui = elements(document);
    ui.progress?.setAttribute('aria-valuenow', String(value));
    if (ui.progressBar) ui.progressBar.style.width = `${(value / 3) * 100}%`;
    setStatus('', false, document);
    if (focus) {
      const heading = document.querySelector(`#ob-step-${value} h2`);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus();
    }
  }

  async function saveProfile({ step, completed = false, button, document = root.document, platform = root.TwinklePlatform } = {}) {
    if (busy) return null;
    busy = true;
    const previous = button?.textContent;
    if (button) { button.disabled = true; button.textContent = completed ? 'Building your Twinkle…' : 'Saving…'; }
    setStatus('Saving your progress…', false, document);
    try {
      const result = await platform.request('profile.upsert', { ...currentPayload(document), onboardingStep: step, onboardingCompleted: completed });
      setStatus(completed ? 'Your Twinkle is ready.' : 'Progress saved.', false, document);
      return result?.profile || null;
    } catch (error) {
      setStatus('Your progress could not be saved. Check your connection and try again.', true, document);
      return null;
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.textContent = previous; }
    }
  }

  function show(profile = null, { document = root.document, auth = root.Auth } = {}) {
    const ui = elements(document);
    const google = auth.getUserProfile?.() || {};
    const legacy = auth.getPrefs?.() || {};
    ui.name.value = profile?.displayName || legacy.name || google.firstName || '';
    ui.goal.value = profile?.primaryGoal || legacy.goal || '';
    selected = new Set(profile?.focusAreas || legacy.domains || []);
    document.querySelectorAll('.domain-chip').forEach((chip) => {
      const active = selected.has(chip.dataset.domain);
      chip.classList.toggle('selected', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    ui.overlay.classList.remove('hidden');
    goToStep(profile?.onboardingStep || 1, { focus: true, document });
  }

  function hide(document = root.document) { elements(document).overlay?.classList.add('hidden'); }

  function init({ document = root.document, auth = root.Auth, complete = () => {} } = {}) {
    onComplete = complete;
    if (initialized) return;
    initialized = true;
    elements(document).overlay?.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...document.querySelectorAll('#onboarding-overlay button:not([disabled]), #onboarding-overlay input:not([disabled])')]
        .filter((element) => !element.closest?.('.hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.querySelectorAll('.domain-chip').forEach((chip) => chip.addEventListener('click', () => {
      const value = chip.dataset.domain;
      if (selected.has(value)) selected.delete(value); else selected.add(value);
      const active = selected.has(value);
      chip.classList.toggle('selected', active);
      chip.setAttribute('aria-pressed', String(active));
    }));
    const nextOne = document.getElementById('ob-next-1');
    const nextTwo = document.getElementById('ob-next-2');
    const finish = document.getElementById('ob-finish');
    nextOne?.addEventListener('click', async () => {
      if (!elements(document).name.value.trim()) { elements(document).name.focus(); setStatus('Enter the name Twinkle should use.', true, document); return; }
      if (await saveProfile({ step: 2, button: nextOne, document })) goToStep(2, { document });
    });
    nextTwo?.addEventListener('click', async () => {
      if (await saveProfile({ step: 3, button: nextTwo, document })) goToStep(3, { document });
    });
    finish?.addEventListener('click', async () => {
      if (!elements(document).goal.value.trim()) { elements(document).goal.focus(); setStatus('Add the main goal you want Twinkle to help with.', true, document); return; }
      const profile = await saveProfile({ step: 3, completed: true, button: finish, document });
      if (!profile) return;
      auth.savePrefs?.({ name: profile.displayName, goal: profile.primaryGoal, domains: profile.focusAreas, onboarded: true });
      hide(document);
      onComplete(profile);
    });
    elements(document).name?.addEventListener('keydown', (event) => { if (event.key === 'Enter') nextOne?.click(); });
    elements(document).goal?.addEventListener('keydown', (event) => { if (event.key === 'Enter') finish?.click(); });
  }

  function isBusy() { return busy; }

  return { currentPayload, goToStep, hide, init, isBusy, saveProfile, show };
});
