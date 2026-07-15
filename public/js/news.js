/* ═══════════════════════════════════════════════════════════
   TWINKLE v2.0 — AI NEWS MODULE
   Fetches AI news via RSS2JSON (free, no key needed)
   ═══════════════════════════════════════════════════════════ */

const News = (() => {
  const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';
  const CACHE_KEY = 'twinkle_news_cache';
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  const FEEDS = [
    { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source: 'TechCrunch' },
    { url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', source: 'The Verge' },
    { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source: 'Ars Technica' },
  ];

  function _timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'just now';
  }

  function _cache(items) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
  }
  function _getCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (raw && Date.now() - raw.ts < CACHE_TTL) return raw.items;
    } catch {}
    return null;
  }

  async function _fetchFeed(feed) {
    try {
      const res = await fetch(`${RSS2JSON}${encodeURIComponent(feed.url)}&count=5`);
      const data = await res.json();
      if (data.status !== 'ok') return [];
      return (data.items || []).map(item => ({
        title: item.title,
        link: item.link,
        source: feed.source,
        pubDate: item.pubDate
      }));
    } catch { return []; }
  }

  async function fetchAll(force = false) {
    if (!force) {
      const cached = _getCache();
      if (cached) return cached;
    }
    const results = await Promise.allSettled(FEEDS.map(_fetchFeed));
    const items = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, 15);
    if (items.length > 0) _cache(items);
    return items;
  }

  function renderItem(item) {
    const el = document.createElement('a');
    el.className = 'news-item';
    el.href = item.link;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.innerHTML = `
      <div class="news-item-title">${item.title}</div>
      <div class="news-item-meta">
        <span class="news-source">${item.source}</span>
        <span class="news-time">${_timeAgo(item.pubDate)}</span>
      </div>
    `;
    return el;
  }

  async function render(container, refreshBtn, force = false) {
    if (refreshBtn) refreshBtn.classList.add('spinning');
    container.innerHTML = '<div class="news-loading">Loading AI news...</div>';
    const items = await fetchAll(force);
    container.innerHTML = '';
    if (items.length === 0) {
      container.innerHTML = '<div class="news-error">Could not load news. Check connection.</div>';
    } else {
      items.slice(0, 8).forEach(item => container.appendChild(renderItem(item)));
    }
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }

  return { fetchAll, render };
})();
