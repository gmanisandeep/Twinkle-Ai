/* ═══════════════════════════════════════════════════════════
   TWINKLE — DOMAIN DETECTION MODULE
   Auto-detects which domain a user message belongs to
   ═══════════════════════════════════════════════════════════ */

const Domains = (() => {
  const DOMAIN_MAP = [
    {
      id: 'coding',
      label: 'Coding',
      icon: '💻',
      color: 'coding',
      keywords: [
        'code', 'function', 'debug', 'error', 'bug', 'fix', 'script', 'program',
        'python', 'javascript', 'react', 'flutter', 'html', 'css', 'sql', 'c++',
        'api', 'backend', 'frontend', 'database', 'git', 'deploy', 'compile',
        'variable', 'loop', 'array', 'class', 'component', 'module', 'import',
        'npm', 'node', 'terminal', 'command', 'shell', 'bash', 'algorithm', 'stack',
        'overflow', 'syntax', 'type error', 'undefined', 'null', 'async', 'await',
        'fetch', 'axios', 'express', 'flask', 'django', 'spring', 'write code',
        'build', 'refactor', 'optimize', 'unit test', 'campsconnect', 'ibomma'
      ]
    },
    {
      id: 'social',
      label: 'Social Media',
      icon: '📱',
      color: 'social',
      keywords: [
        'instagram', 'youtube', 'linkedin', 'twitter', 'x.com', 'reel', 'post',
        'caption', 'hashtag', 'story', 'feed', 'bio', 'followers', 'engagement',
        'like', 'share', 'viral', 'trending', 'algorithm', 'creator', 'content creator',
        'thumbnail', 'shorts', 'tiktok', 'platform', 'social', 'profile', 'reach',
        'impression', 'growth', 'analytics', 'subscriber', 'channel', 'handle'
      ]
    },
    {
      id: 'marketing',
      label: 'Marketing',
      icon: '📣',
      color: 'marketing',
      keywords: [
        'marketing', 'brand', 'campaign', 'ad', 'advertisement', 'funnel', 'cta',
        'conversion', 'seo', 'sem', 'email marketing', 'newsletter', 'drip',
        'audience', 'target', 'positioning', 'usp', 'product launch', 'promotion',
        'offer', 'discount', 'landing page', 'copywriting', 'sales copy', 'hook',
        'pain point', 'value proposition', 'competitor', 'market research'
      ]
    },
    {
      id: 'leads',
      label: 'Lead Gen',
      icon: '🎯',
      color: 'leads',
      keywords: [
        'lead', 'prospect', 'outreach', 'cold email', 'cold dm', 'pitch', 'client',
        'customer', 'contact', 'crm', 'pipeline', 'hyderabad', 'local business',
        'agency', 'freelance', 'proposal', 'quote', 'contract', 'deal', 'business',
        'b2b', 'sales', 'revenue', 'opportunity', 'network', 'referral', 'partnership'
      ]
    },
    {
      id: 'research',
      label: 'Research',
      icon: '🔍',
      color: 'research',
      keywords: [
        'research', 'find out', 'look up', 'summarize', 'explain', 'what is',
        'how does', 'analyze', 'compare', 'report', 'fact', 'information',
        'topic', 'learn', 'study', 'understand', 'deep dive', 'overview', 'summary',
        'article', 'paper', 'source', 'citation', 'statistics', 'data', 'trend',
        'industry', 'market'
      ]
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '📊',
      color: 'analytics',
      keywords: [
        'analytics', 'metric', 'kpi', 'dashboard', 'chart', 'graph', 'visualize',
        'insight', 'performance', 'track', 'measure', 'report', 'data analysis',
        'csv', 'spreadsheet', 'revenue', 'growth rate', 'roi', 'ctr', 'cpc',
        'bounce rate', 'retention', 'churn', 'numbers', 'stats', 'calculate'
      ]
    },
    {
      id: 'reviewing',
      label: 'Reviewing',
      icon: '🧾',
      color: 'reviewing',
      keywords: [
        'review', 'feedback', 'critique', 'assess', 'evaluate', 'check', 'proofread',
        'edit', 'improve', 'suggestion', 'what do you think', 'is this good', 'rate',
        'grade', 'score', 'resume', 'portfolio', 'script review', 'plan review',
        'business plan', 'proposal review'
      ]
    },
    {
      id: 'content',
      label: 'Content',
      icon: '✍️',
      color: 'content',
      keywords: [
        'write', 'draft', 'blog', 'article', 'script', 'video script', 'description',
        'caption', 'copy', 'content', 'story', 'narration', 'documentary', 'short film',
        'youtube script', 'voice over', 'text', 'paragraph', 'essay', 'bio',
        'about me', 'cover letter', 'message', 'whatsapp', 'email', 'letter'
      ]
    },
    {
      id: 'laptop',
      label: 'Laptop Control',
      icon: '🖥️',
      color: 'laptop',
      keywords: [
        'open', 'close', 'launch', 'run', 'execute', 'vs code', 'chrome', 'notion',
        'gmail', 'canva', 'file', 'folder', 'download', 'upload', 'screenshot',
        'copy', 'paste', 'move', 'rename', 'delete', 'create folder', 'terminal',
        'browser', 'tab', 'window', 'app', 'software', 'install', 'uninstall',
        'notification', 'clipboard'
      ]
    },
    {
      id: 'phone',
      label: 'Phone Control',
      icon: '📲',
      color: 'phone',
      keywords: [
        'sms', 'text message', 'call log', 'missed call', 'whatsapp', 'phone',
        'android', 'adb', 'notification', 'gallery', 'photo', 'camera', 'contact',
        'dialer', 'incoming', 'outgoing', 'mirror', 'screen', 'mobile', 'read sms',
        'send sms', 'call history'
      ]
    }
  ];

  return {
    detect(text) {
      const lower = text.toLowerCase();
      let best = null;
      let bestScore = 0;

      for (const domain of DOMAIN_MAP) {
        let score = 0;
        for (const kw of domain.keywords) {
          if (lower.includes(kw)) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          best = domain;
        }
      }

      return best || { id: 'general', label: 'General', icon: '🤖', color: 'general' };
    },

    getAll() { return DOMAIN_MAP; },

    getBadgeHTML(domain) {
      return `<span class="domain-badge ${domain.color}">${domain.icon} ${domain.label}</span>`;
    }
  };
})();
