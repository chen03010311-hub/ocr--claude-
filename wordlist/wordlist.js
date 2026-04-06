// wordlist.js

const wordGrid = document.getElementById('word-grid');
const emptyState = document.getElementById('empty-state');
const wordCountEl = document.getElementById('word-count');
const searchInput = document.getElementById('search-input');
const clearAllBtn = document.getElementById('clear-all-btn');

let allWords = [];
let searchQuery = '';

const POS_LABEL = {
  noun: '名词', verb: '动词', adjective: '形容词',
  adverb: '副词', phrase: '短语', other: '其他'
};

// 初始化
loadWords();

// 监听 storage 变更（其他页面保存新单词时自动刷新）
chrome.storage.onChanged.addListener((changes) => {
  if (changes.words) {
    allWords = changes.words.newValue || [];
    renderWords();
  }
});

// 搜索
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderWords();
});

// 清空全部
clearAllBtn.addEventListener('click', () => {
  if (allWords.length === 0) return;
  if (!confirm(`确定要删除全部 ${allWords.length} 个单词吗？`)) return;
  chrome.storage.local.set({ words: [] }, () => {
    allWords = [];
    renderWords();
  });
});

function loadWords() {
  chrome.storage.local.get('words', ({ words = [] }) => {
    allWords = words;
    renderWords();
  });
}

function sortWords(words) {
  return [...words].sort((a, b) => {
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
    if (a.pinnedAt && b.pinnedAt) return b.pinnedAt - a.pinnedAt;
    return b.createdAt - a.createdAt;
  });
}

function filterWords(words) {
  if (!searchQuery) return words;
  return words.filter(w =>
    w.word.toLowerCase().includes(searchQuery) ||
    w.chineseTranslation.includes(searchQuery) ||
    (w.exampleSentence || '').toLowerCase().includes(searchQuery)
  );
}

function renderWords() {
  const sorted = sortWords(allWords);
  const filtered = filterWords(sorted);

  wordCountEl.textContent = `共 ${allWords.length} 个单词${searchQuery ? `（筛选 ${filtered.length} 个）` : ''}`;

  if (allWords.length === 0) {
    emptyState.style.display = 'flex';
    wordGrid.innerHTML = '';
    return;
  }

  emptyState.style.display = 'none';

  if (filtered.length === 0) {
    wordGrid.innerHTML = '<div class="no-results">没有匹配的单词</div>';
    return;
  }

  wordGrid.innerHTML = filtered.map(word => createCardHTML(word)).join('');

  // 绑定按钮事件
  wordGrid.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteWord(btn.dataset.id));
  });
  wordGrid.querySelectorAll('.btn-pin').forEach(btn => {
    btn.addEventListener('click', () => togglePin(btn.dataset.id));
  });
}

function createCardHTML(word) {
  const posLabel = POS_LABEL[word.partOfSpeech] || word.partOfSpeech || '';
  const date = new Date(word.createdAt).toLocaleDateString('zh-CN', {
    month: 'numeric', day: 'numeric'
  });
  const isPinned = !!word.pinnedAt;

  return `
    <div class="word-card ${isPinned ? 'pinned' : ''}" data-id="${word.id}">
      <div class="card-actions">
        <button class="btn-pin ${isPinned ? 'pinned' : ''}" data-id="${word.id}" title="${isPinned ? '取消置顶' : '置顶'}">
          ${isPinned ? '📌' : '📍'}
        </button>
        <button class="btn-delete" data-id="${word.id}" title="删除">✕</button>
      </div>

      <div class="card-header">
        <span class="card-word">${escapeHtml(word.word)}</span>
        ${word.phonetic ? `<span class="card-phonetic">${escapeHtml(word.phonetic)}</span>` : ''}
        ${posLabel ? `<span class="card-pos">${escapeHtml(posLabel)}</span>` : ''}
      </div>

      <div class="card-translation">${escapeHtml(word.chineseTranslation)}</div>

      ${word.exampleSentence ? `
        <div class="card-divider"></div>
        <div class="card-example">${escapeHtml(word.exampleSentence)}</div>
        ${word.exampleTranslation ? `<div class="card-example-cn">${escapeHtml(word.exampleTranslation)}</div>` : ''}
      ` : ''}

      <div class="card-footer">
        <span class="card-date">${date}</span>
        ${isSafeUrl(word.sourceUrl) ? `<a href="${escapeHtml(word.sourceUrl)}" target="_blank" class="card-source" title="查看来源">来源</a>` : ''}
      </div>
    </div>
  `;
}

async function deleteWord(id) {
  const updated = allWords.filter(w => w.id !== id);
  await saveWords(updated);
  allWords = updated;
  renderWords();
}

async function togglePin(id) {
  const updated = allWords.map(w => {
    if (w.id !== id) return w;
    return { ...w, pinnedAt: w.pinnedAt ? null : Date.now() };
  });
  await saveWords(updated);
  allWords = updated;
  renderWords();
}

function saveWords(words) {
  return new Promise(resolve => {
    chrome.storage.local.set({ words }, resolve);
  });
}

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
