/* ═══════════════════════════════════════════════════════════
   TWINKLE v2.0 — UI MODULE
   Rendering, confetti, glow, reactions, scroll, markdown
   ═══════════════════════════════════════════════════════════ */

const UI = (() => {
  const chatMessages = document.getElementById('chat-messages');
  const toastContainer = document.getElementById('toast-container');
  const chatInputBox = document.querySelector('.chat-input-box');

  /* ── MARKDOWN PARSER ────────────────────────────────────── */
  function parseMarkdown(text) {
    if (!text) return '';
    let html = text;

    // Fenced code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre><code class="language-${lang}">${escaped.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold, italic, strikethrough
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Horizontal rule
    html = html.replace(/^[-─]{3,}$/gm, '<hr>');

    // Blockquote
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^(\s*[-•*] .+(\n\s*[-•*] .+)*)/gm, (match) => {
      const items = match.split('\n').filter(l => l.trim())
        .map(l => `<li>${l.replace(/^\s*[-•*] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    html = html.replace(/^(\s*\d+\. .+(\n\s*\d+\. .+)*)/gm, (match) => {
      const items = match.split('\n').filter(l => l.trim())
        .map(l => `<li>${l.replace(/^\s*\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // Tables
    html = html.replace(/(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g, (match) => {
      const lines = match.trim().split('\n');
      const headers = lines[0].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = lines.slice(2).map(line => {
        const cells = line.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Paragraphs
    html = html.replace(/\n{2,}/g, '\n\n');
    html = html.split('\n\n').map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
  }

  /* ── TASK SUMMARY PARSER ────────────────────────────────── */
  function parseTaskSummary(text) {
    const match = text.match(/✅\s*TASK SUMMARY\s*([\s\S]*?)(?:─{10,}|$)/i);
    if (!match) return null;
    const lines = match[1].trim().split('\n').filter(l => l.trim());
    return lines.map(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) return null;
      return {
        key: line.substring(0, colonIdx).replace(/^[-•*]\s*/, '').trim(),
        val: line.substring(colonIdx + 1).trim()
      };
    }).filter(Boolean);
  }

  /* ── TIME ───────────────────────────────────────────────── */
  function timeNow() {
    return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  /* ── READING TIME ───────────────────────────────────────── */
  function readingTime(text) {
    const words = text.split(/\s+/).length;
    const mins = Math.ceil(words / 200);
    return words > 50 ? `~${mins} min read` : '';
  }

  /* ── ESCAPE HTML ────────────────────────────────────────── */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── CONFETTI BURST ─────────────────────────────────────── */
  function confetti() {
    const colors = ['#ffffff', '#a0a0a0', '#444444', '#cccccc', '#888888'];
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `
        left: ${Math.random() * 100}vw;
        top: ${Math.random() * 40 + 10}vh;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${Math.random() * 8 + 4}px;
        height: ${Math.random() * 8 + 4}px;
        animation-delay: ${Math.random() * 0.5}s;
        animation-duration: ${Math.random() * 1.5 + 1.5}s;
        transform: rotate(${Math.random() * 360}deg);
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }
  }

  /* ── INPUT GLOW ─────────────────────────────────────────── */
  function setInputGlow(on) {
    if (!chatInputBox) return;
    if (on) chatInputBox.classList.add('twinkle-typing');
    else chatInputBox.classList.remove('twinkle-typing');
  }

  /* ── SCROLL TO BOTTOM ───────────────────────────────────── */
  let _scrollBtn = null;

  function initScrollButton() {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;

    _scrollBtn = document.createElement('button');
    _scrollBtn.className = 'scroll-to-bottom hidden';
    _scrollBtn.innerHTML = '↓ Jump to bottom';
    _scrollBtn.onclick = scrollToBottom;
    chatArea.style.position = 'relative';
    chatArea.appendChild(_scrollBtn);

    chatMessages.addEventListener('scroll', () => {
      const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
      if (distFromBottom > 200) _scrollBtn.classList.remove('hidden');
      else _scrollBtn.classList.add('hidden');
    });
  }

  function scrollToBottom() {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  }

  /* ── REACTION BAR ───────────────────────────────────────── */
  function buildReactionBar(text) {
    const rTime = readingTime(text);
    const bar = document.createElement('div');
    bar.className = 'reaction-bar';
    bar.innerHTML = `
      <button class="reaction-btn" title="Helpful" data-reaction="up">👍 <span class="rbtn-label">Helpful</span></button>
      <button class="reaction-btn" title="Not helpful" data-reaction="down">👎</button>
      <button class="reaction-btn" title="Star" data-reaction="star">⭐</button>
      <button class="reaction-btn" id="copy-btn-${Date.now()}" title="Copy response">📋 <span class="rbtn-label">Copy</span></button>
      ${rTime ? `<span class="reading-time">${rTime}</span>` : ''}
    `;

    // Reactions
    bar.querySelectorAll('[data-reaction]').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('[data-reaction]').forEach(b => b.classList.remove('active'));
        btn.classList.toggle('active');
      });
    });

    // Copy
    const copyBtn = bar.querySelector('[title="Copy response"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML = '✅ <span class="rbtn-label">Copied!</span>';
          setTimeout(() => { copyBtn.innerHTML = '📋 <span class="rbtn-label">Copy</span>'; }, 2000);
        });
      });
    }
    return bar;
  }

  /* ── TASK SUMMARY HTML ──────────────────────────────────── */
  function renderTaskSummaryHTML(rows) {
    const rowsHTML = rows.map(r =>
      `<div class="task-summary-row">
        <span class="task-summary-key">${escapeHTML(r.key)}</span>
        <span class="task-summary-val">${escapeHTML(r.val)}</span>
      </div>`
    ).join('');
    return `
      <div class="task-summary-card">
        <div class="task-summary-title">✅ Task Summary</div>
        ${rowsHTML}
      </div>
    `;
  }

  /* ── RENDER USER MESSAGE ────────────────────────────────── */
  function renderUserMessage(text) {
    const emptyChat = document.getElementById('empty-chat-state');
    if (emptyChat) emptyChat.remove();
    const el = document.createElement('div');
    el.className = 'message user-message';
    el.innerHTML = `
      <div class="message-inner">
        <div class="message-avatar">M</div>
        <div class="message-body">
          <div class="message-meta">
            <span class="message-name">Mani</span>
            <span class="message-time">${timeNow()}</span>
          </div>
          <div class="message-content-text">${escapeHTML(text).replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
  }

  /* ── RENDER TYPING INDICATOR ────────────────────────────── */
  function renderTyping() {
    const el = document.createElement('div');
    el.className = 'message twinkle-message';
    el.id = 'typing-indicator';
    el.innerHTML = `
      <div class="message-inner">
        <div class="message-avatar">T</div>
        <div class="message-body">
          <div class="message-meta"><span class="message-name">Twinkle</span></div>
          <div class="message-content-text">
            <div class="typing-indicator">
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
  }

  /* ── RENDER TWINKLE MESSAGE ─────────────────────────────── */
  /* domain can be a full domain object { id, label, icon, color } or a string key */
  function renderTwinkleMessage(text, domain, streaming = false) {
    document.getElementById('typing-indicator')?.remove();

    const summaryRows = parseTaskSummary(text);
    let displayText = text;
    if (summaryRows) {
      displayText = text.replace(/─+\s*✅\s*TASK SUMMARY[\s\S]*?─+/i, '').trim();
      displayText = displayText.replace(/✅\s*TASK SUMMARY[\s\S]*/i, '').trim();
    }

    // getBadgeHTML expects a domain object; if we got a string, look it up
    let domainObj = domain;
    if (typeof domain === 'string') {
      domainObj = (typeof Domains !== 'undefined')
        ? Domains.getAll().find(d => d.id === domain) || { id: domain, label: domain, icon: '🤖', color: 'general' }
        : { id: domain, label: domain, icon: '🤖', color: 'general' };
    }
    const domainBadge = typeof Domains !== 'undefined' ? Domains.getBadgeHTML(domainObj) : '';
    const contentHTML = parseMarkdown(displayText);

    const el = document.createElement('div');
    el.className = 'message twinkle-message';
    el.innerHTML = `
      <div class="message-inner">
        <div class="message-avatar">T</div>
        <div class="message-body">
          <div class="message-meta">
            <span class="message-name">Twinkle</span>
            ${domainBadge}
            <span class="message-time">${timeNow()}</span>
          </div>
          <div class="message-content-text" id="bubble-${Date.now()}">
            ${contentHTML}
            ${streaming ? '<span class="streaming-cursor"></span>' : ''}
          </div>
          ${summaryRows ? renderTaskSummaryHTML(summaryRows) : ''}
        </div>
      </div>
    `;

    if (!streaming && summaryRows) {
      setTimeout(() => confetti(), 300);
    }

    chatMessages.appendChild(el);
    scrollToBottom();
    return el;
  }

  /* ── UPDATE STREAMING BUBBLE ────────────────────────────── */
  function updateStreamingBubble(el, text) {
    const summaryRows = parseTaskSummary(text);
    let displayText = text;
    if (summaryRows) {
      displayText = text.replace(/─+\s*✅\s*TASK SUMMARY[\s\S]*?─+/i, '').trim();
      displayText = displayText.replace(/✅\s*TASK SUMMARY[\s\S]*/i, '').trim();
    }
    const contentEl = el.querySelector('.message-content-text');
    if (contentEl) {
      contentEl.innerHTML = parseMarkdown(displayText) + '<span class="streaming-cursor"></span>';
    }
    scrollToBottom();
  }

  /* ── FINALIZE STREAMING BUBBLE ──────────────────────────── */
  function finalizeStreamingBubble(el, text) {
    const summaryRows = parseTaskSummary(text);
    let displayText = text;
    if (summaryRows) {
      displayText = text.replace(/─+\s*✅\s*TASK SUMMARY[\s\S]*?─+/i, '').trim();
      displayText = displayText.replace(/✅\s*TASK SUMMARY[\s\S]*/i, '').trim();
    }

    const contentEl = el.querySelector('.message-content-text');
    if (contentEl) contentEl.innerHTML = parseMarkdown(displayText);

    if (summaryRows) {
      const body = el.querySelector('.message-body');
      const summaryEl = document.createElement('div');
      summaryEl.innerHTML = renderTaskSummaryHTML(summaryRows);
      body.appendChild(summaryEl.firstChild);
      setTimeout(() => confetti(), 300);
    }

    // Add reaction bar
    const body = el.querySelector('.message-body');
    if (body) body.appendChild(buildReactionBar(text));

    scrollToBottom();
  }

  /* ── EMPTY STATE ────────────────────────────────────────── */
  function renderEmptyState() {
    const suggestions = [
      '🎬 Plan my YouTube content calendar',
      '💻 Help me debug my React code',
      '📈 Lead gen ideas for Hyderabad',
      '✍️ Draft an ad film pitch email',
      '⚡ What should I focus on today?'
    ];
    const chipsHTML = suggestions.map(s =>
      `<button class="chip" onclick="UI.sendChip(this)">${s}</button>`
    ).join('');

    const el = document.createElement('div');
    el.id = 'empty-chat-state';
    el.className = 'empty-chat';
    el.innerHTML = `
      <div class="empty-orb"></div>
      <div class="empty-title">Twinkle is ready</div>
      <div class="empty-sub">Your personal AI operations layer. Ask me anything — from code to content, leads to filmmaking.</div>
      <div class="suggestion-chips">${chipsHTML}</div>
    `;
    chatMessages.appendChild(el);
  }

  /* ── CLOCK ──────────────────────────────────────────────── */
  function startClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;
    function update() {
      clockEl.textContent = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    update();
    setInterval(update, 1000);
  }

  /* ── DOMAIN INDICATOR ───────────────────────────────────── */
  function setDomainIndicator(domain) {
    const labelEl = document.getElementById('domain-label');
    const iconEl = document.querySelector('.domain-icon');
    if (labelEl && domain) labelEl.textContent = domain.label;
    if (iconEl && domain) iconEl.textContent = domain.icon;
  }

  /* ── TOAST ──────────────────────────────────────────────── */
  function toast(message, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${escapeHTML(message)}`;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  /* ── CHIP CLICK ─────────────────────────────────────────── */
  function sendChip(btn) {
    const text = btn.textContent.replace(/^[^\w]+ ?/, '').trim();
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      document.getElementById('send-btn')?.click();
    }
  }

  /* ── REFRESH STATS ──────────────────────────────────────── */
  function refreshStats() {
    const s = typeof Conversations !== 'undefined' ? Conversations.stats.get() : {};
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('stat-messages', s.messages || 0);
    setEl('stat-tasks', s.tasksCompleted || 0);
    setEl('stat-domains', s.domainsUsed ? [...s.domainsUsed].length : 0);
    const totalChats = typeof Conversations !== 'undefined' ? Conversations.getAll().length : 0;
    setEl('stat-memory-items', totalChats);
  }

  /* ── TOOLS GRID ─────────────────────────────────────────── */
  function renderToolsGrid() {
    const tools = [
      { icon: '🖥️', name: 'VS Code' }, { icon: '🌐', name: 'Chrome' },
      { icon: '📓', name: 'Notion' },  { icon: '📧', name: 'Gmail' },
      { icon: '💬', name: 'WhatsApp'}, { icon: '🎨', name: 'Canva' },
      { icon: '🖥', name: 'Terminal' }, { icon: '🐙', name: 'Git' }
    ];
    const grid = document.getElementById('tool-grid');
    if (grid) {
      grid.innerHTML = tools.map(t =>
        `<div class="tool-grid-item">
          <span class="tg-icon">${t.icon}</span>
          <span class="tg-name">${t.name}</span>
        </div>`
      ).join('');
    }
  }

  return {
    parseMarkdown, escapeHTML, timeNow,
    renderUserMessage, renderTyping, renderTwinkleMessage,
    updateStreamingBubble, finalizeStreamingBubble,
    renderEmptyState, refreshStats, renderToolsGrid,
    startClock, setDomainIndicator, toast, scrollToBottom,
    sendChip, confetti, setInputGlow, initScrollButton
  };
})();
