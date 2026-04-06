// popup.js

document.getElementById('btn-wordlist').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('wordlist/wordlist.html') });
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') });
  window.close();
});

// 显示 API Key 状态
chrome.storage.local.get('apiKey', ({ apiKey }) => {
  const statusEl = document.getElementById('api-status');
  if (apiKey) {
    statusEl.textContent = '✓ API Key 已配置';
    statusEl.className = 'status-ok';
  } else {
    statusEl.textContent = '⚠ 请先配置 API Key';
    statusEl.className = 'status-warn';
  }
});
