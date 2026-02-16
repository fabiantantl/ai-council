const STORAGE_KEYS = {
  config: 'llmCouncilConfig',
  sessions: 'llmCouncilSessions',
  activeSessionId: 'llmCouncilActiveSessionId',
  theme: 'llmCouncilTheme',
};

const MODEL_CATALOG = [
  {
    id: 'openai:gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'OpenAI · GPT-4o mini',
    color: '#10a37f',
    avatar: 'O',
    cost: { inputPerM: 0.15, outputPerM: 0.6 },
  },
  {
    id: 'anthropic:claude-3-haiku-20240307',
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    label: 'Anthropic · Claude 3 Haiku',
    color: '#8b5cf6',
    avatar: 'A',
    cost: { inputPerM: 0.25, outputPerM: 1.25 },
  },
  {
    id: 'google:gemini-1.5-flash',
    provider: 'google',
    model: 'gemini-1.5-flash',
    label: 'Google · Gemini 1.5 Flash',
    color: '#f59e0b',
    avatar: 'G',
    cost: { inputPerM: 0.075, outputPerM: 0.3 },
  },
];

const dom = {
  messages: document.getElementById('messages'),
  messageTemplate: document.getElementById('messageTemplate'),
  sessionsList: document.getElementById('sessionsList'),
  modelToggles: document.getElementById('modelToggles'),
  sessionTitle: document.getElementById('sessionTitle'),
  statusText: document.getElementById('statusText'),
  costTracker: document.getElementById('costTracker'),
  responseMode: document.getElementById('responseMode'),
  debateInfo: document.getElementById('debateInfo'),
  continueDebateBtn: document.getElementById('continueDebateBtn'),
  clearSessionBtn: document.getElementById('clearSessionBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  exportMdBtn: document.getElementById('exportMdBtn'),
  chatForm: document.getElementById('chatForm'),
  promptInput: document.getElementById('promptInput'),
  sendBtn: document.getElementById('sendBtn'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  darkModeToggle: document.getElementById('darkModeToggle'),
  openaiKey: document.getElementById('openaiKey'),
  anthropicKey: document.getElementById('anthropicKey'),
  googleKey: document.getElementById('googleKey'),
};

const state = {
  config: {
    apiKeys: { openai: '', anthropic: '', google: '' },
    enabledModels: MODEL_CATALOG.map((m) => m.id),
    mode: 'parallel',
  },
  sessions: [],
  activeSessionId: null,
};

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function estimateTokens(text = '') {
  return Math.max(1, Math.round(text.trim().split(/\s+/).length * 1.33));
}

function basicMarkdownToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function saveAll() {
  localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(state.config));
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(state.sessions));
  if (state.activeSessionId) {
    localStorage.setItem(STORAGE_KEYS.activeSessionId, state.activeSessionId);
  }
}

function loadAll() {
  const configRaw = localStorage.getItem(STORAGE_KEYS.config);
  const sessionsRaw = localStorage.getItem(STORAGE_KEYS.sessions);
  const activeId = localStorage.getItem(STORAGE_KEYS.activeSessionId);

  if (configRaw) {
    try {
      const parsed = JSON.parse(configRaw);
      state.config = {
        ...state.config,
        ...parsed,
        apiKeys: { ...state.config.apiKeys, ...(parsed.apiKeys || {}) },
      };
    } catch (error) {
      console.warn('Failed to parse saved config', error);
    }
  }

  if (sessionsRaw) {
    try {
      state.sessions = JSON.parse(sessionsRaw);
    } catch (error) {
      console.warn('Failed to parse saved sessions', error);
      state.sessions = [];
    }
  }

  if (activeId && state.sessions.some((session) => session.id === activeId)) {
    state.activeSessionId = activeId;
  } else {
    ensureActiveSession();
  }
}

