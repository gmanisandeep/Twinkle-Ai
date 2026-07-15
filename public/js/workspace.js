(function initWorkspaceModule(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.Workspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (global) => {
  'use strict';

  const VALID_VIEWS = new Set(['home', 'chat', 'projects', 'memory', 'tasks', 'files', 'automation']);
  let activeView = 'home';
  let initialized = false;

  function escapeHTML(value) {
    if (global?.SafeMarkdown) return global.SafeMarkdown.escapeHTML(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function currentSnapshot() {
    const profile = global?.Auth?.getUserProfile?.() || {};
    const prefs = global?.Auth?.getPrefs?.() || {};
    const projects = global?.Projects?.getAll?.() || [];
    const conversations = global?.Conversations?.getAll?.() || [];
    const memory = global?.Memory?.get?.() || {};
    const stats = global?.Conversations?.stats?.get?.() || {};
    const proactive = profile.uid && global?.Proactive?.getSettings
      ? global.Proactive.getSettings(profile.uid)
      : { enabled: false };
    return { profile, prefs, projects, conversations, memory, stats, proactive };
  }

  function dayGreeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function renderHome(data) {
    const name = escapeHTML(data.prefs.name || data.profile.firstName || 'there');
    const goal = escapeHTML(data.prefs.goal || 'Build momentum around what matters most.');
    const projectCount = data.projects.length;
    const chatCount = data.conversations.length;
    const taskCount = (data.memory.tasks || []).filter(task => !task.done).length;
    const recentActivity = (data.memory.log || []).slice(0, 4);
    const latestProjects = data.projects.slice(0, 3);

    return `
      <div class="workspace-ambient" aria-hidden="true"><span></span><span></span></div>
      <div class="workspace-page home-page">
        <header class="workspace-hero">
          <div class="workspace-kicker"><span class="live-dot"></span> Twinkle intelligence</div>
          <h1>${dayGreeting()}, ${name}.<br><span>What should we move forward?</span></h1>
          <p>${goal}</p>
        </header>

        <section class="home-focus-grid" aria-label="Start working">
          <button class="focus-card focus-card-primary" data-workspace-action="new-chat">
            <span class="focus-card-orb" aria-hidden="true"></span>
            <span class="card-label">AI workspace</span>
            <strong>Think with Twinkle</strong>
            <span>Start a focused conversation with your projects and memory in context.</span>
            <span class="card-cta">Open conversation <b>↗</b></span>
          </button>
          <div class="focus-stack">
            <button class="focus-card compact" data-workspace-action="new-project">
              <span class="card-icon">＋</span>
              <span><strong>New project</strong><small>Create a dedicated operating space</small></span>
              <b>↗</b>
            </button>
            <button class="focus-card compact" data-workspace-target="memory">
              <span class="card-icon">◇</span>
              <span><strong>Review memory</strong><small>See goals, decisions, and context</small></span>
              <b>↗</b>
            </button>
          </div>
        </section>

        <section class="workspace-section" aria-labelledby="pulse-title">
          <div class="section-heading-row">
            <div><span class="section-eyebrow">Today</span><h2 id="pulse-title">Your workspace pulse</h2></div>
            <button class="text-action" data-workspace-target="chat">View conversations →</button>
          </div>
          <div class="pulse-grid">
            <article class="metric-card"><span>Conversations</span><strong>${chatCount}</strong><small>Stored on this device</small></article>
            <article class="metric-card"><span>Active projects</span><strong>${projectCount}</strong><small>Context-ready spaces</small></article>
            <article class="metric-card"><span>Open tasks</span><strong>${taskCount}</strong><small>Captured in memory</small></article>
            <article class="metric-card accent-metric"><span>Proactive mode</span><strong>${data.proactive.enabled ? 'On' : 'Off'}</strong><small>User-controlled check-ins</small></article>
          </div>
        </section>

        <div class="home-detail-grid">
          <section class="workspace-section panel-section" aria-labelledby="projects-title">
            <div class="section-heading-row"><div><span class="section-eyebrow">Spaces</span><h2 id="projects-title">Recent projects</h2></div><button class="text-action" data-workspace-target="projects">View all</button></div>
            <div class="workspace-list">
              ${latestProjects.length ? latestProjects.map(project => `
                <button class="workspace-list-row" data-open-project="${escapeHTML(project.id)}">
                  <span class="project-light" style="--project-color:${escapeHTML(project.color)}"></span>
                  <span><strong>${escapeHTML(project.name)}</strong><small>${escapeHTML(project.description || 'Ready for context and conversation')}</small></span>
                  <b>→</b>
                </button>`).join('') : '<div class="honest-empty"><strong>No projects yet</strong><span>Create one when a goal needs its own context.</span></div>'}
            </div>
          </section>
          <section class="workspace-section panel-section" aria-labelledby="activity-title">
            <div class="section-heading-row"><div><span class="section-eyebrow">Continuity</span><h2 id="activity-title">Memory timeline</h2></div><button class="text-action" data-workspace-target="memory">Open memory</button></div>
            <div class="timeline-list">
              ${recentActivity.length ? recentActivity.map(item => `
                <div class="timeline-row"><span></span><div><strong>${escapeHTML(item.text)}</strong><small>${new Date(item.ts).toLocaleDateString()}</small></div></div>`).join('') : '<div class="honest-empty"><strong>Your timeline is quiet</strong><span>Useful decisions and completed work will appear here.</span></div>'}
            </div>
          </section>
        </div>
      </div>`;
  }

  function renderProjects(data) {
    return renderCollectionPage({
      eyebrow: 'Workspaces',
      title: 'Projects',
      description: 'Each project keeps its conversations and AI context connected.',
      action: '<button class="page-primary-action" data-workspace-action="new-project">＋ New project</button>',
      content: data.projects.length ? `<div class="project-card-grid">${data.projects.map(project => `
        <button class="project-space-card" data-open-project="${escapeHTML(project.id)}">
          <span class="project-space-glow" style="--project-color:${escapeHTML(project.color)}"></span>
          <small>Project space</small><strong>${escapeHTML(project.name)}</strong>
          <p>${escapeHTML(project.description || 'No description yet.')}</p>
          <span>${project.chatIds?.length || 0} linked chats <b>Open →</b></span>
        </button>`).join('')}</div>` : '<div class="large-empty"><span>✦</span><h2>Create your first project space</h2><p>Projects connect goals, conversations, files, tasks, and AI context.</p><button class="page-primary-action" data-workspace-action="new-project">Create project</button></div>'
    });
  }

  function renderMemory(data) {
    const memories = data.memory.log || [];
    const goals = [data.prefs.goal, ...(data.memory.projects || []).map(project => project.name)].filter(Boolean);
    return renderCollectionPage({
      eyebrow: 'Continuity',
      title: 'Memory',
      description: 'A transparent view of what Twinkle remembers on this device.',
      action: '<button class="page-secondary-action" data-workspace-action="open-settings">Memory settings</button>',
      content: `<div class="memory-layout">
        <section class="memory-feature"><span class="memory-orb" aria-hidden="true"></span><small>Current direction</small><h2>${escapeHTML(data.prefs.goal || 'No primary goal set')}</h2><p>Edit your profile to control this context.</p></section>
        <section class="memory-column"><h2>Pinned context</h2>${goals.length ? goals.map(goal => `<div class="memory-note"><span>◇</span><p>${escapeHTML(goal)}</p></div>`).join('') : '<div class="honest-empty"><span>No pinned context yet.</span></div>'}</section>
        <section class="memory-column timeline-column"><h2>Recent timeline</h2>${memories.length ? memories.slice(0, 12).map(item => `<div class="timeline-row"><span></span><div><strong>${escapeHTML(item.text)}</strong><small>${new Date(item.ts).toLocaleString()}</small></div></div>`).join('') : '<div class="honest-empty"><span>Activity will appear as Twinkle completes work.</span></div>'}</section>
      </div>`
    });
  }

  function renderTasks(data) {
    const tasks = data.memory.tasks || [];
    return renderCollectionPage({
      eyebrow: 'Execution',
      title: 'Task center',
      description: 'Tasks captured by Twinkle, organized around active work.',
      action: '<button class="page-primary-action" data-workspace-action="plan-day">Plan with Twinkle</button>',
      content: tasks.length ? `<div class="task-board">${tasks.map(task => `<article class="task-card ${task.done ? 'is-done' : ''}"><span>${task.done ? '✓' : '○'}</span><div><strong>${escapeHTML(task.description)}</strong><small>${escapeHTML(task.domain || 'General')} · ${new Date(task.ts).toLocaleDateString()}</small></div></article>`).join('')}</div>` : '<div class="large-empty"><span>✓</span><h2>No tasks captured yet</h2><p>Ask Twinkle to turn a plan into clear next actions.</p><button class="page-primary-action" data-workspace-action="plan-day">Plan my day</button></div>'
    });
  }

  function renderRoadmapPage(view, data) {
    const page = view === 'files' ? {
      eyebrow: 'Knowledge', title: 'Files', icon: '⌁', description: 'A future home for documents, references, and generated artifacts.', detail: 'The current Twinkle architecture does not store files yet. This surface is intentionally honest until secure upload and preview infrastructure is added.'
    } : {
      eyebrow: 'Systems', title: 'Automation', icon: '⌘', description: 'Proactive routines and repeatable AI workflows.', detail: `Proactive check-ins are currently ${data.proactive.enabled ? 'enabled' : 'disabled'}. A visual automation builder is planned as a separate migration slice.`
    };
    return renderCollectionPage({
      eyebrow: page.eyebrow, title: page.title, description: page.description,
      action: '<button class="page-secondary-action" data-workspace-action="open-settings">Open settings</button>',
      content: `<div class="large-empty roadmap-empty"><span>${page.icon}</span><h2>Foundation ready</h2><p>${escapeHTML(page.detail)}</p><small>Planned for a later verified slice</small></div>`
    });
  }

  function renderCollectionPage({ eyebrow, title, description, action, content }) {
    return `<div class="workspace-ambient" aria-hidden="true"><span></span><span></span></div><div class="workspace-page collection-page"><header class="collection-header"><div><span class="workspace-kicker">${escapeHTML(eyebrow)}</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description)}</p></div>${action}</header>${content}</div>`;
  }

  function renderActiveView() {
    const surface = global?.document?.getElementById('workspace-surface');
    if (!surface || activeView === 'chat') return;
    const data = currentSnapshot();
    if (activeView === 'home') surface.innerHTML = renderHome(data);
    else if (activeView === 'projects') surface.innerHTML = renderProjects(data);
    else if (activeView === 'memory') surface.innerHTML = renderMemory(data);
    else if (activeView === 'tasks') surface.innerHTML = renderTasks(data);
    else surface.innerHTML = renderRoadmapPage(activeView, data);
    bindSurfaceActions(surface);
  }

  function closePanels() {
    global?.document?.getElementById('sidebar-chats')?.classList.remove('mobile-open');
    global?.document?.getElementById('sidebar-tools')?.classList.add('collapsed');
    global?.document?.getElementById('workspace-scrim')?.classList.remove('visible');
  }

  function setView(view, options = {}) {
    activeView = VALID_VIEWS.has(view) ? view : 'home';
    const main = global?.document?.getElementById('main-app');
    if (!main) return activeView;
    main.dataset.workspace = activeView;
    main.querySelectorAll('[data-workspace]').forEach(button => {
      const selected = button.dataset.workspace === activeView;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    closePanels();
    renderActiveView();
    if (activeView === 'chat' && options.focusComposer !== false) {
      global.setTimeout?.(() => global.document.getElementById('chat-input')?.focus(), 60);
    }
    return activeView;
  }

  function bindSurfaceActions(surface) {
    surface.querySelectorAll('[data-workspace-target]').forEach(button => {
      button.addEventListener('click', () => setView(button.dataset.workspaceTarget));
    });
    surface.querySelectorAll('[data-workspace-action]').forEach(button => {
      button.addEventListener('click', () => runAction(button.dataset.workspaceAction));
    });
    surface.querySelectorAll('[data-open-project]').forEach(button => {
      button.addEventListener('click', () => {
        setView('chat', { focusComposer: false });
        const projectItem = global.document.querySelector(`[data-project-id="${button.dataset.openProject}"]`);
        projectItem?.click();
      });
    });
  }

  function runAction(action) {
    if (action === 'new-chat') {
      setView('chat', { focusComposer: false });
      global.document.getElementById('new-chat-btn')?.click();
    } else if (action === 'new-project') {
      global.document.getElementById('new-project-btn')?.click();
    } else if (action === 'open-settings') {
      global.document.getElementById('settings-btn')?.click();
    } else if (action === 'plan-day') {
      setView('chat', { focusComposer: false });
      const input = global.document.getElementById('chat-input');
      if (input) {
        input.value = 'Help me plan my day around my most important goal.';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
    }
  }

  function toggleContextPanel() {
    const panel = global?.document?.getElementById('sidebar-chats');
    const scrim = global?.document?.getElementById('workspace-scrim');
    if (!panel) return;
    const isOpen = panel.classList.toggle('mobile-open');
    scrim?.classList.toggle('visible', isOpen);
  }

  function handleShellClick(event) {
    const target = event.target?.closest?.('#toggle-context-btn, #workspace-scrim, [data-workspace]');
    if (!target) return;
    if (target.id === 'toggle-context-btn') {
      toggleContextPanel();
      return;
    }
    if (target.id === 'workspace-scrim') {
      closePanels();
      return;
    }
    setView(target.dataset.workspace);
  }

  function init() {
    if (initialized || !global?.document) return;
    initialized = true;
    global.document.addEventListener('click', handleShellClick);
    if (global.matchMedia?.('(max-width: 1100px)').matches) {
      global.document.getElementById('sidebar-tools')?.classList.add('collapsed');
    }
    setView('home', { focusComposer: false });
  }

  function refresh() { renderActiveView(); }
  function getActiveView() { return activeView; }

  return { init, setView, refresh, getActiveView, dayGreeting, currentSnapshot };
});
