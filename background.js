// background.js - Service Worker

const OPENAI_PROMPT = `You are an English vocabulary assistant. Look at the image provided and identify the English word or phrase shown.

Return ONLY a JSON object (no markdown, no extra text) with exactly these fields:

{
  "word": "the English word or phrase you identified",
  "phonetic": "IPA phonetic transcription, e.g. /\u02c8w\u025c\u02d0rd/",
  "partOfSpeech": "noun | verb | adjective | adverb | phrase | other",
  "chineseTranslation": "\u6700\u51c6\u786e\u7684\u4e2d\u6587\u7ffb\u8bd1\uff08\u7b80\u4f53\uff09",
  "exampleSentence": "A natural English example sentence using this word.",
  "exampleTranslation": "\u4e0a\u9762\u4f8b\u53e5\u7684\u4e2d\u6587\u7ffb\u8bd1"
}

Rules:
- If multiple words are visible, focus on the most prominent or meaningful one.
- If no recognizable English word is found, return: {"error": "No recognizable word found"}
- partOfSpeech must be one of: noun, verb, adjective, adverb, phrase, other
- Keep chineseTranslation concise (under 20 characters).
- Make the example sentence clear and natural (under 20 words).`;

// 注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'activate-ocr',
    title: 'OCR 截图选词',
    contexts: ['page', 'selection', 'image']
  });
});

// 右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'activate-ocr') {
    activateOCROnTab(tab.id);
  }
});

// 快捷键
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'activate-ocr') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) activateOCROnTab(tab.id);
  }
});

// 激活指定 tab 的 OCR 模式，若 content script 未加载则先注入
async function activateOCROnTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'activateOCR' });
  } catch (e) {
    // content script 未注入，手动注入后再激活
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tabId, { action: 'activateOCR' });
    } catch (err) {
      console.error('无法注入 content script:', err.message);
    }
  }
}

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture') {
    handleCapture(message, sender.tab).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // 保持消息通道开启
  }
  if (message.action === 'openSettings') {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  }
});

async function handleCapture(message, tab) {
  const { rect, devicePixelRatio, sourceUrl } = message;

  // 1. 截取当前可见区域
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png'
  });

  // 2. 裁剪选框区域（处理高分屏 dpr）
  const croppedBase64 = await cropImage(dataUrl, rect, devicePixelRatio);

  // 3. 从 storage 读取 API Key
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    return { error: 'NO_API_KEY' };
  }

  // 4. 调用 OpenAI API
  const result = await callOpenAI(croppedBase64, apiKey);

  if (result.error) {
    return result;
  }

  // 5. 保存到 storage
  const wordEntry = await saveWord(result, sourceUrl);

  return { success: true, data: wordEntry };
}

async function cropImage(dataUrl, rect, dpr) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob);

  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.width * dpr);
  const sh = Math.round(rect.height * dpr);

  // 限制最大尺寸为 1024px，避免图片过大
  const MAX_SIZE = 1024;
  const scale = Math.min(1, MAX_SIZE / Math.max(sw, sh));
  const outW = Math.round(sw * scale);
  const outH = Math.round(sh * scale);

  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, outW, outH);

  // 用 jpeg 压缩降低体积
  const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return blobToBase64(croppedBlob);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function callOpenAI(base64Image, apiKey) {
  const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'Qwen/Qwen2-VL-72B-Instruct',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: OPENAI_PROMPT
            }
          ]
        }
      ],
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const detail = errData.error?.message || errData.message || JSON.stringify(errData);
    throw new Error(`API ${response.status}: ${detail}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回内容为空');

  // 去掉模型可能包裹的 markdown 代码块
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

async function saveWord(wordData, sourceUrl) {
  const { words = [] } = await chrome.storage.local.get('words');

  const newWord = {
    id: crypto.randomUUID(),
    word: wordData.word || '',
    phonetic: wordData.phonetic || '',
    partOfSpeech: wordData.partOfSpeech || '',
    chineseTranslation: wordData.chineseTranslation || '',
    exampleSentence: wordData.exampleSentence || '',
    exampleTranslation: wordData.exampleTranslation || '',
    createdAt: Date.now(),
    pinnedAt: null,
    sourceUrl: sourceUrl || ''
  };

  words.unshift(newWord);
  await chrome.storage.local.set({ words });
  return newWord;
}
