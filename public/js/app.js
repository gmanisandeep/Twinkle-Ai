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
    API.clearHistory();
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

    const newsList    = document.getElementById('news-list');
    const newsRefresh = document.getElementById('news-refresh-btn');
    News.render(newsList, newsRefresh);
    newsRefresh.addEventListener('click', () => News.render(newsList, newsRefresh, true));
    setInterval(() => News.render(newsList, newsRefresh), 30 * 60 * 1000);
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
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
      charCount.textContent  = `${chatInput.value.length} / 4000`;
      sendBtn.disabled       = !chatInput.value.trim() || _isSending;
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) handleSend();
      }
    });

    sendBtn.addEventListener('click', handleSend);
  }

  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text || _isSending) return;

    _isSending      = true;
    sendBtn.disabled = true;
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
      await API.streamMessage(text, domain.id, {
        onChunk: (chunk) => {
          if (!messageEl) {
            document.getElementById('typing-indicator')?.remove();
            messageEl = UI.renderTwinkleMessage(chunk, domain, true);
          } else {
            UI.updateStreamingBubble(messageEl, chunk);
          }
        },
        onDone: (responseText) => {
          UI.setInputGlow(false);
          if (messageEl) {
            UI.finalizeStreamingBubble(messageEl, responseText);
          } else {
            document.getElementById('typing-indicator')?.remove();
            messageEl = UI.renderTwinkleMessage(responseText, domain, false);
          }

          Conversations.addMessage(_currentConvId, {
            role: 'twinkle', text: responseText, domain: domain.id, time: Date.now()
          });

          if (responseText.includes('✅ TASK SUMMARY')) {
            Conversations.stats.increment('tasks');
          }

          UI.refreshStats();
          renderSidebar();
          _isSending       = false;
          sendBtn.disabled = !chatInput.value.trim();
        },
        onError: (errMsg) => {
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
          _isSending       = false;
          sendBtn.disabled = !chatInput.value.trim();
        },
      });
    } catch (e) {
      UI.setInputGlow(false);
      UI.toast('Unexpected error: ' + e.message, 'error');
      _isSending = false;
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

    settingsOverlay.classList.remove('hidden');
  }

  function initSettings() {
    document.getElementById('settings-close')?.addEventListener('click', () => {
      settingsOverlay.classList.add('hidden');
    });

    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
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
