// chat.js — Chat panel with story-aware mock responses
// Phase 1 (current): callChatAPI() returns local mock data, no server needed
// Phase 6 (next):    Replace callChatAPI() body with real fetch() to Vercel endpoint

function initChatPanel() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  renderChatUI();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendChatMessage(); }
  });
}

// ── STORY CONTEXT ─────────────────────────────────────────────────────────────
// Builds a lightweight summary of the project to send alongside each message.
// Phase 6: this object is JSON-stringified into the POST body to the API.
function buildStoryContext() {
  return {
    sceneCount:  S.scenes.length,
    scenes:      S.scenes.map(sc => ({ title: sc.title, summary: sc.summary || '' })),
    characters:  S.characters.map(c => c.name),
    locations:   S.locations.map(l => l.name),
    themes:      S.themes.map(t => t.name),
    misc:        S.misc.map(m => m.name),
    sections:    S.sections.map(s => s.name),
  };
}

// ── API CALL ──────────────────────────────────────────────────────────────────
// Phase 1: resolves locally with a context-aware mock response.
// Phase 6: replace the body of this function with the fetch() block below.
async function callChatAPI(message, context) {

  // ── MOCK (Phase 1) ──
  await new Promise(r => setTimeout(r, 700));
  return { content: getMockResponse(message, context) };

  // ── REAL (Phase 6) — uncomment and delete mock block above ──
  // const response = await fetch('/api/chat', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ message, context }),
  // });
  // if (!response.ok) throw new Error('API error ' + response.status);
  // return response.json(); // expects { content: "..." }
}

// ── SEND ──────────────────────────────────────────────────────────────────────
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  input.disabled = true;

  addChatMessage(text, 'user');
  const loader = showChatLoader();

  try {
    const context = buildStoryContext();
    const data    = await callChatAPI(text, context);
    removeChatLoader(loader);
    addChatMessage(data.content, 'assistant');
  } catch(err) {
    removeChatLoader(loader);
    addChatMessage('Could not get a response. Please try again.', 'assistant');
    console.warn('Chat API error:', err.message);
  } finally {
    input.disabled = false;
    input.focus();
    recordDataEdit();
    saveState();
  }
}

