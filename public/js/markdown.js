(function initSafeMarkdown(global, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.SafeMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeUrl(value) {
    const url = String(value ?? '').trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (/^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return url;
    if (/^#[-\w:.]+$/.test(url)) return url;
    if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
    return null;
  }

  function render(value) {
    if (!value) return '';
    let html = escapeHTML(value);

    html = html.replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.trim()}</code></pre>`
    );
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    html = html.replace(/^[-─]{3,}$/gm, '<hr>');
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    html = html.replace(/^(\s*[-•*] .+(\n\s*[-•*] .+)*)/gm, (match) => {
      const items = match.split('\n').filter(line => line.trim())
        .map(line => `<li>${line.replace(/^\s*[-•*] /, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    });

    html = html.replace(/^(\s*\d+\. .+(\n\s*\d+\. .+)*)/gm, (match) => {
      const items = match.split('\n').filter(line => line.trim())
        .map(line => `<li>${line.replace(/^\s*\d+\. /, '')}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    html = html.replace(/(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g, (match) => {
      const lines = match.trim().split('\n');
      const headers = lines[0].split('|').filter(cell => cell.trim())
        .map(cell => `<th>${cell.trim()}</th>`).join('');
      const rows = lines.slice(2).map(line => {
        const cells = line.split('|').filter(cell => cell.trim())
          .map(cell => `<td>${cell.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safeHref = sanitizeUrl(href.replace(/&amp;/g, '&'));
      if (!safeHref) return `<span class="unsafe-link">${label}</span>`;
      return `<a href="${escapeHTML(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    return html.split(/\n{2,}/).map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
  }

  return { escapeHTML, sanitizeUrl, render };
});
