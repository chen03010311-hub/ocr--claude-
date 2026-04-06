// settings.js

document.getElementById('back-btn').addEventListener('click', () => history.back());

const apiKeyInput = document.getElementById('api-key-input');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const statusMsg = document.getElementById('status-msg');
const toggleBtn = document.getElementById('toggle-visibility');

// 加载已保存的 API Key
chrome.storage.local.get('apiKey', ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
});

// 显示/隐藏 API Key
toggleBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

// 保存
saveBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('请输入 API Key', 'error');
    return;
  }
  if (key.length < 20) {
    showStatus('API Key 长度不正确，请检查', 'error');
    return;
  }
  chrome.storage.local.set({ apiKey: key }, () => {
    showStatus('API Key 已保存', 'success');
  });
});

// 清除
clearBtn.addEventListener('click', () => {
  if (!confirm('确定要清除 API Key 吗？')) return;
  chrome.storage.local.remove('apiKey', () => {
    apiKeyInput.value = '';
    showStatus('API Key 已清除', 'success');
  });
});

function showStatus(msg, type) {
  statusMsg.textContent = msg;
  statusMsg.className = 'status-msg status-' + type;
  clearTimeout(statusMsg._timer);
  statusMsg._timer = setTimeout(() => {
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';
  }, 3000);
}
