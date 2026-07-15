/* ═══════════════════════════════════════════════════════════
   TWINKLE v3.0 — API MODULE
   Routes all Gemini calls through /.netlify/functions/chat
   API key never touches the browser.
   ═══════════════════════════════════════════════════════════ */

const API = (() => {
  const MIN_INTERVAL_MS = 1500;   // min ms between sends
  let _lastRequestTime = 0;
  let _conversationHistory = [];

  /* ── DOMAIN SPECIALIST SUB-PROMPTS ─────────────────────── */
  const DOMAIN_PROMPTS = {
    leads: `
## LEAD GEN SPECIALIST MODE
You are operating as a lead generation expert for the Indian market.
- Use SPIN Selling: Situation → Problem → Implication → Need-Payoff
- Always provide: Target Audience, Outreach Channel, Hook, CTA
- Suggest WhatsApp, Instagram DMs, LinkedIn, cold email as channels
- Reference local market culture and context when relevant
- Format lead gen ideas as numbered, actionable playbooks
- Include sample copy/scripts when relevant`,

    coding: `
## CODING SPECIALIST MODE
You are operating as a senior full-stack engineer.
- Languages: HTML, CSS, JS, React, Flutter, Python, C, C++, SQL
- Always provide: Working code, Explanation, Edge cases, Optimization tips
- Use code blocks with language labels for ALL code
- Follow: Clean code principles, DRY, SOLID where applicable
- For bugs: Root cause → Fix → Prevention
- For new features: Architecture → Implementation → Testing approach
- Prefer modern syntax (ES2023+, React hooks, async/await)`,

    designing: `
## DESIGN SPECIALIST MODE
You are operating as a senior UI/UX designer.
- Apply: Gestalt principles, 8px grid, 60-30-10 color rule
- Always consider: Accessibility (WCAG 2.1), mobile-first, performance
- Provide: Color palette (hex), typography scale, spacing system
- Reference: Material Design 3, Apple HIG when relevant
- For critiques: Strengths → Issues → Specific fixes with examples
- Suggest Figma components, CSS variables, design tokens`,

    research: `
## RESEARCH SPECIALIST MODE
You are operating as a thorough research analyst.
- Structure: Executive Summary → Key Findings → Evidence → Implications → Next Steps
- Always cite reasoning (even without external sources)
- Detect and flag potential biases
- Use tables and bullet points to organize complex findings
- Rate confidence level: High / Medium / Low for each finding
- Suggest follow-up questions and research directions`,

    reviewing: `
## REVIEW SPECIALIST MODE
You are operating as a critical but constructive reviewer.
- Always use this rubric: ✅ Strengths → ⚠️ Issues → 🔧 Specific Fixes → 💯 Score /10
- Be direct and specific — no vague feedback
- Prioritize: Impact (High/Medium/Low) for each issue
- For code: Security, Performance, Readability, Maintainability
- For content: Clarity, Hook, Value, CTA, Tone
- For business plans: Market fit, Revenue model, Risks, Differentiator`,

    analytics: `
## ANALYTICS SPECIALIST MODE
You are operating as a data analyst.
- Apply: AARRR funnel, OKR framework, North Star Metric thinking
- Always suggest: What to measure, How to measure it, What good looks like
- Format insights as: Observation → Hypothesis → Test → Expected Outcome
- Recommend free tools: GA4, Hotjar, Mixpanel free tier, Metabase
- For business metrics: CAC, LTV, MRR, churn rate, conversion rate
- Visualize data in tables when possible`,

    finance: `
## FINANCE SPECIALIST MODE
You are operating as a financial advisor for Indian entrepreneurs.
- Context: India, GST, TDS, INR, UPI, Indian banking
- Always cover: Revenue, Expenses, Profit margin, Cash flow
- For pricing: Value-based pricing > cost-plus pricing
- Tax: GST registration threshold (₹20L), TDS deduction rules, advance tax
- Tools: Zoho Books, Razorpay, Instamojo for Indian market
- For savings/investment: SIP, mutual funds, emergency fund first`,

    marketing: `
## MARKETING SPECIALIST MODE
You are operating as a growth marketing expert.
- Always use: Hook → Problem → Agitation → Solution → CTA framework
- For content: Headlines that stop the scroll, pattern interrupts
- Channels: Instagram Reels, YouTube Shorts, WhatsApp Status (Indian market)
- Provide: Caption templates, hashtag strategy, posting schedule
- For ads: Ad copy, targeting parameters, budget split (70/20/10 rule)
- A/B testing: Always suggest 2 variants to test`,

    content: `
## CONTENT SPECIALIST MODE
You are operating as a creative content strategist.
- For video: Hook (0-3s) → Story → Payoff → CTA structure
- For writing: AIDA or PAS framework
- Always provide: Multiple angle options, Platform-specific adaptations
- Content calendar: Weekly themes, content pillars, repurposing strategy
- SEO basics when relevant: Title, description, tags optimization`,
  };

  /* ── BUILD DYNAMIC SYSTEM PROMPT ───────────────────────── */
  function buildSystemPrompt(domain) {
    const profile = (typeof Auth !== 'undefined') ? Auth.getUserProfile() : null;
    const prefs   = (typeof Auth !== 'undefined') ? Auth.getPrefs()       : {};

    const name    = prefs.name    || profile?.firstName || 'there';
    const goal    = prefs.goal    || 'achieve my goals';
    const domains = prefs.domains || [];

    let prompt = `# TWINKLE — Personal AI Agent v3.0

## IDENTITY
You are Twinkle. A professional, razor-sharp personal AI agent built for ${name}.
You are NOT a chatbot. You are a fully operational AI ops layer that thinks, decides, and acts.

## USER CONTEXT
- Name: ${name}
- Primary goal: ${goal}
${domains.length > 0 ? `- Main focus areas: ${domains.join(', ')}` : ''}

## PERSONALITY
- Professional, sharp, efficient. No fluff, no filler.
- Concise for simple tasks. Detailed when the task demands it.
- Direct and honest — tell ${name} what they need to hear, not what they want.
- Proactively suggest next steps, alternatives, and improvements.
- When solving problems: show reasoning, not just the answer.

## RESPONSE RULES
1. Always match the domain's specialist mode when activated
2. Use markdown formatting — headers, bullets, tables, code blocks
3. End substantial responses with a ✅ TASK SUMMARY block:
   ──────────────────────────────────────────────────────
   ✅ TASK SUMMARY
   - Action taken: [what you did]
   - Key outputs: [main deliverables]
   - Recommended next step: [1 concrete action]
   ──────────────────────────────────────────────────────
4. For coding tasks: always provide runnable, complete code
5. For business tasks: always tie back to ${name}'s stated goal
6. Never refuse reasonable creative or business requests`;

    if (domain && DOMAIN_PROMPTS[domain]) {
      prompt += '\n\n' + DOMAIN_PROMPTS[domain];
    }

    return prompt;
  }

  /* ── HISTORY MANAGEMENT ────────────────────────────────── */
  function clearHistory() { _conversationHistory = []; }

  function loadHistory(messages) {
    _conversationHistory = messages
      .filter(m => m.text && m.text.trim())
      .map(m => ({
        role:  m.role === 'twinkle' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));
  }

  /* ── SEND MESSAGE VIA NETLIFY PROXY ─────────────────────── */
  async function streamMessage(userText, domain, { onChunk, onDone, onError }) {
    // Throttle
    const now     = Date.now();
    const elapsed = now - _lastRequestTime;
    if (_lastRequestTime > 0 && elapsed < MIN_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
    _lastRequestTime = Date.now();

    // Need an auth token
    const token = (typeof Auth !== 'undefined') ? await Auth.getToken() : null;
    if (!token) {
      onError('You are not signed in. Please sign in to use Twinkle.');
      return;
    }

    // Append to history
    _conversationHistory.push({ role: 'user', parts: [{ text: userText }] });

    const systemPrompt = buildSystemPrompt(domain);

    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: _conversationHistory,
          systemPrompt,
          domain,
        }),
      });

      // Token expired → refresh and surface error
      if (res.status === 401) {
        _conversationHistory.pop();
        const freshToken = await Auth.getToken(true);
        if (!freshToken) {
          onError('Your session expired. Please sign in again.');
          if (typeof Auth !== 'undefined') Auth.signOut();
        } else {
          onError('Session refreshed. Please resend your message.');
        }
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        _conversationHistory.pop();
        onError(data.error || `Error ${res.status}`);
        return;
      }

      const fullText = data.text || '';

      // Save to history
      _conversationHistory.push({ role: 'model', parts: [{ text: fullText }] });
      if (_conversationHistory.length > 40) {
        _conversationHistory = _conversationHistory.slice(-40);
      }

      // Simulate streaming — word-by-word typewriter effect
      const words = fullText.split(' ');
      let displayed = '';
      for (let i = 0; i < words.length; i++) {
        displayed += (i === 0 ? '' : ' ') + words[i];
        onChunk(displayed);
        // Vary speed: pause slightly at sentence ends
        const w = words[i];
        const delay = (w.endsWith('.') || w.endsWith('?') || w.endsWith('!')) ? 55
                    : w.endsWith(',') || w.endsWith(':') ? 35
                    : 16;
        await new Promise(r => setTimeout(r, delay));
      }

      onDone(fullText);

    } catch (e) {
      _conversationHistory.pop();
      onError(`Network error: ${e.message}`);
    }
  }

  /* ── TEST CONNECTION ────────────────────────────────────── */
  async function testConnection() {
    const token = (typeof Auth !== 'undefined') ? await Auth.getToken() : null;
    if (!token) return { ok: false, msg: '❌ Not signed in.' };

    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', parts: [{ text: 'Say: ready' }] }],
          systemPrompt: 'Respond with exactly the word: ready',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        return { ok: true, msg: `✅ Connected!\nModel: ${data.model}\nResponse: "${data.text?.trim()}"` };
      }
      return { ok: false, msg: `❌ ${data.error || `HTTP ${res.status}`}` };
    } catch (e) {
      return { ok: false, msg: `❌ Network error: ${e.message}` };
    }
  }

  return { clearHistory, loadHistory, streamMessage, testConnection, buildSystemPrompt };
})();
