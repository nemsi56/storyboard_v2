// chat.js - Chat functionality with mock responses
// Phase 1: Mock responses only (no API integration yet)
// Phase 2: Replace getMockResponse() with real Claude API calls via Vercel

function initChatPanel() {
  const input = document.getElementById('chat-input');
  if (!input) return;

  // Render saved messages on load
  renderChatUI();

  // Setup keyboard shortcut: Ctrl+Enter to send
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  // Add user message to history
  addChatMessage(text, 'user');

  // Show loading indicator
  const loader = showChatLoader();

  // PHASE 1: Mock response (simulate API delay)
  setTimeout(() => {
    removeChatLoader(loader);
    const mockResponse = getMockResponse(text);
    addChatMessage(mockResponse, 'assistant');
    recordDataEdit();
    saveState();
  }, 800);

  // TODO Phase 2: Replace with real API call
  // try {
  //   const response = await fetch('https://[vercel-project].vercel.app/api/chat', {...})
  //   const data = await response.json();
  //   addChatMessage(data.message, 'assistant');
  // } catch(err) {
  //   recordChatError(err.message);
  // }
}

function getMockResponse(userMessage) {
  // Simple mock response generator based on user query keywords
  // Phase 2: Replace with real Claude API calls

  const lowerMsg = userMessage.toLowerCase();

  // Analyze user's question intent and return relevant feedback
  if (lowerMsg.includes('character') || lowerMsg.includes('protagonist')) {
    return `Based on your story, the main character seems well-developed. Consider adding:\n\n1. A unique flaw or weakness\n2. A moment of vulnerability in Act 2\n3. A relationship that challenges their worldview\n\nThis will make them more relatable to readers.`;
  }

  if (lowerMsg.includes('scene') || lowerMsg.includes('describe')) {
    return `Looking at your current scenes, the pacing is solid. A few suggestions:\n\n• Scene 3: Consider adding sensory details (what does it smell like?)\n• Scene 5: Tighten the dialogue—cut 2-3 lines\n• Scene 7: Add a beat before the reveal\n\nWant me to focus on any specific scene?`;
  }

  if (lowerMsg.includes('plot') || lowerMsg.includes('story')) {
    return `Your story structure is strong with a clear 3-act arc. To improve it:\n\n1. Tighten the inciting incident (currently in Scene 2)\n2. Add a subplot to increase complexity\n3. Plant more hints about the twist earlier\n\nYour themes come through clearly—keep that focus.`;
  }

  if (lowerMsg.includes('pacing') || lowerMsg.includes('speed')) {
    return `The pacing looks good overall. You have ${S.scenes.length || 'several'} scenes with a solid pyramid structure.\n\nTip: Act 2 often feels slow. Consider adding one more scene here with a subplot climax.`;
  }

  if (lowerMsg.includes('help') || lowerMsg.includes('what can')) {
    return `I can help you with:\n\n📖 Story structure feedback\n👤 Character development advice\n🎬 Scene analysis and pacing\n🌍 Setting & world-building tips\n✍️ Dialogue and writing style suggestions\n\nJust ask about any aspect of your story, and I'll provide specific feedback based on your project.`;
  }

  if (lowerMsg.includes('dialogue') || lowerMsg.includes('conversation')) {
    return `For better dialogue:\n\n1. Each character should have a distinct voice\n2. Remove unnecessary "said" alternatives—use action instead\n3. Cut filler words (um, uh, you know)\n4. Let conflict simmer beneath the surface\n\nRead dialogue aloud to catch awkward phrasing.`;
  }

  if (lowerMsg.includes('setting') || lowerMsg.includes('location')) {
    return `Your locations provide good variety. To strengthen them:\n\n1. Make each location feel distinct through details\n2. Use setting to mirror character emotions\n3. Ground readers in specific places, not generics\n4. Avoid info-dumping—weave setting into action\n\nAsk about a specific location and I can give more targeted feedback.`;
  }

  // Default: acknowledge the question and offer help
  return `That's a great question about your writing! Based on what I see in your project:\n\nYour story shows solid structure and character development. To take it further:\n\n1. Strengthen the emotional arcs in Act 2\n2. Add more sensory details to key scenes\n3. Deepen character interactions\n\nFeel free to ask about specific scenes, characters, or story elements.`;
}

function addChatMessage(text, role) {
  // Initialize chat arrays if needed
  if (!S.chatMessages) S.chatMessages = [];
  if (!S.nextChatId) S.nextChatId = 1;

  // Add message to history
  S.chatMessages.push({
    id: S.nextChatId++,
    text,
    role, // 'user' or 'assistant'
    timestamp: new Date().toISOString()
  });

  // Render immediately
  renderChatUI();
}

function renderChatUI() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = '';

  if (!S.chatMessages || S.chatMessages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--o0); font-size:11px; padding:8px; text-align:center;';
    empty.textContent = '💬 No messages yet. Ask Claude about your story!';
    container.appendChild(empty);
    return;
  }

  // Render all messages
  S.chatMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.role}`;

    // Message label (You / Claude)
    const label = document.createElement('div');
    label.className = 'chat-msg-label';
    label.textContent = msg.role === 'user' ? 'You' : 'Claude';

    // Message text content
    const text = document.createElement('div');
    text.textContent = msg.text;
    text.style.cssText = 'white-space:pre-wrap; word-break:break-word;';

    div.appendChild(label);
    div.appendChild(text);
    container.appendChild(div);
  });

  // Auto-scroll to bottom
  setTimeout(() => {
    const parent = container.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;
  }, 0);
}

function showChatLoader() {
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px; text-align:center; color:var(--o0); font-size:11px; font-style:italic;';
  div.textContent = '✨ Claude is thinking...';
  document.getElementById('chat-messages')?.appendChild(div);
  return div;
}

function removeChatLoader(el) {
  if (el && el.parentElement) {
    el.parentElement.removeChild(el);
  }
}

function recordChatError(msg) {
  addChatMessage('⚠️ Error: ' + msg, 'assistant');
}

function clearChatHistory() {
  if (!confirm('Clear all chat messages? This cannot be undone.')) return;
  S.chatMessages = [];
  S.nextChatId = 1;
  renderChatUI();
  recordDataEdit();
  saveState();
}

