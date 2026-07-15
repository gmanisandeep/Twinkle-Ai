# TWINKLE — Personal AI Agent

A Claude-inspired, black & white personal AI ops layer for Mani Sandeep.

---

## 🚀 Hosting Twinkle Online (Free)

### Option 1: Netlify (Easiest — 30 seconds)

1. Go to [netlify.com](https://netlify.com) and sign in (or create free account)
2. Click **"Add new site"** → **"Deploy manually"**
3. **Drag and drop** your entire `wonderful-archimedes` folder onto the deploy box
4. Done — Netlify gives you a live URL like `https://twinkle-abc123.netlify.app`

To update: just drag the folder again.

**Custom domain**: Netlify Settings → Domain Management → Add custom domain (free)

---

### Option 2: GitHub Pages (Best for version control)

```bash
# 1. Initialize git in the project folder
cd wonderful-archimedes
git init
git add .
git commit -m "Twinkle v2.0"

# 2. Create a repo on github.com, then push
git remote add origin https://github.com/YOUR_USERNAME/twinkle.git
git push -u origin main
```

3. Go to your repo → **Settings** → **Pages**
4. Source: **Deploy from branch** → `main` → `/ (root)` → Save
5. Live at: `https://YOUR_USERNAME.github.io/twinkle`

---

### Option 3: Vercel (Best performance)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project folder
cd wonderful-archimedes
vercel

# Follow prompts — live in ~20 seconds
```

Live at: `https://twinkle.vercel.app`

---

### Option 4: Cloudflare Pages (Best global CDN)

1. Push your code to GitHub (see Option 2)
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
3. Connect GitHub repo → Select `wonderful-archimedes`
4. Build settings: Framework = **None**, Build command = empty, Output = `/`
5. Deploy

---

## 🔑 API Key Note

Since Twinkle is a pure frontend app, **each user/device needs to enter their own API key** on first load.

- Key is stored in the browser's `localStorage` — never sent anywhere except Google's API
- Get a free key at [aistudio.google.com](https://aistudio.google.com)
- No credit card needed for the free tier

---

## 📁 Project Structure

```
wonderful-archimedes/
├── index.html              # Main app shell
├── css/
│   ├── main.css            # Base styles, tokens, layout
│   └── components.css      # Chat, sidebar, news, effects
└── js/
    ├── conversations.js    # Multi-chat storage & management
    ├── projects.js         # Project CRUD
    ├── news.js             # AI news RSS feed
    ├── domains.js          # Domain detection
    ├── permission.js       # Permission popup system
    ├── memory.js           # Legacy memory (backward compat)
    ├── ui.js               # Rendering, effects, confetti
    ├── api.js              # Gemini API + domain specialist prompts
    └── app.js              # Main orchestrator
```

---

## ✨ Features v2.0

- **Multi-chat history** — ChatGPT/Claude-style sidebar with Today/Yesterday/Last 7 Days grouping
- **Projects** — Group chats, inject context into AI system prompt
- **AI News feed** — Live headlines from TechCrunch, The Verge, Ars Technica (auto-refreshes)
- **8 Domain Specialists** — Lead Gen, Coding, Design, Research, Review, Analytics, Finance, Marketing
- **Confetti** — Bursts on task completion
- **Reaction bar** — 👍 👎 ⭐ 📋 Copy on every Twinkle response
- **Input glow** — Ambient pulse while Twinkle is typing
- **Auto model selection** — Probes available Gemini models, picks the best working one
- **DM Sans** typography — Claude-inspired clean aesthetic