function ensureActiveSession() {
  if (state.activeSessionId && state.sessions.some((session) => session.id === state.activeSessionId)) {
    return;
  }

  const session = {
    id: uid('session'),
    title: 'New Session',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mode: state.config.mode || 'parallel',
    debateRoundsUsed: 0,
    enabledModels: [...state.config.enabledModels],
    messages: [],
    totalCostUsd: 0,
  };

  state.sessions.unshift(session);
  state.activeSessionId = session.id;
}

function getActiveSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId);
}

function renderModelToggles() {
  dom.modelToggles.innerHTML = '';
  MODEL_CATALOG.forEach((model) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'model-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.config.enabledModels.includes(model.id);
    checkbox.dataset.modelId = model.id;

    const title = document.createElement('span');
    title.textContent = model.label;

    wrapper.append(checkbox, title);
    dom.modelToggles.appendChild(wrapper);
  });
}

function renderSessions() {
  dom.sessionsList.innerHTML = '';

  state.sessions.forEach((session) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const activeMarker = session.id === state.activeSessionId ? '● ' : '';
    button.textContent = `${activeMarker}${session.title}`;
    button.addEventListener('click', () => {
      state.activeSessionId = session.id;
      syncControlsFromSession();
      render();
      saveAll();
    });
    item.appendChild(button);
    dom.sessionsList.appendChild(item);
  });
}

function renderMessages() {
  const session = getActiveSession();
  if (!session) return;

  dom.messages.innerHTML = '';

  session.messages.forEach((msg) => {
    const node = dom.messageTemplate.content.cloneNode(true);
    const row = node.querySelector('.message-row');
    const bubble = node.querySelector('.message-bubble');
    const avatar = node.querySelector('.avatar');
    const author = node.querySelector('.author');
    const timestamp = node.querySelector('.timestamp');
    const statusBadge = node.querySelector('.status-badge');
    const tokenCount = node.querySelector('.token-count');
    const content = node.querySelector('.message-content');
    const actions = node.querySelector('.message-actions');

    row.classList.toggle('user', msg.role === 'user');
    author.textContent = msg.author;
    timestamp.textContent = formatTime(msg.createdAt);
    statusBadge.textContent = msg.status || 'success';
    tokenCount.textContent = msg.tokenCount ? `${msg.tokenCount} tok` : '—';
    content.innerHTML = basicMarkdownToHtml(msg.content || '');

    if (msg.role === 'assistant') {
      const model = MODEL_CATALOG.find((m) => m.id === msg.modelId);
      avatar.style.background = model?.color || '#64748b';
      avatar.textContent = model?.avatar || 'AI';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(msg.content);
        dom.statusText.textContent = `Copied response from ${msg.author}`;
      });

      const regenBtn = document.createElement('button');
      regenBtn.type = 'button';
      regenBtn.textContent = 'Regenerate';
      regenBtn.disabled = msg.status === 'pending';
      regenBtn.addEventListener('click', () => regenerateMessage(msg.id));

      actions.append(copyBtn, regenBtn);
      bubble.style.borderLeft = `4px solid ${model?.color || '#64748b'}`;
    } else {
      avatar.style.display = 'none';
    }

    dom.messages.appendChild(node);
  });

  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function render() {
  const session = getActiveSession();
  if (!session) return;

  dom.openaiKey.value = state.config.apiKeys.openai || '';
  dom.anthropicKey.value = state.config.apiKeys.anthropic || '';
  dom.googleKey.value = state.config.apiKeys.google || '';
  dom.responseMode.value = session.mode || 'parallel';

  dom.sessionTitle.textContent = session.title;
  dom.debateInfo.textContent = `Debate rounds used: ${session.debateRoundsUsed || 0} / 2`;
  dom.continueDebateBtn.disabled = session.mode !== 'debate' || session.debateRoundsUsed >= 2;
  dom.costTracker.textContent = `Estimated Cost: $${(session.totalCostUsd || 0).toFixed(4)}`;

  renderModelToggles();
  renderSessions();
  renderMessages();
}

