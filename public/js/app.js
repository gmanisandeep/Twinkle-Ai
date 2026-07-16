/* ═══════════════════════════════════════════════════════════
   TWINKLE v3.0 — APP MODULE
   Auth-aware boot sequence, onboarding, conversation flow
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── STATE ──────────────────────────────────────────────── */
  let _currentConvId   = null;
  let _activeProjectId = null;
  let _isSending       = false;
  let _activeController = null;

  /* ── ELEMENTS ───────────────────────────────────────────── */
  const authLoading      = document.getElementById('auth-loading');
  const loginScreen      = document.getElementById('login-screen');
  const onboardingOverlay = document.getElementById('onboarding-overlay');
  const bootScreen       = document.getElementById('boot-screen');
  const mainApp          = document.getElementById('main-app');
  const chatInput        = document.getElementById('chat-input');
  const sendBtn          = document.getElementById('send-btn');
  const charCount        = document.getElementById('char-count');
  const chatMessages     = document.getElementById('chat-messages');
  const settingsOverlay  = document.getElementById('settings-overlay');
  const permOverlay      = document.getElementById('permission-overlay');
  const projectOverlay   = document.getElementById('project-overlay');
  const phoneOverlay     = document.getElementById('phone-overlay');

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT — wait for Firebase auth to resolve
  ══════════════════════════════════════════════════════════ */
  function start() {
    Auth.init();

    Auth.onReady((user) => {
      authLoading.classList.add('hidden');

      if (!user) {
        showLoginScreen();
      } else {
        afterSignIn(user);
      }
    });

    // Listen for ongoing auth changes (sign in / sign out after initial load)
    Auth.onAuthChange((user) => {
      if (!user) {
        // Signed out — reset everything and show login
        hideAllScreens();
        showLoginScreen();
        resetAppState();
      }
    });
  }

  function hideAllScreens() {
    [loginScreen, onboardingOverlay, bootScreen, mainApp].forEach(el => {
      el?.classList.add('hidden');
    });
  }

  function resetAppState() {
    _currentConvId   = null;
    _activeProjectId = null;
    _isSending       = false;
    _activeController?.abort();
    _activeController = null;
    API.clearHistory();
    if (typeof Proactive !== 'undefined') Proactive.stop();
    if (chatMessages) chatMessages.innerHTML = '';
  }

  /* ══════════════════════════════════════════════════════════
     LOGIN SCREEN
  ══════════════════════════════════════════════════════════ */
  function showLoginScreen() {
    loginScreen.classList.remove('hidden');
    initLoginScreen();
  }

  function initLoginScreen() {
    const btn      = document.getElementById('google-signin-btn');
    const errorEl  = document.getElementById('login-error');

    if (btn._initialized) return;
    btn._initialized = true;

    btn.addEventListener('click', async () => {
      btn.disabled    = true;
      btn.textContent = 'Signing in…';
      errorEl.classList.add('hidden');

      try {
        await Auth.signInWithGoogle();
        // onReady / onAuthChange will handle the transition
      } catch (e) {
        errorEl.textContent = e.code === 'auth/popup-closed-by-user'
          ? 'Sign-in cancelled.'
          : `Sign-in failed: ${e.message}`;
        errorEl.classList.remove('hidden');
        btn.disabled    = false;
        btn.innerHTML   = googleBtnHTML();
      }
    });
  }

  function googleBtnHTML() {
    return `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg> Continue with Google`;
  }

  /* ══════════════════════════════════════════════════════════
     AFTER SIGN IN — onboarding check → boot
  ══════════════════════════════════════════════════════════ */
  function afterSignIn(user) {
    loginScreen.classList.add('hidden');

    if (!Auth.hasOnboarded()) {
      showOnboarding();
    } else {
      runBootSequence();
    }
  }

  /* ══════════════════════════════════════════════════════════
     ONBOARDING (3 steps)
  ══════════════════════════════════════════════════════════ */
  function showOnboarding() {
    const profile = Auth.getUserProfile();

    // Pre-fill name from Google account
    const nameInput = document.getElementById('ob-name');
    if (nameInput && profile?.firstName) nameInput.value = profile.firstName;

    onboardingOverlay.classList.remove('hidden');
    initOnboarding();
  }

  function initOnboarding() {
    if (onboardingOverlay._initialized) return;
    onboardingOverlay._initialized = true;

    const selectedDomains = new Set();
    let obName = '';
    let obGoal = '';

    /* Step 1 → 2 */
    document.getElementById('ob-next-1').addEventListener('click', () => {
      const val = document.getElementById('ob-name').value.trim();
      if (!val) { document.getElementById('ob-name').focus(); return; }
      obName = val;
      goToStep(2);
    });
    document.getElementById('ob-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('ob-next-1').click();
    });

    /* Step 2 → 3 */
    document.getElementById('ob-next-2').addEventListener('click', () => {
      obGoal = document.getElementById('ob-goal').value.trim() || 'achieve my goals';
      goToStep(3);
    });
    document.getElementById('ob-goal').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('ob-next-2').click();
    });

    /* Domain chips */
    document.querySelectorAll('.domain-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const d = chip.dataset.domain;
        if (selectedDomains.has(d)) {
          selectedDomains.delete(d);
          chip.classList.remove('selected');
        } else {
          selectedDomains.add(d);
          chip.classList.add('selected');
        }
      });
    });

    /* Finish */
    document.getElementById('ob-finish').addEventListener('click', () => {
      Auth.savePrefs({
        name:      obName,
        goal:      obGoal,
        domains:   Array.from(selectedDomains),
        onboarded: true,
      });
      onboardingOverlay.classList.add('hidden');
      runBootSequence();
    });
  }

  function goToStep(n) {
    [1, 2, 3].forEach(i => {
      document.getElementById(`ob-step-${i}`)?.classList.toggle('hidden', i !== n);
      document.getElementById(`ob-dot-${i}`)?.classList.toggle('active', i === n);
    });
  }

  /* ══════════════════════════════════════════════════════════
     BOOT SEQUENCE
  ══════════════════════════════════════════════════════════ */
  function runBootSequence() {
    bootScreen.classList.remove('hidden');

    const msgEl  = document.getElementById('boot-message');
    const profile = Auth.getUserProfile();
    const prefs   = Auth.getPrefs();
    const name    = prefs.name || profile?.firstName || 'there';

    const lines = [
      '> Initializing Twinkle v3.0…',
      '> Loading your conversation history…',
      '> Connecting to AI backend…',
      '> Activating domain intelligence…',
      `> All systems ready. Welcome back, ${name}.`,
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        msgEl.textContent += (i > 0 ? '\n' : '') + lines[i++];
      } else {
        clearInterval(interval);
      }
    }, 340);

    setTimeout(() => setStatus('status-memory', 'ok'),   400);
    setTimeout(() => setStatus('status-ai',     'ok'),   800);
    setTimeout(() => setStatus('status-tools',  'warn'), 1200);
    setTimeout(() => document.getElementById('boot-enter').classList.remove('hidden'), 1900);

    const enterBtn = document.getElementById('boot-enter');
    const handler = () => {
      enterBtn.removeEventListener('click', handler);
      bootScreen.classList.add('hidden');
      mainApp.classList.remove('hidden');
      initApp();
    };
    enterBtn.addEventListener('click', handler);
  }

  function setStatus(id, state) {
    const dot = document.querySelector(`#${id} .status-dot`);
    if (dot) dot.className = `status-dot ${state}`;
  }

  /* ══════════════════════════════════════════════════════════
     APP INIT
  ══════════════════════════════════════════════════════════ */
  function initApp() {
    if (typeof I18n !== 'undefined') I18n.apply();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    updateTopbarUser();
    UI.startClock();
    UI.renderToolsGrid();
    UI.initScrollButton();

    initChatInput();
    renderSidebar();
    initSettings();
    initTopbar();
    initPhoneModal();
    initProjectModal();

    loadOrCreateConversation();
    initProactiveCheckIns();
    if (typeof Workspace !== 'undefined') Workspace.init();
    if (typeof TwinklePlatform !== 'undefined') {
      TwinklePlatform.sync().then(() => Workspace?.refresh?.()).catch(() => {});
      TwinklePlatform.request('jobs.runDue').then(() => TwinklePlatform.sync()).catch(() => {});
    }

    const newsList    = document.getElementById('news-list');
    const newsRefresh = document.getElementById('news-refresh-btn');
    News.render(newsList, newsRefresh);
    newsRefresh.addEventListener('click', () => News.render(newsList, newsRefresh, true));
    setInterval(() => News.render(newsList, newsRefresh), 30 * 60 * 1000);
  }

  /* ── PROACTIVE CHECK-INS ───────────────────────────────── */
  function getProactiveContext() {
    const profile = Auth.getUserProfile();
    const prefs = Auth.getPrefs();
    return {
      name: prefs.name || profile?.firstName || 'there',
      goal: prefs.goal || '',
      conversationCount: Conversations.getAll().length,
    };
  }

  function deliverProactiveCheckIn(checkIn) {
    if (!checkIn || _isSending) return false;
    const profile = Auth.getUserProfile();
    if (!profile) return false;

    let conv = Conversations.get(_currentConvId);
    if (!conv || conv.messages.length > 0) {
      conv = Conversations.create(null);
      _currentConvId = conv.id;
      _activeProjectId = null;
      chatMessages.innerHTML = '';
      API.clearHistory();
      updateProjectLabel();
    } else {
      document.getElementById('empty-chat-state')?.remove();
    }

    Conversations.rename(conv.id, checkIn.title);
    UI.renderTwinkleMessage(checkIn.text, {
      id: 'general', label: 'Check-in', icon: '✨', color: 'general'
    }, false);
    Conversations.addMessage(conv.id, {
      role: 'twinkle',
      text: checkIn.text,
      domain: 'general',
      time: checkIn.createdAt,
      proactive: true,
      proactiveKind: checkIn.kind,
    });

    const updated = Conversations.get(conv.id);
    API.loadHistory(updated?.messages || []);
    Proactive.recordDelivery(profile.uid, checkIn);
    Proactive.notify(checkIn);
    renderSidebar();
    return true;
  }

  function initProactiveCheckIns() {
    if (typeof Proactive === 'undefined') return;
    const profile = Auth.getUserProfile();
    if (!profile) return;

    const sessionCheckIn = Proactive.getSessionCheckIn(profile.uid, getProactiveContext());
    if (sessionCheckIn) {
      setTimeout(() => deliverProactiveCheckIn(sessionCheckIn), 700);
    }

    Proactive.startIdleMonitor({
      uid: profile.uid,
      getContext: getProactiveContext,
      onCheckIn: deliverProactiveCheckIn,
    });
  }

  /* ══════════════════════════════════════════════════════════
     TOPBAR USER PROFILE
  ══════════════════════════════════════════════════════════ */
  function updateTopbarUser() {
    const profile = Auth.getUserProfile();
    const prefs   = Auth.getPrefs();
    if (!profile) return;

    const displayName = prefs.name || profile.firstName;
    const photo       = profile.photo;

    const nameEl   = document.getElementById('user-name-topbar');
    const avatarEl = document.getElementById('user-avatar-img');

    if (nameEl)   nameEl.textContent = displayName;
    if (avatarEl && photo) {
      avatarEl.src = photo;
      avatarEl.alt = displayName;
    } else if (avatarEl) {
      avatarEl.style.display = 'none';
    }

    // Sub-label
    const labelEl = document.getElementById('active-project-label');
    if (labelEl) labelEl.textContent = `for ${displayName}`;
  }

  /* ══════════════════════════════════════════════════════════
     CONVERSATION MANAGEMENT
  ══════════════════════════════════════════════════════════ */
  function loadOrCreateConversation(convId = null) {
    const all = Conversations.getAll();

    if (convId) {
      const conv = Conversations.get(convId);
      if (conv) { openConversation(conv); return; }
    }

    if (all.length > 0) {
      openConversation(all[0]);
    } else {
      const conv = Conversations.create(_activeProjectId);
      _currentConvId = conv.id;
      chatMessages.innerHTML = '';
      UI.renderEmptyState();
    }
    renderSidebar();
  }

  function openConversation(conv) {
    if (!conv) return;
    _currentConvId   = conv.id;
    _activeProjectId = conv.projectId;
    updateProjectLabel();

    chatMessages.innerHTML = '';
    if (conv.messages.length === 0) {
      UI.renderEmptyState();
    } else {
      conv.messages.forEach(msg => {
        if (msg.role === 'user') {
          UI.renderUserMessage(msg.text);
        } else {
          const domainObj = Domains.getAll().find(d => d.id === msg.domain)
            || { id: 'general', label: 'General', icon: '🤖', color: 'general' };
          UI.renderTwinkleMessage(msg.text, domainObj, false);
        }
      });
      UI.scrollToBottom();
    }

    API.clearHistory();
    API.loadHistory(conv.messages);
    renderSidebar();
  }

  function startNewChat(projectId = null) {
    API.clearHistory();
    const conv = Conversations.create(projectId || _activeProjectId);
    _currentConvId = conv.id;
    chatMessages.innerHTML = '';
    UI.renderEmptyState();
    renderSidebar();
    chatInput.focus();
  }

  function updateProjectLabel() {
    const labelEl = document.getElementById('active-project-label');
    if (!labelEl) return;
    if (_activeProjectId) {
      const proj = Projects.get(_activeProjectId);
      const prefs = Auth.getPrefs();
      const name  = prefs.name || Auth.getUserProfile()?.firstName || '';
      labelEl.textContent = proj ? `📁 ${proj.name}` : `for ${name}`;
    } else {
      const prefs = Auth.getPrefs();
      const name  = prefs.name || Auth.getUserProfile()?.firstName || '';
      labelEl.textContent = name ? `for ${name}` : '';
    }
  }

  /* ══════════════════════════════════════════════════════════
     SIDEBAR RENDERING
  ══════════════════════════════════════════════════════════ */
  function renderSidebar() {
    renderProjectsList();
    renderChatHistory();
    UI.refreshStats();
    if (typeof Workspace !== 'undefined') Workspace.refresh();
  }

  function renderProjectsList() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    const projects = Projects.getAll();

    if (projects.length === 0) {
      container.innerHTML = '<div class="sidebar-empty" style="padding:6px 14px;font-size:11px;">No projects yet</div>';
      return;
    }

    container.innerHTML = projects.map(proj => {
      const chatCount = proj.chatIds?.length || 0;
      const isActive  = _activeProjectId === proj.id;
      return `
        <div class="project-item ${isActive ? 'active' : ''}" data-project-id="${proj.id}">
          <span class="project-dot" style="background:${escHTML(proj.color)}"></span>
          <span class="project-name">${escHTML(proj.name)}</span>
          <span class="project-count">${chatCount}</span>
          <button class="chat-item-action" data-delete-project="${proj.id}" title="Delete">✕</button>
        </div>`;
    }).join('');

    container.querySelectorAll('.project-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.dataset.deleteProject) {
          e.stopPropagation();
          const pid = e.target.dataset.deleteProject;
          if (confirm(`Delete project "${Projects.get(pid)?.name}"?`)) {
            Projects.delete(pid);
            TwinklePlatform?.request?.('projects.delete', { id: pid }).then(() => TwinklePlatform.sync()).catch(() => {});
            if (_activeProjectId === pid) { _activeProjectId = null; updateProjectLabel(); }
            renderSidebar();
          }
          return;
        }
        _activeProjectId = el.dataset.projectId;
        updateProjectLabel();
        startNewChat(el.dataset.projectId);
      });
    });
  }

  function renderChatHistory(query = '') {
    const container = document.getElementById('chat-history-list');
    if (!container) return;

    const groups = query
      ? Conversations.searchGrouped(query)
      : Conversations.groupByDate();

    let html = '';
    let hasAny = false;

    for (const [groupName, convs] of Object.entries(groups)) {
      if (!convs.length) continue;
      hasAny = true;
      html += `<div class="chat-group"><div class="chat-group-label">${groupName}</div>`;
      html += convs.map(conv => {
        const cat      = Conversations.getCategoryInfo(conv.category);
        const isActive = conv.id === _currentConvId;
        return `
          <div class="chat-item ${isActive ? 'active' : ''}" data-conv-id="${conv.id}">
            <span class="chat-item-icon">${cat.icon}</span>
            <span class="chat-item-title">${escHTML(conv.title)}</span>
            <div class="chat-item-actions">
              <button class="chat-item-action" data-rename-conv="${conv.id}" title="Rename">✏️</button>
              <button class="chat-item-action" data-delete-conv="${conv.id}" title="Delete">🗑</button>
            </div>
          </div>`;
      }).join('');
      html += '</div>';
    }

    if (!hasAny) html = '<div class="sidebar-empty">No chats yet.<br>Start a new conversation!</div>';
    container.innerHTML = html;

    container.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const renameId = e.target.dataset.renameConv;
        const deleteId = e.target.dataset.deleteConv;

        if (renameId) {
          e.stopPropagation();
          const conv     = Conversations.get(renameId);
          const newTitle = prompt('Rename chat:', conv?.title || '');
          if (newTitle?.trim()) { Conversations.rename(renameId, newTitle.trim()); renderSidebar(); }
          return;
        }
        if (deleteId) {
          e.stopPropagation();
          if (confirm('Delete this chat?')) {
            Conversations.delete(deleteId);
            if (_currentConvId === deleteId) startNewChat();
            else renderSidebar();
          }
          return;
        }
        openConversation(Conversations.get(el.dataset.convId));
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CHAT INPUT
  ══════════════════════════════════════════════════════════ */
  function initChatInput() {
    const agentModeBtn = document.getElementById('agent-mode-btn');
    const privateModeBtn = document.getElementById('private-mode-btn');
    const voiceBtn = document.getElementById('voice-input-btn');
    const voiceOutputBtn = document.getElementById('voice-output-btn');
    const uploadBtn = document.getElementById('knowledge-upload-btn');
    const fileInput = document.getElementById('knowledge-file-input');
    if (agentModeBtn) {
      agentModeBtn.setAttribute('aria-pressed', localStorage.getItem('twinkle_agent_mode') === 'true' ? 'true' : 'false');
      agentModeBtn.addEventListener('click', () => {
        const enabled = agentModeBtn.getAttribute('aria-pressed') !== 'true';
        agentModeBtn.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem('twinkle_agent_mode', String(enabled));
        UI.toast(enabled ? 'Agent mode enabled' : 'Chat mode enabled', 'info');
      });
    }
    privateModeBtn?.addEventListener('click', () => {
      const enabled = privateModeBtn.getAttribute('aria-pressed') !== 'true';
      privateModeBtn.setAttribute('aria-pressed', String(enabled));
      UI.toast(enabled ? 'Private execution enabled for the next agent run' : 'Private execution disabled', 'info');
    });
    voiceBtn?.addEventListener('click', async () => {
      Voice.stopSpeaking();
      if (voiceBtn.classList.contains('is-listening')) {
        Voice.stopListening();
        return;
      }
      try {
        const transcript = await Voice.listen({
          onState: (state) => voiceBtn.classList.toggle('is-listening', state === 'listening'),
          onTranscript: (text) => {
            chatInput.value = text;
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          },
        });
        if (transcript) chatInput.focus();
      } catch (error) { UI.toast(error.message, 'error'); }
    });
    if (voiceOutputBtn) {
      voiceOutputBtn.setAttribute('aria-pressed', localStorage.getItem('twinkle_voice_output') === 'true' ? 'true' : 'false');
      voiceOutputBtn.addEventListener('click', () => {
        const enabled = voiceOutputBtn.getAttribute('aria-pressed') !== 'true';
        voiceOutputBtn.setAttribute('aria-pressed', String(enabled));
        localStorage.setItem('twinkle_voice_output', String(enabled));
        if (!enabled) Voice.stopSpeaking();
        UI.toast(enabled ? 'Spoken replies enabled' : 'Spoken replies disabled', 'info');
      });
    }
    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      uploadBtn.disabled = true;
      try {
        const result = await TwinklePlatform.ingestFile(file, _activeProjectId || '');
        UI.toast(`${file.name} added as ${result.chunkCount} searchable section(s).`, 'success');
        if (typeof Workspace !== 'undefined') Workspace.refresh();
      } catch (error) { UI.toast(error.message, 'error'); }
      finally { uploadBtn.disabled = false; fileInput.value = ''; }
    });

    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
      charCount.textContent  = `${chatInput.value.length} / 4000`;
      sendBtn.disabled       = _isSending ? false : !chatInput.value.trim();
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) handleSend();
      }
    });

    sendBtn.addEventListener('click', () => {
      if (_isSending) {
        _activeController?.abort();
      } else {
        handleSend();
      }
    });

    document.addEventListener('twinkle:regenerate', (event) => {
      if (_isSending) {
        UI.toast('Stop the current response before regenerating.', 'info');
        return;
      }
      regenerateResponse(event.detail?.responseText || '');
    });
  }

  function setComposerSending(sending) {
    _isSending = sending;
    sendBtn.classList.toggle('is-stopping', sending);
    sendBtn.disabled = sending ? false : !chatInput.value.trim();
    sendBtn.setAttribute('aria-label', sending ? 'Stop generating' : 'Send message');
    sendBtn.title = sending ? 'Stop generating' : 'Send message';
    sendBtn.innerHTML = sending
      ? '<span class="stop-icon" aria-hidden="true"></span>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22 11 13 2 9l20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function regenerateResponse(responseText) {
    const conv = Conversations.get(_currentConvId);
    if (!conv || !responseText) return;
    let assistantIndex = -1;
    for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
      if (conv.messages[i].role === 'twinkle' && conv.messages[i].text === responseText) {
        assistantIndex = i;
        break;
      }
    }
    if (assistantIndex < 1 || conv.messages[assistantIndex - 1]?.role !== 'user') {
      UI.toast('The original prompt for this response is unavailable.', 'error');
      return;
    }
    const prompt = conv.messages[assistantIndex - 1].text;
    conv.messages = conv.messages.slice(0, assistantIndex - 1);
    Conversations.save(conv);
    openConversation(conv);
    chatInput.value = prompt;
    chatInput.dispatchEvent(new Event('input'));
    handleSend();
  }

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || _isSending) return;

    setComposerSending(true);
    _activeController = new AbortController();
    chatInput.value  = '';
    chatInput.style.height = 'auto';
    charCount.textContent  = '0 / 4000';

    const domain = (typeof Domains !== 'undefined')
      ? Domains.detect(text)
      : { id: 'general', label: 'General', icon: '🤖', color: 'general' };

    UI.setDomainIndicator(domain);
    Conversations.stats.addDomain(domain.id);
    Conversations.stats.increment('messages');

    UI.renderUserMessage(text);
    Conversations.addMessage(_currentConvId, { role: 'user', text, domain: domain.id, time: Date.now() });

    UI.renderTyping();
    UI.setInputGlow(true);

    let messageEl = null;

    try {
      const agentMode = document.getElementById('agent-mode-btn')?.getAttribute('aria-pressed') === 'true';
      if (agentMode) {
        const execution = await TwinklePlatform.runAgent(text, {
          projectId: _activeProjectId || '',
          privacy: Auth.getPrefs().modelPrivacy || 'cloud',
          temporary: document.getElementById('private-mode-btn')?.getAttribute('aria-pressed') === 'true',
          signal: _activeController.signal,
          onProgress: (state) => UI.setThinkingPhase(state.status === 'awaiting_approval' ? 'approval' : 'thinking'),
          onApproval: (pending) => Permission.request(
            `${pending.permission === 'dangerous' ? 'Confirm' : 'Allow'} ${pending.tool}`,
            pending.rationale || `Twinkle wants to use ${pending.tool} with the shown arguments.`,
          ),
        });
        document.getElementById('typing-indicator')?.remove();
        UI.setInputGlow(false);
        const responseText = execution.answer || execution.error || `Agent stopped with status: ${execution.status}.`;
        if (document.getElementById('voice-output-btn')?.getAttribute('aria-pressed') === 'true') Voice.speak(responseText);
        messageEl = UI.renderTwinkleMessage(responseText, domain, false);
        Conversations.addMessage(_currentConvId, {
          role: 'twinkle', text: responseText, domain: domain.id, time: Date.now(),
          provider: execution.provider, model: execution.model, executionId: execution.id, verification: execution.verification,
        });
        const wasPrivate = document.getElementById('private-mode-btn')?.getAttribute('aria-pressed') === 'true';
        if (!wasPrivate) Memory.log(`Agent ${execution.status}: ${text.slice(0, 120)}`);
        if (wasPrivate) {
          const conversation = Conversations.get(_currentConvId);
          if (conversation?.messages?.at(-1)?.executionId === execution.id) {
            conversation.messages = conversation.messages.slice(0, -2);
            Conversations.save(conversation);
          }
        }
        document.getElementById('private-mode-btn')?.setAttribute('aria-pressed', 'false');
        UI.refreshStats();
        renderSidebar();
        _activeController = null;
        setComposerSending(false);
        return;
      }
      await API.streamMessage(text, domain.id, {
        signal: _activeController.signal,
        onPhase: (phase) => UI.setThinkingPhase(phase),
        onChunk: (chunk, delta) => {
          if (document.getElementById('voice-output-btn')?.getAttribute('aria-pressed') === 'true' && delta) Voice.enqueue(delta);
          if (!messageEl) {
            document.getElementById('typing-indicator')?.remove();
            messageEl = UI.renderTwinkleMessage(chunk, domain, true);
          } else {
            UI.updateStreamingBubble(messageEl, chunk);
          }
        },
        onDone: (responseText, meta = {}) => {
          if (document.getElementById('voice-output-btn')?.getAttribute('aria-pressed') === 'true') Voice.flush();
          UI.setInputGlow(false);
          if (messageEl) {
            UI.finalizeStreamingBubble(messageEl, responseText, { cancelled: meta.cancelled });
          } else if (responseText) {
            document.getElementById('typing-indicator')?.remove();
            messageEl = UI.renderTwinkleMessage(responseText, domain, false);
          } else {
            document.getElementById('typing-indicator')?.remove();
            if (meta.cancelled) UI.toast('Generation stopped.', 'info');
          }

          if (responseText) {
            Conversations.addMessage(_currentConvId, {
              role: 'twinkle', text: responseText, domain: domain.id, time: Date.now(),
              provider: meta.provider || null, model: meta.model || null, cancelled: Boolean(meta.cancelled)
            });
          }

          if (responseText.includes('✅ TASK SUMMARY')) {
            Conversations.stats.increment('tasks');
          }

          UI.refreshStats();
          renderSidebar();
          _activeController = null;
          setComposerSending(false);
        },
        onError: (errMsg) => {
          Voice.stopSpeaking();
          UI.setInputGlow(false);
          document.getElementById('typing-indicator')?.remove();
          const errEl = document.createElement('div');
          errEl.className = 'message twinkle-message';
          errEl.innerHTML = `
            <div class="message-inner">
              <div class="message-avatar">T</div>
              <div class="message-body">
                <div class="message-meta">
                  <span class="message-name">Twinkle</span>
                  <span class="domain-badge general">⚠ Error</span>
                </div>
                <div class="message-content-text" style="color:var(--red);">${UI.escapeHTML(errMsg)}</div>
              </div>
            </div>`;
          chatMessages.appendChild(errEl);
          UI.scrollToBottom();
          _activeController = null;
          setComposerSending(false);
        },
      });
    } catch (e) {
      UI.setInputGlow(false);
      UI.toast('Unexpected error: ' + e.message, 'error');
      _activeController = null;
      setComposerSending(false);
    }
  }

  /* ══════════════════════════════════════════════════════════
     TOPBAR
  ══════════════════════════════════════════════════════════ */
  function initTopbar() {
    document.getElementById('new-chat-btn')?.addEventListener('click', () => startNewChat());

    document.getElementById('toggle-tools-btn')?.addEventListener('click', () => {
      document.getElementById('sidebar-tools')?.classList.toggle('collapsed');
    });

    document.getElementById('clear-chat-btn')?.addEventListener('click', async () => {
      const ok = await Permission.request('Clear current chat', 'All messages in this conversation will be removed.');
      if (ok) {
        chatMessages.innerHTML = '';
        API.clearHistory();
        const conv = Conversations.get(_currentConvId);
        if (conv) { conv.messages = []; Conversations.save(conv); }
        UI.renderEmptyState();
      }
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
      openSettings();
    });

    document.getElementById('signout-btn')?.addEventListener('click', async () => {
      if (confirm('Sign out of Twinkle?')) Auth.signOut();
    });

    const searchInput = document.getElementById('chat-search');
    searchInput?.addEventListener('input', (e) => renderChatHistory(e.target.value));

    document.getElementById('new-project-btn')?.addEventListener('click', () => {
      document.getElementById('project-name-input').value = '';
      document.getElementById('project-desc-input').value = '';
      projectOverlay.classList.remove('hidden');
    });

    document.getElementById('connect-phone-btn')?.addEventListener('click', () => {
      phoneOverlay.classList.remove('hidden');
    });
  }

  /* ══════════════════════════════════════════════════════════
     SETTINGS
  ══════════════════════════════════════════════════════════ */
  function openSettings() {
    const profile = Auth.getUserProfile();
    const prefs   = Auth.getPrefs();

    const nameEl  = document.getElementById('settings-account-name');
    const emailEl = document.getElementById('settings-account-email');
    const avaEl   = document.getElementById('settings-avatar');

    if (nameEl)  nameEl.textContent  = prefs.name || profile?.name || '';
    if (emailEl) emailEl.textContent = profile?.email || '';
    if (avaEl && profile?.photo) { avaEl.src = profile.photo; avaEl.alt = profile.name; }

    const proactiveToggle = document.getElementById('proactive-enabled');
    const proactiveStatus = document.getElementById('proactive-status');
    const themeSelect = document.getElementById('theme-select');
    const languageSelect = document.getElementById('language-select');
    const privacySelect = document.getElementById('model-privacy-select');
    if (themeSelect && typeof Theme !== 'undefined') {
      themeSelect.value = Theme.getPreference();
    }
    if (languageSelect && typeof I18n !== 'undefined') languageSelect.value = I18n.locale();
    if (privacySelect) privacySelect.value = prefs.modelPrivacy === 'local' ? 'local' : 'cloud';
    if (proactiveToggle && profile && typeof Proactive !== 'undefined') {
      proactiveToggle.checked = Proactive.getSettings(profile.uid).enabled;
    }
    if (proactiveStatus) {
      const notificationState = typeof Notification === 'undefined'
        ? 'unsupported'
        : Notification.permission;
      proactiveStatus.textContent = `Quiet hours: 10 PM–8 AM · Maximum 2 check-ins/day · Notifications: ${notificationState}`;
    }

    settingsOverlay.classList.remove('hidden');
  }

  function initSettings() {
    document.getElementById('settings-close')?.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });

    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
    });

    document.getElementById('theme-select')?.addEventListener('change', (e) => {
      if (typeof Theme === 'undefined') return;
      Theme.setPreference(e.target.value);
      UI.toast(`Appearance set to ${e.target.options[e.target.selectedIndex].text}`, 'success');
    });

    document.getElementById('language-select')?.addEventListener('change', (e) => {
      if (typeof I18n === 'undefined') return;
      I18n.setLocale(e.target.value);
      I18n.apply();
      UI.toast('Language preference saved.', 'success');
    });

    document.getElementById('model-privacy-select')?.addEventListener('change', (e) => {
      Auth.savePrefs({ modelPrivacy: e.target.value === 'local' ? 'local' : 'cloud' });
      UI.toast(e.target.value === 'local' ? 'Local-model mode enabled' : 'Cloud-provider mode enabled', 'success');
    });

    document.getElementById('proactive-enabled')?.addEventListener('change', (e) => {
      const profile = Auth.getUserProfile();
      if (!profile || typeof Proactive === 'undefined') return;
      Proactive.setEnabled(profile.uid, e.target.checked);
      UI.toast(e.target.checked ? 'Proactive check-ins enabled' : 'Proactive check-ins paused', 'success');
    });

    document.getElementById('proactive-notifications')?.addEventListener('click', async () => {
      if (typeof Proactive === 'undefined') return;
      const result = await Proactive.requestNotificationPermission();
      const status = document.getElementById('proactive-status');
      if (status) status.textContent = `Quiet hours: 10 PM–8 AM · Maximum 2 check-ins/day · Notifications: ${result}`;
      UI.toast(result === 'granted' ? 'Browser notifications enabled' : 'Notifications were not enabled', result === 'granted' ? 'success' : 'error');
    });

    // Test connection
    const testBtn    = document.getElementById('settings-test-api');
    const testResult = document.getElementById('settings-test-result');
    testBtn?.addEventListener('click', async () => {
      testBtn.textContent  = '⏳ Testing…';
      testBtn.disabled     = true;
      testResult.style.display = 'none';

      const result = await API.testConnection();

      testBtn.textContent  = '🔌 Run Test';
      testBtn.disabled     = false;
      testResult.style.display = 'block';
      testResult.style.color   = result.ok ? 'var(--green)' : 'var(--red)';
      testResult.textContent   = result.msg;
    });

    // Edit profile → re-show onboarding
    document.getElementById('settings-edit-profile')?.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
      onboardingOverlay._initialized = false; // allow re-init
      showOnboarding();
    });

    document.getElementById('settings-export-data')?.addEventListener('click', async () => {
      try {
        await TwinklePlatform.exportAccount();
        UI.toast('Your Twinkle data export is ready.', 'success');
      } catch (error) { UI.toast(error.message, 'error'); }
    });

    document.getElementById('settings-delete-account-data')?.addEventListener('click', async () => {
      const allowed = await Permission.request('Delete server data', 'This permanently deletes server-side memory, projects, knowledge, jobs, usage records, and execution logs for your account.');
      if (!allowed) return;
      try {
        await TwinklePlatform.request('account.delete');
        UI.toast('Server-side Twinkle data deleted.', 'success');
        if (typeof Workspace !== 'undefined') Workspace.refresh();
      } catch (error) { UI.toast(error.message, 'error'); }
    });

    // Clear memory
    document.getElementById('settings-clear-memory')?.addEventListener('click', async () => {
      const ok = await Permission.request('Clear all data', 'This will delete all chats and projects permanently.');
      if (ok) {
        localStorage.removeItem('twinkle_convs_v2');
        localStorage.removeItem('twinkle_projects_v2');
        localStorage.removeItem('twinkle_stats_v1');
        localStorage.removeItem('twinkle_news_cache');
        API.clearHistory();
        _currentConvId   = null;
        _activeProjectId = null;
        loadOrCreateConversation();
        UI.toast('All data cleared', 'success');
        settingsOverlay.classList.add('hidden');
      }
    });

    // Sign out
    document.getElementById('settings-signout')?.addEventListener('click', async () => {
      settingsOverlay.classList.add('hidden');
      if (confirm('Sign out of Twinkle?')) Auth.signOut();
    });
  }

  /* ══════════════════════════════════════════════════════════
     PROJECT MODAL
  ══════════════════════════════════════════════════════════ */
  function initProjectModal() {
    document.getElementById('project-modal-close')?.addEventListener('click', () => {
      projectOverlay.classList.add('hidden');
    });
    projectOverlay.addEventListener('click', (e) => {
      if (e.target === projectOverlay) projectOverlay.classList.add('hidden');
    });

    const colorsEl = document.getElementById('project-colors');
    let selectedColor = Projects.COLORS[0];

    if (colorsEl) {
      Projects.COLORS.forEach((color, i) => {
        const dot = document.createElement('div');
        dot.className = 'color-dot' + (i === 0 ? ' selected' : '');
        dot.style.background = color;
        dot.dataset.color    = color;
        dot.addEventListener('click', () => {
          colorsEl.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
          dot.classList.add('selected');
          selectedColor = color;
        });
        colorsEl.appendChild(dot);
      });
    }

    document.getElementById('project-create-btn')?.addEventListener('click', () => {
      const name = document.getElementById('project-name-input').value.trim();
      const desc = document.getElementById('project-desc-input').value.trim();
      if (!name) { UI.toast('Enter a project name', 'error'); return; }

      const proj       = Projects.create(name, desc, selectedColor);
      TwinklePlatform?.request?.('projects.upsert', { id: proj.id, name, description: desc, color: selectedColor }).then(() => TwinklePlatform.sync()).catch(() => {});
      _activeProjectId = proj.id;
      updateProjectLabel();
      projectOverlay.classList.add('hidden');
      startNewChat(proj.id);
      UI.toast(`Project "${name}" created`, 'success');
    });
  }

  /* ══════════════════════════════════════════════════════════
     PHONE MODAL
  ══════════════════════════════════════════════════════════ */
  function initPhoneModal() {
    document.getElementById('phone-modal-close')?.addEventListener('click', () => {
      phoneOverlay.classList.add('hidden');
    });
    document.getElementById('phone-check-btn')?.addEventListener('click', () => {
      const result = document.getElementById('phone-adb-result');
      result.classList.remove('hidden');
      result.textContent = 'ADB bridge requires Node.js backend (Phase 2). Not yet active.';
    });
  }

  /* ── HELPERS ────────────────────────────────────────────── */
  function escHTML(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;');
  }

  /* ── START ──────────────────────────────────────────────── */
  start();

})();
