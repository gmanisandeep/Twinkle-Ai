const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Landing = require('../public/js/landing.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'landing.css'), 'utf8');

test('shows the cinematic intro only until the first-visit marker is stored', () => {
  const unseen = { getItem: () => null };
  const seen = { getItem: (key) => key === Landing.INTRO_KEY ? 'true' : null };
  assert.equal(Landing.hasSeenIntro(unseen), false);
  assert.equal(Landing.hasSeenIntro(seen), true);
  assert.equal(Landing.INTRO_KEY, 'twinkle_intro_seen_v1');
  assert.ok(Landing.timings.ready <= 6_000);
});

test('landing page uses one Google registration action and the production star asset', () => {
  assert.match(html, /class="constellation-map"/);
  assert.match(html, /class="landing-focus-star" src="assets\/brand\/twinkle-star\.png"/);
  assert.match(html, /class="intro-brand-wordmark">TWINKL<span>E<\/span>/);
  assert.doesNotMatch(html, /data-enter-twinkle|>Enter Twinkle<|I already have an account/);
  assert.match(html, /From intention to <em>action\.<\/em>/);
  assert.equal((html.match(/id="google-signin-btn"/g) || []).length, 1);
  assert.match(html, /Twinkle never receives or stores your Google password/);
});

test('landing and onboarding include responsive and reduced-motion behavior', () => {
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /--motion-cinematic:/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="1"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="onboarding-title"/);
  assert.match(html, /<label class="sr-only" for="ob-name">/);
  assert.match(html, /<label class="sr-only" for="ob-goal">/);
  assert.match(css, /\.landing-story \{[^}]*visibility: hidden/s);
});