function syncControlsFromSession() {
  const session = getActiveSession();
  if (!session) return;
  state.config.mode = session.mode;
  state.config.enabledModels = [...session.enabledModels];
}

function updateSessionTitleFromFirstPrompt() {
  const session = getActiveSession();
  if (!session) return;
  const firstUserMessage = session.messages.find((message) => message.role === 'user');
  if (firstUserMessage) {
    session.title = firstUserMessage.content.slice(0, 30) || 'Session';
  }
}

function selectedModels() {
  const session = getActiveSession();
  const enabled = session?.enabledModels || [];
  return MODEL_CATALOG.filter((model) => enabled.includes(model.id));
}

function buildDebateContext() {
  const session = getActiveSession();
  if (!session) return '';

  return session.messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => `${msg.author}: ${msg.content}`)
    .join('\n\n');
}

async function callOpenAI(model, prompt, context) {
  const key = state.config.apiKeys.openai;
  if (!key) throw new Error('Missing OpenAI API key');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages: [
        { role: 'system', content: 'You are part of an AI council discussion. Keep answers concise but useful.' },
        ...(context ? [{ role: 'system', content: `Debate context:\n${context}` }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
  }

  return {
    text: data.choices?.[0]?.message?.content || '',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
  };
}

async function callAnthropic(model, prompt, context) {
  const key = state.config.apiKeys.anthropic;
  if (!key) throw new Error('Missing Anthropic API key');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: 1024,
      system: context ? `Debate context:\n${context}` : undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic request failed (${response.status})`);
  }

  const text = data.content?.map((item) => item.text).join('\n') || '';

  return {
    text,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
    totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
  };
}

async function callGoogle(model, prompt, context) {
  const key = state.config.apiKeys.google;
  if (!key) throw new Error('Missing Google API key');

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: context ? `Debate context:\n${context}\n\nPrompt:\n${prompt}` : prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google request failed (${response.status})`);
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text).join('\n') ||
    'No response from model.';

  return {
    text,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
    totalTokens: data.usageMetadata?.totalTokenCount,
  };
}

async function callModel(model, prompt, context = '') {
  if (model.provider === 'openai') return callOpenAI(model, prompt, context);
  if (model.provider === 'anthropic') return callAnthropic(model, prompt, context);
  if (model.provider === 'google') return callGoogle(model, prompt, context);
  throw new Error(`Unsupported provider ${model.provider}`);
}

function computeCost(model, usage) {
  if (!usage) return 0;

  const input = usage.inputTokens ?? Math.round((usage.totalTokens || 0) * 0.4);
  const output = usage.outputTokens ?? Math.round((usage.totalTokens || 0) * 0.6);

  return (input / 1_000_000) * model.cost.inputPerM + (output / 1_000_000) * model.cost.outputPerM;
}

function upsertModelReplyPlaceholder(model, promptId) {
  const session = getActiveSession();
  if (!session) return null;

  const placeholder = {
    id: uid('msg'),
    role: 'assistant',
    modelId: model.id,
    promptId,
    author: model.label,
    createdAt: nowIso(),
    content: 'Thinking…',
    tokenCount: null,
    status: 'pending',
    costUsd: 0,
  };

  session.messages.push(placeholder);
  return placeholder;
}

