# LLM Council Chat Interface

A client-side, offline-friendly chat app for talking to multiple LLM providers in one place.
It behaves like a group chat where each model has its own response stream, status, and styling.

## Features

- API configuration panel for:
  - OpenAI
  - Anthropic
  - Google (Gemini)
- Stores keys and model selection in `localStorage`
- Parallel mode (default): all selected models respond independently
- Debate mode: run up to 2 manual follow-up rounds where models see prior conversation context
- Session management:
  - Save/load session history in `localStorage`
  - Clear current session
  - Create additional sessions
  - Rename sessions
- Export current session as:
  - JSON
  - Markdown
- Chat UI features:
  - User messages on the right, model responses on the left
  - Per-model color/avatar identity
  - Timestamp + token counts (if available from API)
  - Per-model status (`pending`, `success`, `error`)
  - Response regeneration per model
  - Copy response to clipboard
  - Basic markdown rendering
- UI/UX:
  - Responsive layout
  - Dark mode toggle
  - Loading indicators and clear error text
  - Estimated token-based cost tracker

## File Structure

- `index.html`
- `styles.css`
- `app.js`
- `.gitignore`
- `README.md`

## Run Locally

### Option A: Open directly

Open `index.html` in your browser.

### Option B: Local static server (recommended)

```bash
python3 -m http.server 8080
```

Then open: `http://localhost:8080`

## Usage

1. Enter API keys in the sidebar.
2. Toggle the models you want active.
3. Click **Save Config**.
4. Choose mode:
   - **Parallel**
   - **Debate**
5. Send a prompt.
6. In Debate mode, press **Continue Debate** to run another round (max 2 rounds).
7. Export or clear sessions as needed.

## API Endpoints Used

- OpenAI: `https://api.openai.com/v1/chat/completions`
- Anthropic: `https://api.anthropic.com/v1/messages`
- Google Gemini: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

## Security Notes

- This is a client-side demo, so keys are visible to browser JavaScript.
- Keys are stored in `localStorage` on your machine.
- Do not commit real API keys into source control.
- Treat session exports carefully if they contain sensitive prompts or responses.

## Limitations

- API providers may enforce CORS, quota, or browser-key restrictions depending on account/project configuration.
- Token usage metadata differs by provider; estimates are used when exact values are unavailable.
- Offline capability here means the interface and saved sessions still work locally; live model calls still require internet access.
