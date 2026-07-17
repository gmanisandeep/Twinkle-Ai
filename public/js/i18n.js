const I18n = (() => {
  const SUPPORTED = new Set(['en', 'hi', 'te']);
  const messages = {
    en: { ask: 'Ask Twinkle anything…', agentOn: 'Agent mode enabled', chatOn: 'Chat mode enabled' },
    hi: { ask: 'Twinkle से कुछ भी पूछें…', agentOn: 'एजेंट मोड चालू है', chatOn: 'चैट मोड चालू है' },
    te: { ask: 'Twinkleను ఏదైనా అడగండి…', agentOn: 'ఏజెంట్ మోడ్ ఆన్ అయింది', chatOn: 'చాట్ మోడ్ ఆన్ అయింది' },
  };
  function locale() {
    const saved = localStorage.getItem('twinkle_locale');
    const browser = String(navigator.language || 'en').split('-')[0];
    return SUPPORTED.has(saved) ? saved : SUPPORTED.has(browser) ? browser : 'en';
  }
  function setLocale(value) {
    const next = SUPPORTED.has(value) ? value : 'en';
    localStorage.setItem('twinkle_locale', next);
    document.documentElement.lang = next;
    document.dispatchEvent(new CustomEvent('twinkle:locale', { detail: next }));
    return next;
  }
  function t(key) { return messages[locale()]?.[key] || messages.en[key] || key; }
  function apply() {
    document.documentElement.lang = locale();
    const input = document.getElementById('chat-input');
    if (input) input.placeholder = t('ask');
  }
  return { apply, locale, setLocale, t };
})();