async function requestAllModels(prompt, { isDebateRound = false } = {}) {
  const session = getActiveSession();
  if (!session) return;

  const models = selectedModels();
  if (!models.length) {
    dom.statusText.textContent = 'No models selected. Enable at least one model first.';
    return;
  }

  dom.statusText.textContent = `Sending to ${models.length} model(s)...`;
  dom.sendBtn.disabled = true;
  dom.continueDebateBtn.disabled = true;

  const debateContext = isDebateRound ? buildDebateContext() : '';
  const promptId = uid('prompt');
  const placeholders = models.map((model) => ({ model, msg: upsertModelReplyPlaceholder(model, promptId) }));
  render();

  await Promise.all(
    placeholders.map(async ({ model, msg }) => {
      try {
        const result = await callModel(model, prompt, debateContext);
        msg.content = result.text;
        msg.tokenCount = result.totalTokens ?? estimateTokens(result.text);
        msg.status = 'success';
        msg.costUsd = computeCost(model, result);
      } catch (error) {
        msg.content = `Error: ${error.message}`;
        msg.tokenCount = null;
        msg.status = 'error';
        msg.costUsd = 0;
      }
    }),
  );

  session.updatedAt = nowIso();
  session.totalCostUsd = session.messages
    .filter((message) => message.role === 'assistant')
    .reduce((sum, message) => sum + (message.costUsd || 0), 0);

  render();
  saveAll();

  dom.sendBtn.disabled = false;
  dom.continueDebateBtn.disabled = session.mode !== 'debate' || session.debateRoundsUsed >= 2;
  dom.statusText.textContent = 'Responses received.';
}

function createUserMessage(text) {
  const session = getActiveSession();
  if (!session) return;

  session.messages.push({
    id: uid('msg'),
    role: 'user',
    author: 'You',
    content: text,
    createdAt: nowIso(),
    tokenCount: estimateTokens(text),
    status: 'success',
  });

  session.updatedAt = nowIso();
  updateSessionTitleFromFirstPrompt();
}

async function handleSendPrompt(promptText) {
  const session = getActiveSession();
  if (!session) return;

  createUserMessage(promptText);
  render();
  saveAll();

  await requestAllModels(promptText, { isDebateRound: false });
}

async function continueDebateRound() {
  const session = getActiveSession();
  if (!session || session.mode !== 'debate') return;

  if (session.debateRoundsUsed >= 2) {
    dom.statusText.textContent = 'Maximum debate rounds reached.';
    return;
  }

  session.debateRoundsUsed += 1;
  const prompt = `Debate round ${session.debateRoundsUsed}: Review the other model responses and provide your refined argument.`;

  createUserMessage(prompt);
  render();
  saveAll();

  await requestAllModels(prompt, { isDebateRound: true });
}

async function regenerateMessage(messageId) {
  const session = getActiveSession();
  if (!session) return;

  const message = session.messages.find((msg) => msg.id === messageId);
  if (!message || message.role !== 'assistant') return;

  const model = MODEL_CATALOG.find((entry) => entry.id === message.modelId);
  if (!model) return;

  const latestUserPrompt = [...session.messages]
    .reverse()
    .find((msg) => msg.role === 'user' && msg.author === 'You');

  if (!latestUserPrompt) {
    dom.statusText.textContent = 'No user prompt found to regenerate against.';
    return;
  }

  message.status = 'pending';
  message.content = 'Regenerating…';
  render();

  try {
    const context = session.mode === 'debate' ? buildDebateContext() : '';
    const result = await callModel(model, latestUserPrompt.content, context);
    message.content = result.text;
    message.tokenCount = result.totalTokens ?? estimateTokens(result.text);
    message.status = 'success';
    message.costUsd = computeCost(model, result);
    dom.statusText.textContent = `Regenerated response from ${model.label}`;
  } catch (error) {
    message.status = 'error';
    message.content = `Error: ${error.message}`;
    dom.statusText.textContent = `Failed to regenerate ${model.label}`;
  }

  session.totalCostUsd = session.messages
    .filter((msg) => msg.role === 'assistant')
    .reduce((sum, msg) => sum + (msg.costUsd || 0), 0);

  render();
  saveAll();
}

