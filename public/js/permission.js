/* ═══════════════════════════════════════════════════════════
   TWINKLE — PERMISSION MODULE
   Handles all permission popups before sensitive actions
   ═══════════════════════════════════════════════════════════ */

const Permission = (() => {
  const overlay  = document.getElementById('permission-overlay');
  const permAction = document.getElementById('perm-action');
  const permReason = document.getElementById('perm-reason');
  const allowBtn = document.getElementById('perm-allow');
  const denyBtn  = document.getElementById('perm-deny');

  let _resolve = null;

  /* Sensitive action keywords that trigger a permission popup */
  const SENSITIVE_PATTERNS = [
    { pattern: /open\s+(vs\s?code|chrome|notion|gmail|canva|terminal|whatsapp)/i,
      action: 'Open application', reason: 'Twinkle wants to launch an app on your laptop.' },
    { pattern: /send\s+(message|email|sms|whatsapp)/i,
      action: 'Send a message', reason: 'Twinkle wants to send a message on your behalf.' },
    { pattern: /delete|remove\s+file/i,
      action: 'Delete a file', reason: 'Twinkle wants to delete a file from your system.' },
    { pattern: /run\s+(command|script|terminal|bash|powershell)/i,
      action: 'Run a terminal command', reason: 'Twinkle wants to execute a command in your shell.' },
    { pattern: /access\s+(gallery|photos|camera|sms|call log|notification)/i,
      action: 'Access private data', reason: 'Twinkle wants to read private data from your phone.' },
    { pattern: /post\s+on\s+(instagram|twitter|linkedin|youtube|social)/i,
      action: 'Post on social media', reason: 'Twinkle wants to publish content on your behalf.' },
    { pattern: /access\s+notion|open\s+notion/i,
      action: 'Access Notion', reason: 'Twinkle wants to read or write your Notion databases.' },
    { pattern: /read\s+(email|gmail|sms|message)/i,
      action: 'Read private messages', reason: 'Twinkle wants to access your private emails or SMS.' },
    { pattern: /move\s+file|rename\s+file/i,
      action: 'Move or rename a file', reason: 'Twinkle wants to modify files on your laptop.' },
    { pattern: /call\s+|make\s+a\s+call/i,
      action: 'Make a phone call', reason: 'Twinkle wants to initiate a call.' }
  ];

  function _show(action, reason) {
    permAction.textContent = action;
    permReason.textContent = reason;
    overlay.classList.remove('hidden');

    return new Promise((resolve) => {
      _resolve = resolve;
    });
  }

  function _hide() {
    overlay.classList.add('hidden');
    _resolve = null;
  }

  allowBtn.addEventListener('click', () => {
    if (_resolve) _resolve(true);
    _hide();
  });

  denyBtn.addEventListener('click', () => {
    if (_resolve) _resolve(false);
    _hide();
  });

  return {
    /* Check if a user message requires permission */
    async checkMessage(text) {
      for (const item of SENSITIVE_PATTERNS) {
        if (item.pattern.test(text)) {
          const allowed = await _show(item.action, item.reason);
          return allowed;
        }
      }
      return true; // No permission needed
    },

    /* Manually trigger a permission popup */
    async request(action, reason) {
      return await _show(action, reason);
    }
  };
})();
