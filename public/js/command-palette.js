(function initCommandPalette(global) {
  'use strict';

  const commands = [
    { label: 'Go to Home', hint: 'Workspace', keywords: 'dashboard today', run: () => global.Workspace?.setView('home') },
    { label: 'Open Chat', hint: 'Workspace', keywords: 'conversation assistant', run: () => global.Workspace?.setView('chat') },
    { label: 'Open Projects', hint: 'Workspace', keywords: 'folders work', run: () => global.Workspace?.setView('projects') },
    { label: 'Open Memory', hint: 'Workspace', keywords: 'knowledge context', run: () => global.Workspace?.setView('memory') },
    { label: 'Open Tasks', hint: 'Workspace', keywords: 'todo actions', run: () => global.Workspace?.setView('tasks') },
    { label: 'Open Files', hint: 'Workspace', keywords: 'documents uploads', run: () => global.Workspace?.setView('files') },
    { label: 'Open Automation', hint: 'Workspace', keywords: 'agents schedules', run: () => global.Workspace?.setView('automation') },
    { label: 'Start a new chat', hint: 'Action', keywords: 'compose conversation', run: () => global.document.getElementById('new-chat-btn')?.click() },
    { label: 'Create a project', hint: 'Action', keywords: 'new folder', run: () => global.document.getElementById('new-project-btn')?.click() },
    { label: 'Open Settings', hint: 'Action', keywords: 'preferences account', run: () => global.document.getElementById('settings-btn')?.click() },
    { label: 'Focus message composer', hint: 'Action', keywords: 'prompt type', run: () => { global.Workspace?.setView('chat', { focusComposer: false }); global.document.getElementById('chat-input')?.focus(); } },
    { label: 'Switch appearance', hint: 'Theme', keywords: 'light dark amoled system', run: cycleTheme },
  ];

  let overlay;
  let input;
  let list;
  let activeIndex = 0;
  let visibleCommands = commands;
  let previousFocus = null;

  function cycleTheme() {
    if (!global.Theme) return;
    const themes = ['system', 'light', 'dark', 'amoled'];
    const next = themes[(themes.indexOf(global.Theme.getPreference()) + 1) % themes.length];
    global.Theme.setPreference(next);
    const select = global.document.getElementById('theme-select');
    if (select) select.value = next;
    global.UI?.toast(`Appearance: ${next}`, 'success');
  }

  function searchable(command) {
    return `${command.label} ${command.hint} ${command.keywords || ''}`.toLowerCase();
  }

  function filterCommands(query) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return commands.filter(command => terms.every(term => searchable(command).includes(term)));
  }

  function render() {
    list.innerHTML = visibleCommands.length
      ? visibleCommands.map((command, index) => `
          <button class="command-item${index === activeIndex ? ' active' : ''}" role="option"
            aria-selected="${index === activeIndex}" data-command-index="${index}">
            <span>${command.label}</span><small>${command.hint}</small>
          </button>`).join('')
      : '<div class="command-empty">No matching command</div>';
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }

  function close() {
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    input.value = '';
    visibleCommands = commands;
    activeIndex = 0;
    previousFocus?.focus?.();
  }

  function open() {
    if (!overlay) return;
    previousFocus = global.document.activeElement;
    overlay.classList.remove('hidden');
    visibleCommands = commands;
    activeIndex = 0;
    render();
    global.requestAnimationFrame(() => input.focus());
  }

  function runActive() {
    const command = visibleCommands[activeIndex];
    if (!command) return;
    close();
    command.run();
  }

  function init() {
    overlay = global.document.createElement('div');
    overlay.className = 'command-overlay hidden';
    overlay.id = 'command-palette';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <section class="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <h2 id="command-title" class="sr-only">Command palette</h2>
        <div class="command-search-row">
          <span aria-hidden="true">⌕</span>
          <input class="command-search" type="search" placeholder="Search actions and views…" autocomplete="off" aria-controls="command-list" />
          <kbd>Esc</kbd>
        </div>
        <div class="command-list" id="command-list" role="listbox"></div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Select</span></footer>
      </section>`;
    global.document.body.appendChild(overlay);
    input = overlay.querySelector('.command-search');
    list = overlay.querySelector('.command-list');

    input.addEventListener('input', () => {
      visibleCommands = filterCommands(input.value);
      activeIndex = 0;
      render();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = visibleCommands.length ? (activeIndex + 1) % visibleCommands.length : 0;
        render();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = visibleCommands.length ? (activeIndex - 1 + visibleCommands.length) % visibleCommands.length : 0;
        render();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runActive();
      } else if (event.key === 'Escape') close();
    });
    list.addEventListener('click', event => {
      const item = event.target.closest('[data-command-index]');
      if (!item) return;
      activeIndex = Number(item.dataset.commandIndex);
      runActive();
    });
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    global.document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        overlay.classList.contains('hidden') ? open() : close();
      }
    });
    global.document.getElementById('command-palette-btn')?.addEventListener('click', open);
    render();
  }

  global.CommandPalette = { init, open, close, filterCommands };
  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof globalThis !== 'undefined' ? globalThis : window);