function exportCurrentSession(type) {
  const session = getActiveSession();
  if (!session) return;

  let blob;
  let filename;

  if (type === 'json') {
    blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    filename = `${session.title.replace(/\s+/g, '_').toLowerCase() || 'session'}.json`;
  } else {
    const lines = [
      `# ${session.title}`,
      '',
      `- Mode: ${session.mode}`,
      `- Created: ${new Date(session.createdAt).toLocaleString()}`,
      `- Estimated Cost: $${(session.totalCostUsd || 0).toFixed(4)}`,
      '',
    ];

    session.messages.forEach((msg) => {
      lines.push(`## ${msg.author} (${formatTime(msg.createdAt)})`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    });

    blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    filename = `${session.title.replace(/\s+/g, '_').toLowerCase() || 'session'}.md`;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearSessionMessages() {
  const session = getActiveSession();
  if (!session) return;

  session.messages = [];
  session.debateRoundsUsed = 0;
  session.totalCostUsd = 0;
  session.title = 'New Session';
  session.updatedAt = nowIso();

  dom.statusText.textContent = 'Session cleared.';
  render();
  saveAll();
}

function saveConfigFromInputs() {
  state.config.apiKeys.openai = dom.openaiKey.value.trim();
  state.config.apiKeys.anthropic = dom.anthropicKey.value.trim();
  state.config.apiKeys.google = dom.googleKey.value.trim();

  const checked = [...dom.modelToggles.querySelectorAll('input[type="checkbox"]:checked')].map(
    (input) => input.dataset.modelId,
  );

  state.config.enabledModels = checked;

  const session = getActiveSession();
  if (session) {
    session.enabledModels = [...checked];
    session.mode = dom.responseMode.value;
  }

  saveAll();
  dom.statusText.textContent = 'Configuration saved locally.';
  render();
}

function createNewSession() {
  const fresh = {
    id: uid('session'),
    title: 'New Session',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    mode: state.config.mode,
    debateRoundsUsed: 0,
    enabledModels: [...state.config.enabledModels],
    messages: [],
    totalCostUsd: 0,
  };
  state.sessions.unshift(fresh);
  state.activeSessionId = fresh.id;
  render();
  saveAll();
}

function applyTheme() {
  const theme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
  document.body.classList.toggle('dark', theme === 'dark');
  dom.darkModeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark');
  localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
  dom.darkModeToggle.textContent = isDark ? '☀️' : '🌙';
}

function bindEvents() {
  dom.chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const promptText = dom.promptInput.value.trim();
    if (!promptText) return;

    dom.promptInput.value = '';
    await handleSendPrompt(promptText);
  });

  dom.saveConfigBtn.addEventListener('click', saveConfigFromInputs);

  dom.modelToggles.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    saveConfigFromInputs();
  });

  dom.responseMode.addEventListener('change', () => {
    const session = getActiveSession();
    if (!session) return;
    session.mode = dom.responseMode.value;
    if (session.mode !== 'debate') {
      session.debateRoundsUsed = 0;
    }
    saveAll();
    render();
  });

  dom.continueDebateBtn.addEventListener('click', continueDebateRound);
  dom.clearSessionBtn.addEventListener('click', clearSessionMessages);
  dom.exportJsonBtn.addEventListener('click', () => exportCurrentSession('json'));
  dom.exportMdBtn.addEventListener('click', () => exportCurrentSession('markdown'));
  dom.darkModeToggle.addEventListener('click', toggleTheme);

  dom.sessionTitle.addEventListener('dblclick', () => {
    const nextTitle = prompt('Rename session', dom.sessionTitle.textContent || '');
    if (!nextTitle) return;
    const session = getActiveSession();
    if (!session) return;
    session.title = nextTitle.trim();
    saveAll();
    render();
  });

  dom.sessionsList.addEventListener('dblclick', () => {
    createNewSession();
    dom.statusText.textContent = 'New session created.';
  });
}

function boot() {
  loadAll();
  applyTheme();
  syncControlsFromSession();
  bindEvents();
  render();

  dom.statusText.textContent =
    'Tip: double click the session title to rename it. Double click session list to create new session.';
}

boot();
