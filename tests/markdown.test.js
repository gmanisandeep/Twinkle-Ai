const test = require('node:test');
const assert = require('node:assert/strict');
const Markdown = require('../public/js/markdown.js');

test('escapes raw model HTML before rendering markdown', () => {
  const html = Markdown.render('<img src=x onerror=alert(1)> **safe**');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<strong>safe<\/strong>/);
});

test('blocks unsafe link protocols', () => {
  const html = Markdown.render('[open](javascript:alert(1))');
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /unsafe-link/);
});

test('allows secure web links', () => {
  const html = Markdown.render('[DeepSeek](https://api-docs.deepseek.com/)');
  assert.match(html, /href="https:\/\/api-docs\.deepseek\.com\/"/);
  assert.match(html, /noopener noreferrer/);
});
