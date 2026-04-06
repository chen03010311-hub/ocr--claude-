// content.js - 注入页面脚本

let ocrActive = false;
let overlay = null;
let selectionBox = null;
let startX = 0, startY = 0;
let isDragging = false;

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'activateOCR') {
    activateOCRMode();
  }
});

function activateOCRMode() {
  if (ocrActive) return;
  ocrActive = true;

  // 创建遮罩层
  overlay = document.createElement('div');
  overlay.id = 'ocr-overlay';
  document.body.appendChild(overlay);

  // 创建选框
  selectionBox = document.createElement('div');
  selectionBox.id = 'ocr-selection-box';
  document.body.appendChild(selectionBox);

  // 鼠标事件
  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);

  // ESC 取消
  document.addEventListener('keydown', onKeyDown);
}

function onMouseDown(e) {
  e.preventDefault();
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;

  selectionBox.style.left = startX + 'px';
  selectionBox.style.top = startY + 'px';
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
  selectionBox.style.display = 'block';
}

function onMouseMove(e) {
  if (!isDragging) return;
  e.preventDefault();

  const currentX = e.clientX;
  const currentY = e.clientY;

  selectionBox.style.left = Math.min(startX, currentX) + 'px';
  selectionBox.style.top = Math.min(startY, currentY) + 'px';
  selectionBox.style.width = Math.abs(currentX - startX) + 'px';
  selectionBox.style.height = Math.abs(currentY - startY) + 'px';
}

function onMouseUp(e) {
  if (!isDragging) return;
  e.preventDefault();
  isDragging = false;

  const rect = {
    x: parseInt(selectionBox.style.left),
    y: parseInt(selectionBox.style.top),
    width: parseInt(selectionBox.style.width),
    height: parseInt(selectionBox.style.height)
  };

  // 记录选框位置用于显示结果卡片
  const resultRect = { ...rect };

  deactivateOverlay();

  // 过滤误触
  if (rect.width < 5 || rect.height < 5) return;

  // 显示 loading 卡片
  showLoadingCard(resultRect);

  // 发送给 background 处理
  chrome.runtime.sendMessage({
    action: 'capture',
    rect: rect,
    devicePixelRatio: window.devicePixelRatio,
    sourceUrl: window.location.href
  }, (response) => {
    removeLoadingCard();
    if (chrome.runtime.lastError) {
      showErrorCard(resultRect, '扩展通信错误，请刷新页面后重试');
      return;
    }
    if (!response) {
      showErrorCard(resultRect, '未收到响应，请重试');
      return;
    }
    if (response.error === 'NO_API_KEY') {
      showNoApiKeyCard(resultRect);
    } else if (response.error) {
      showErrorCard(resultRect, response.error);
    } else if (response.success) {
      showResultCard(response.data, resultRect);
    }
  });
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    deactivateOverlay();
  }
}

function deactivateOverlay() {
  if (overlay) {
    overlay.removeEventListener('mousedown', onMouseDown);
    overlay.removeEventListener('mousemove', onMouseMove);
    overlay.removeEventListener('mouseup', onMouseUp);
    overlay.remove();
    overlay = null;
  }
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  document.removeEventListener('keydown', onKeyDown);
  ocrActive = false;
  isDragging = false;
}

// ---------- 卡片显示逻辑 ----------

function getCardPosition(rect) {
  const cardWidth = 320;
  const cardHeight = 200;
  const margin = 10;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.x;
  let top = rect.y + rect.height + margin;

  // 超出底部则显示在选框上方
  if (top + cardHeight > viewportHeight) {
    top = rect.y - cardHeight - margin;
  }
  // 超出右边
  if (left + cardWidth > viewportWidth) {
    left = viewportWidth - cardWidth - margin;
  }
  // 保证不超出左边和顶部
  left = Math.max(margin, left);
  top = Math.max(margin, top);

  return { left, top };
}

function removeExistingCard() {
  document.getElementById('ocr-result-card')?.remove();
}

function showLoadingCard(rect) {
  removeExistingCard();
  const { left, top } = getCardPosition(rect);
  const card = document.createElement('div');
  card.id = 'ocr-result-card';
  card.className = 'ocr-card ocr-loading';
  card.style.left = left + 'px';
  card.style.top = top + 'px';
  card.innerHTML = `
    <div class="ocr-spinner"></div>
    <span class="ocr-loading-text">识别中...</span>
  `;
  document.body.appendChild(card);
}

function removeLoadingCard() {
  document.getElementById('ocr-result-card')?.remove();
}

function showResultCard(data, rect) {
  removeExistingCard();
  const { left, top } = getCardPosition(rect);

  const card = document.createElement('div');
  card.id = 'ocr-result-card';
  card.className = 'ocr-card';
  card.style.left = left + 'px';
  card.style.top = top + 'px';

  const posLabel = {
    noun: '名词', verb: '动词', adjective: '形容词',
    adverb: '副词', phrase: '短语', other: '其他'
  };

  card.innerHTML = `
    <button class="ocr-close-btn" title="关闭">✕</button>
    <div class="ocr-card-header">
      <span class="ocr-word">${escapeHtml(data.word)}</span>
      <span class="ocr-phonetic">${escapeHtml(data.phonetic)}</span>
      <span class="ocr-pos">${escapeHtml(posLabel[data.partOfSpeech] || data.partOfSpeech)}</span>
    </div>
    <div class="ocr-translation">${escapeHtml(data.chineseTranslation)}</div>
    <div class="ocr-divider"></div>
    <div class="ocr-example">${escapeHtml(data.exampleSentence)}</div>
    <div class="ocr-example-cn">${escapeHtml(data.exampleTranslation)}</div>
    <div class="ocr-saved-hint">已保存到单词本</div>
  `;

  document.body.appendChild(card);
  setupCardClose(card);
}

function showErrorCard(rect, message) {
  removeExistingCard();
  const { left, top } = getCardPosition(rect);

  const card = document.createElement('div');
  card.id = 'ocr-result-card';
  card.className = 'ocr-card ocr-error-card';
  card.style.left = left + 'px';
  card.style.top = top + 'px';
  card.innerHTML = `
    <button class="ocr-close-btn" title="关闭">✕</button>
    <div class="ocr-error-icon">⚠</div>
    <div class="ocr-error-msg">${escapeHtml(message)}</div>
  `;
  document.body.appendChild(card);
  setupCardClose(card);
}

function showNoApiKeyCard(rect) {
  removeExistingCard();
  const { left, top } = getCardPosition(rect);

  const card = document.createElement('div');
  card.id = 'ocr-result-card';
  card.className = 'ocr-card ocr-error-card';
  card.style.left = left + 'px';
  card.style.top = top + 'px';
  card.innerHTML = `
    <button class="ocr-close-btn" title="关闭">✕</button>
    <div class="ocr-error-icon">🔑</div>
    <div class="ocr-error-msg">请先设置 OpenAI API Key</div>
    <button class="ocr-settings-btn" id="ocr-goto-settings">前往设置</button>
  `;
  document.body.appendChild(card);

  card.querySelector('#ocr-goto-settings').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSettings' });
    card.remove();
  });

  setupCardClose(card);
}

function setupCardClose(card) {
  card.querySelector('.ocr-close-btn')?.addEventListener('click', () => {
    card.remove();
  });

  // 点击卡片外部关闭
  setTimeout(() => {
    function outsideClick(e) {
      if (!card.contains(e.target)) {
        card.remove();
        document.removeEventListener('click', outsideClick);
      }
    }
    document.addEventListener('click', outsideClick);
  }, 200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
