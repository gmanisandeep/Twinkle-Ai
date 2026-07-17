const Voice = (() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let listening = false;
  let speechQueue = [];
  let speechBuffer = '';
  let speaking = false;

  function supported() { return Boolean(Recognition || window.speechSynthesis); }

  function listen(options = {}) {
    if (!Recognition) return Promise.reject(new Error('Speech recognition is not supported by this browser.'));
    if (listening) recognition?.stop();
    recognition = new Recognition();
    recognition.lang = options.language || navigator.language || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    listening = true;
    options.onState?.('listening');
    return new Promise((resolve, reject) => {
      let transcript = '';
      recognition.onresult = (event) => {
        transcript = [...event.results].map((result) => result[0].transcript).join('');
        options.onTranscript?.(transcript, event.results[event.results.length - 1].isFinal);
      };
      recognition.onerror = (event) => reject(new Error(event.error === 'not-allowed' ? 'Microphone permission was denied.' : `Voice recognition failed: ${event.error}`));
      recognition.onend = () => { listening = false; options.onState?.('idle'); resolve(transcript.trim()); };
      recognition.start();
    });
  }

  function stopListening() { recognition?.stop(); }

  function speak(text, options = {}) {
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || '').replace(/[`*_#]/g, ' ').slice(0, 20_000));
    utterance.lang = options.language || navigator.language || 'en-IN';
    utterance.rate = Math.min(1.5, Math.max(0.7, options.rate || 1));
    options.onState?.('speaking');
    utterance.onend = () => options.onState?.('idle');
    utterance.onerror = () => options.onState?.('idle');
    window.speechSynthesis.speak(utterance);
    return true;
  }

  function playQueue(options = {}) {
    if (speaking || !speechQueue.length || !window.speechSynthesis) return;
    speaking = true;
    const utterance = new SpeechSynthesisUtterance(speechQueue.shift());
    utterance.lang = options.language || navigator.language || 'en-IN';
    utterance.onend = () => { speaking = false; playQueue(options); };
    utterance.onerror = () => { speaking = false; playQueue(options); };
    window.speechSynthesis.speak(utterance);
  }

  function enqueue(text, options = {}) {
    speechBuffer += String(text || '').replace(/[`*_#]/g, ' ');
    const sentences = speechBuffer.split(/(?<=[.!?])\s+/);
    speechBuffer = sentences.pop() || '';
    speechQueue.push(...sentences.filter((sentence) => sentence.trim()).map((sentence) => sentence.trim()));
    playQueue(options);
  }

  function flush(options = {}) {
    if (speechBuffer.trim()) speechQueue.push(speechBuffer.trim());
    speechBuffer = '';
    playQueue(options);
  }

  function stopSpeaking() {
    speechQueue = [];
    speechBuffer = '';
    speaking = false;
    window.speechSynthesis?.cancel();
  }

  return { enqueue, flush, listen, speak, stopListening, stopSpeaking, supported };
})();
