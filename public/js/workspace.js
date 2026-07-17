(function initWorkspaceModule(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.Workspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (global) => {
  'use strict';

  const VALID_VIEWS = new Set(['home', 'chat', 'projects', 'memory', 'tasks', 'files', 'automation']);
  let activeView = 'home';
  let initialized = false;
  let arrivalGreeting = false;

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
    const platform = global?.TwinklePlatform?.snapshot?.() || {};
    return { profile, prefs, projects, conversations, memory, stats, proactive, platform };
  }

  function dayGreeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function starterActions(focusAreas = []) {
    const focus = new Set(focusAreas);
    const actions = [];
    if (focus.has('career') || focus.has('learning')) actions.push(['Build a learning roadmap', 'Build a practical learning roadmap for my primary goal.']);
    if (focus.has('business') || focus.has('freelancing')) actions.push(['Create my first plan', 'Turn my primary goal into a clear, realistic first plan.']);
    if (focus.has('research')) actions.push(['Research an idea', 'Help me research an idea connected to my primary goal.']);
    if (focus.has('content')) actions.push(['Plan my next piece', 'Create a focused content plan connected to my primary goal.']);
    if (focus.has('coding') || focus.has('personal-projects')) actions.push(['Start a project', 'Help me define and start a project for my primary goal.']);
    if (focus.has('productivity')) actions.push(['Plan my next actions', 'Turn my primary goal into the next three useful actions.']);
    const defaults = [
      ['Create my first plan', 'Turn my primary goal into a clear, realistic first plan.'],
      ['Start a project', 'Help me define and start a project for my primary goal.'],
      ['Research an idea', 'Help me research an idea connected to my primary goal.'],
      ['Build a learning roadmap', 'Build a practical learning roadmap for my primary goal.'],
    ];
    for (const item of defaults) if (!actions.some(([label]) => label === item[0])) actions.push(item);
    return actions.slice(0, 4);
  }

  function renderHome(data) {
    const name = escapeHTML(data.prefs.name || data.profile.firstName || 'there');
    const goal = escapeHTML(data.prefs.goal || 'Build momentum around what matters most.');
    const projectCount = data.projects.length;
    const chatCount = data.conversations.length;
    const taskCount = (data.memory.tasks || []).filter(task => !task.done).length;
    const recentActivity = (data.memory.log || []).slice(0, 4);
    const latestProjects = data.projects.slice(0, 3);
    const starters = starterActions(data.prefs.domains || []);
    const greeting = arrivalGreeting
      ? `Welcome, ${name}.<br><span>Let’s turn your goal into a plan.</span>`
      : `${dayGreeting()}, ${name}.<br><span>What should we move forward?</span>`;

    return `
      <div class="workspace-ambient" aria-hidden="true"><span></span><span></span></div>
      <div class="workspace-page home-page">
        <header class="workspace-hero">
          <div class="workspace-kicker"><span class="live-dot"></span> Twinkle intelligence</div>
          <h1>${greeting}</h1>
          <p>${goal}</p>
          <div class="starter-actions" aria-label="Suggested first actions">
            ${starters.map(([label, prompt]) => `<button type="button" data-starter-prompt="${escapeHTML(prompt)}">${escapeHTML(label)}</button>`).join('')}
          </div>
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
    const remoteMemories = (data.platform.memories || []).map(item => ({ id: item.id, text: item.text, ts: item.createdAt || item.updatedAt, remote: true }));
    const memories = [...remoteMemories, ...(data.memory.log || [])];
    const goals = [data.prefs.goal, ...(data.memory.projects || []).map(project => project.name)].filter(Boolean);
    return renderCollectionPage({
      eyebrow: 'Continuity',
      title: 'Memory',
      description: 'A transparent view of what Twinkle remembers on this device.',
      action: '<button class="page-primary-action" data-workspace-action="add-memory">Add memory</button>',
      content: `<div class="memory-layout">
        <section class="memory-feature"><span class="memory-orb" aria-hidden="true"></span><small>Current direction</small><h2>${escapeHTML(data.prefs.goal || 'No primary goal set')}</h2><p>Edit your profile to control this context.</p></section>
        <section class="memory-column"><h2>Pinned context</h2>${goals.length ? goals.map(goal => `<div class="memory-note"><span>◇</span><p>${escapeHTML(goal)}</p></div>`).join('') : '<div class="honest-empty"><span>No pinned context yet.</span></div>'}</section>
        <section class="memory-column timeline-column"><h2>Recent timeline</h2>${memories.length ? memories.slice(0, 12).map(item => `<div class="timeline-row"><span></span><div><strong>${escapeHTML(item.text)}</strong><small>${new Date(item.ts).toLocaleString()}</small>${item.remote ? `<button class="text-action" data-delete-memory="${escapeHTML(item.id)}">Delete</button>` : ''}</div></div>`).join('') : '<div class="honest-empty"><span>Activity will appear as Twinkle completes work.</span></div>'}</section>
      </div>`
    });
  }

  function renderTasks(data) {
    const tasks = [...(data.platform.tasks || []), ...(data.memory.tasks || [])];
    return renderCollectionPage({
      eyebrow: 'Execution',
      title: 'Task center',
      description: 'Tasks captured by Twinkle, organized around active work.',
      action: '<button class="page-primary-action" data-workspace-action="plan-day">Plan with Twinkle</button>',
      content: tasks.length ? `<div class="task-board">${tasks.map(task => `<article class="task-card ${task.done ? 'is-done' : ''}"><span>${task.done ? '✓' : '○'}</span><div><strong>${escapeHTML(task.description)}</strong><small>${escapeHTML(task.domain || 'General')} · ${new Date(task.ts).toLocaleDateString()}</small></div></article>`).join('')}</div>` : '<div class="large-empty"><span>✓</span><h2>No tasks captured yet</h2><p>Ask Twinkle to turn a plan into clear next actions.</p><button class="page-primary-action" data-workspace-action="plan-day">Plan my day</button></div>'
    });
  }

  function renderRoadmapPage(view, data) {
    if (view === 'files') {
      const sources = data.platform.sources || [];
      return renderCollectionPage({
        eyebrow: 'Knowledge', title: 'Files', description: 'Private project sources searchable by Twinkle with citations.',
        action: '<button class="page-primary-action" data-workspace-action="upload-file">Upload file</button>',
        content: sources.length ? `<div class="project-card-grid">${sources.map(source => `<article class="project-space-card"><small>${escapeHTML(source.type || 'document')}</small><strong>${escapeHTML(source.title)}</strong><p>${Number(source.size || 0).toLocaleString()} bytes · ${new Date(source.createdAt || source.updatedAt).toLocaleDateString()}</p><span>Searchable knowledge</span></article>`).join('')}</div>` : '<div class="large-empty"><span>⌁</span><h2>No knowledge sources yet</h2><p>Upload PDF, DOCX, text, CSV, notes, or source code. Twinkle stores extracted text, not the original file.</p><button class="page-primary-action" data-workspace-action="upload-file">Upload a source</button></div>'
      });
    }
    const jobs = data.platform.jobs || [];
    return renderCollectionPage({
      eyebrow: 'Systems', title: 'Automation', description: 'Scheduled goals with explicit tool approvals and execution logs.',
      action: '<button class="page-primary-action" data-workspace-action="new-automation">New automation</button>',
      content: jobs.length ? `<div class="task-board">${jobs.map(job => `<article class="task-card"><span>${job.enabled ? '↻' : '○'}</span><div><strong>${escapeHTML(job.name)}</strong><small>${escapeHTML(job.goal)} · next ${job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : 'manual'}</small></div></article>`).join('')}</div>` : '<div class="large-empty"><span>⌘</span><h2>No scheduled agents</h2><p>Create a recurring goal. Away-from-browser execution requires the configured persistent worker.</p><button class="page-primary-action" data-workspace-action="new-automation">Create automation</button></div>'
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
    surface.querySelectorAll('[data-starter-prompt]').forEach(button => {
      button.addEventListener('click', () => {
        setView('chat', { focusComposer: false });
        const input = global.document.getElementById('chat-input');
        if (!input) return;
        input.value = button.dataset.starterPrompt;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
    });
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
    surface.querySelectorAll('[data-delete-memory]').forEach(button => {
      button.addEventListener('click', () => {
        if (!global.confirm?.('Delete this memory?')) return;
        global.TwinklePlatform?.request?.('memory.delete', { id: button.dataset.deleteMemory })
          .then(() => global.TwinklePlatform.sync()).then(() => refresh()).catch((error) => global.UI?.toast?.(error.message, 'error'));
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
    } else if (action === 'upload-file') {
      global.document.getElementById('knowledge-file-input')?.click();
    } else if (action === 'new-automation') {
      const name = global.prompt?.('Automation name:');
      if (!name) return;
      const goal = global.prompt?.('What should Twinkle accomplish?');
      if (!goal) return;
      const minutes = Number(global.prompt?.('Repeat every how many minutes? Minimum 15.', '1440')) || 1440;
      global.TwinklePlatform?.request?.('jobs.upsert', { name, goal, schedule: { type: 'interval', minutes }, enabled: true })
        .then(() => global.TwinklePlatform.sync()).then(() => refresh()).catch((error) => global.UI?.toast?.(error.message, 'error'));
    } else if (action === 'add-memory') {
      const text = global.prompt?.('What should Twinkle remember?');
      if (!text) return;
      global.TwinklePlatform?.request?.('memory.upsert', { text, category: 'user', pinned: true })
        .then(() => global.TwinklePlatform.sync()).then(() => refresh()).catch((error) => global.UI?.toast?.(error.message, 'error'));
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
    global.document.addEventListener('twinkle:platform-sync', () => renderActiveView());
    if (global.matchMedia?.('(max-width: 1100px)').matches) {
      global.document.getElementById('sidebar-tools')?.classList.add('collapsed');
    }
    setView('home', { focusComposer: false });
  }

  function refresh() { renderActiveView(); }
  function setArrival(value = true) { arrivalGreeting = Boolean(value); }
  function getActiveView() { return activeView; }

  return { init, setView, refresh, setArrival, getActiveView, dayGreeting, currentSnapshot, starterActions };
});
