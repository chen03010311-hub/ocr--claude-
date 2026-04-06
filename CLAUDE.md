# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OCR Vocab is a Chrome Extension (Manifest V3) that lets users screenshot-select English words on any webpage, uses a vision LLM to OCR and translate them, and saves results to a local word list.

## No Build Step

This is a pure vanilla JS/HTML/CSS extension — no bundler, no npm, no compilation. Edit files directly and reload the extension in Chrome.

## Loading / Reloading the Extension

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" → select this directory
4. After any code change, click the reload button on the extension card

## Architecture

### Message Flow

```
User (Alt+Shift+S or right-click)
  → background.js: activateOCROnTab()
    → content.js: activateOCRMode() [overlay + drag selection]
      → background.js: handleCapture() [captureVisibleTab → crop → SiliconFlow API]
        → content.js: showResultCard() [display translation]
```

### Key Files

- **`background.js`** — Service Worker. Owns all privileged operations: `captureVisibleTab`, `OffscreenCanvas` image crop, SiliconFlow API call, `chrome.storage.local` writes, context menu and command registration. Also injects content script dynamically if not yet loaded.
- **`content.js`** — Injected into every page. Manages the overlay/drag-selection UI and result/loading/error card display. Communicates with background via `chrome.runtime.sendMessage`.
- **`content.css`** — Styles for overlay, selection box, and all result cards (scoped with `#ocr-` prefixed IDs/classes to avoid conflicts).

### Pages

| Page | Entry point | Purpose |
|------|-------------|---------|
| Popup | `popup/popup.html` | Two buttons: open word list / open settings |
| Word list | `wordlist/wordlist.html` | Card grid from `chrome.storage.local`, supports pin/delete/search |
| Settings | `settings/settings.html` | Save/clear SiliconFlow API key |

### Storage Schema (`chrome.storage.local`)

```js
{
  apiKey: "sk-...",          // SiliconFlow API key
  words: [{
    id,                      // crypto.randomUUID()
    word, phonetic, partOfSpeech,
    chineseTranslation, exampleSentence, exampleTranslation,
    createdAt,               // ms timestamp
    pinnedAt,                // ms timestamp or null
    sourceUrl
  }]
}
```

## API Integration

- **Provider**: 硅基流动 (SiliconFlow) — `https://api.siliconflow.cn/v1/chat/completions`
- **Current model**: `Qwen/Qwen2-VL-72B-Instruct` (vision model, required for image input)
- The model name is a single string in `background.js` → `callOpenAI()`. To swap models, change only that line.
- `response_format: json_object` is **not used** (SiliconFlow doesn't support it). JSON is enforced via prompt, and the response is cleaned of markdown fences before `JSON.parse`.
- Images are cropped with `OffscreenCanvas`, scaled to max 1024px, and encoded as JPEG (quality 0.92) before sending.
- High-DPI screens: all crop coordinates are multiplied by `devicePixelRatio` (passed from content.js).

## manifest.json Permissions

`activeTab`, `tabs`, `storage`, `contextMenus`, `scripting` + `host_permissions` for both `api.openai.com` and `api.siliconflow.cn`.