// ── MOCK RESPONSES ────────────────────────────────────────────────────────────
// Context-aware: references actual character names, scene count, sections.
// Phase 6: delete this function entirely.
function getMockResponse(msg, ctx) {
  const lowerMsg   = msg.toLowerCase();
  const charList   = ctx.characters.length ? ctx.characters.slice(0, 3).join(', ') : 'your characters';
  const locList    = ctx.locations.length  ? ctx.locations.slice(0, 2).join(' and ') : 'your locations';
  const sceneCount = ctx.sceneCount;
  const sections   = ctx.sections.length  ? ctx.sections.join(', ')  : null;

  if (lowerMsg.includes('character') || lowerMsg.includes('protagonist')) {
    return `Looking at your cast — ${charList} — a few thoughts:\n\n1. Give each character a distinct want vs. need (what they think they want vs. what the story reveals they truly need)\n2. Add a moment of vulnerability in the middle act\n3. Make sure relationships between characters shift or deepen across scenes\n\nWant me to focus on a specific character?`;
  }

  if (lowerMsg.includes('pacing') || lowerMsg.includes('speed') || lowerMsg.includes('slow')) {
    const mid = Math.ceil(sceneCount / 2);
    return `With ${sceneCount} scenes${sections ? ` across ${ctx.sections.length} sections (${sections})` : ''}, here's a pacing read:\n\n• Act 1 should use roughly the first ${Math.ceil(sceneCount * 0.25)} scenes to set up world and stakes\n• The midpoint (around scene ${mid}) needs a major turn\n• Act 3 should feel faster — tighten scenes and cut anything that doesn't escalate\n\nDoes any section feel like it drags?`;
  }

  if (lowerMsg.includes('scene') || lowerMsg.includes('describe')) {
    return `With ${sceneCount} scenes on the board, a few things to check:\n\n• Does every scene change something? (a relationship, a plan, a belief)\n• Vary the energy — high-tension scenes need quieter scenes around them\n• Use ${locList} to set mood, not just place the characters\n\nTell me a scene number or title and I'll give more specific feedback.`;
  }

  if (lowerMsg.includes('plot') || lowerMsg.includes('structure') || lowerMsg.includes('story')) {
    return `Story structure with ${sceneCount} scenes${sections ? ` in ${sections}` : ''}:\n\n1. Make sure your inciting incident is early (scene 1-3)\n2. Midpoint shift (scene ${Math.ceil(sceneCount / 2)}) should change the protagonist's approach\n3. All is lost moment should feel earned, not arbitrary\n4. Resolution: answer the story's central question\n\nWhat part of the structure feels weakest to you?`;
  }

  if (lowerMsg.includes('location') || lowerMsg.includes('setting') || lowerMsg.includes('place')) {
    return `Your locations — ${locList}${ctx.locations.length > 2 ? ` (and ${ctx.locations.length - 2} more)` : ''} — are the physical world of your story.\n\nTo make them work harder:\n1. Each location should feel different in atmosphere, not just geography\n2. Use the environment to externalize internal conflict\n3. Returning to a location near the end creates resonance with how it first appeared\n\nAsk about a specific location for more targeted advice.`;
  }

  if (lowerMsg.includes('dialogue') || lowerMsg.includes('conversation')) {
    return `Dialogue tips for your scenes:\n\n1. Every character should sound distinct — ${charList.split(', ')[0]} shouldn't sound like ${charList.split(', ')[1] || 'the others'}\n2. Cut anything that's just information transfer — let action carry exposition\n3. Read it aloud — if you stumble, rewrite it\n4. Subtext: characters rarely say exactly what they mean\n\nPaste a dialogue excerpt if you want a direct look.`;
  }

  if (lowerMsg.includes('theme') || lowerMsg.includes('meaning')) {
    const themeList = ctx.themes.length ? ctx.themes.join(', ') : 'your themes';
    return `Your themes — ${themeList} — should be woven through action and choice, not stated outright.\n\n• Let character decisions embody the theme\n• Secondary characters can represent alternative answers to the same theme\n• The ending should resolve the theme question, not just the plot\n\nWhich theme feels most central to you?`;
  }

  if (lowerMsg.includes('help') || lowerMsg.includes('what can') || lowerMsg.includes('what do')) {
    return `I can help with any aspect of your story (${sceneCount} scenes, ${ctx.characters.length} characters, ${ctx.locations.length} locations):\n\n📖 Structure & pacing\n👤 Character development\n🎬 Scene-by-scene feedback\n🌍 Setting & world-building\n✍️ Dialogue & voice\n🎭 Theme & meaning\n\nJust ask — be specific for better advice (e.g. "Act 2 feels slow" or "Alice's motivation isn't clear").`;
  }

  return `Good question. With ${sceneCount} scenes and characters like ${charList}, here are three things worth looking at:\n\n1. Does every scene serve the story — cut or combine anything that doesn't move character or plot\n2. Check the emotional temperature — vary intensity to give readers breathing room\n3. Make sure ${charList.split(', ')[0]}'s want is clear by the end of the first act\n\nWhat specifically prompted this question?`;
}

// ── MESSAGE STORE ─────────────────────────────────────────────────────────────
function addChatMessage(text, role) {
  if (!S.chatMessages) S.chatMessages = [];
  if (!S.nextChatId)   S.nextChatId   = 1;
  S.chatMessages.push({ id: S.nextChatId++, text, role, timestamp: new Date().toISOString() });
  renderChatUI();
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderChatUI() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';

  if (!S.chatMessages || S.chatMessages.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--o0);font-size:11px;padding:8px;text-align:center;';
    empty.textContent = '💬 No messages yet. Ask about your story!';
    container.appendChild(empty);
    return;
  }

  S.chatMessages.forEach(msg => {
    const div   = document.createElement('div');
    div.className = `chat-msg ${msg.role}`;
    const label = document.createElement('div');
    label.className = 'chat-msg-label';
    label.textContent = msg.role === 'user' ? 'You' : 'Claude';
    const text  = document.createElement('div');
    text.textContent = msg.text;
    text.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
    div.appendChild(label);
    div.appendChild(text);
    container.appendChild(div);
  });

  setTimeout(() => {
    const parent = container.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;
  }, 0);
}

function showChatLoader() {
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px;text-align:center;color:var(--o0);font-size:11px;font-style:italic;';
  div.textContent = '✨ Thinking…';
  document.getElementById('chat-messages')?.appendChild(div);
  return div;
}

function removeChatLoader(el) {
  if (el && el.parentElement) el.parentElement.removeChild(el);
}

function clearChatHistory() {
  if (!confirm('Clear all chat messages? This cannot be undone.')) return;
  S.chatMessages = []; S.nextChatId = 1;
  renderChatUI(); recordDataEdit(); saveState();
}
