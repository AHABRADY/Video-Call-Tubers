/* ================================
   CornerFriend - Popup Logic (Lofi Free)
   ================================ */

// ---- State ----
let buddies = [];
let buddyIdCounter = 0;
let isCallActive = false;
let showSaveForm = false;

// ---- DOM refs ----
const $ = (id) => document.getElementById(id);

const urlInput = $('url-input');
const addBtn = $('add-btn');
const urlError = $('url-error');
const buddyNameInput = $('buddy-name');
const queueContainer = $('queue-container');
const queueCount = $('queue-count');
const queueList = $('queue-list');
const emptyError = $('empty-error');
const startCallBtn = $('start-call-btn');
const endCallBtn = $('end-call-btn');
const startCallLabel = $('start-call-label');
const liveBadge = $('live-badge');
const saveBtn = $('save-btn');
const saveForm = $('save-form');
const saveNameInput = $('save-name-input');
const saveConfirmBtn = $('save-confirm-btn');
const favoritesGrid = $('favorites-grid');

// ================================
//  INITIALIZATION
// ================================

document.addEventListener('DOMContentLoaded', () => {
  renderFavorites();
  updateUI();

  // Check if content script has an active call panel in the current tab
  cfSendToContent({ type: 'CF_CHECK_ACTIVE' }, (res) => {
    if (res && res.active) {
      // Restore state from storage
      chrome.storage.local.get(['callState'], (result) => {
        if (chrome.runtime.lastError || !result.callState) return;
        const s = result.callState;
        if (!s.isCallActive) return;
        buddies = s.buddies || [];
        isCallActive = true;
        if (buddyNameInput) buddyNameInput.value = s.buddyName || 'Buddy';
        updateUI();
      });
    } else {
      // Clear any stale call state
      chrome.storage.local.set({ callState: { isCallActive: false } });
    }
  });

  // Listen for background/content script notifications
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CF_CALL_ENDED') {
      isCallActive = false;
      updateUI();
    }
  });
});

// ================================
//  URL INPUT
// ================================

urlInput.addEventListener('input', () => {
  addBtn.disabled = !urlInput.value.trim() || isCallActive;
  if (urlError.textContent) showError('');
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAdd();
});

addBtn.addEventListener('click', handleAdd);

function handleAdd() {
  const trimmed = urlInput.value.trim();
  if (!trimmed) return;

  if (!isValidYouTubeUrl(trimmed)) {
    showError('Enter a valid YouTube URL');
    return;
  }

  if (buddies.some((b) => b.url === trimmed)) {
    showError('Already in queue');
    return;
  }

  const videoId = extractVideoId(trimmed);
  const id = `buddy_${++buddyIdCounter}_${Date.now()}`;
  const name = `Buddy ${buddies.length + 1}`;
  buddies.push({ id, url: trimmed, videoId, name });

  urlInput.value = '';
  addBtn.disabled = true;
  showError('');
  updateUI();
}

function showError(msg) {
  urlError.textContent = msg;
  urlError.classList.toggle('hidden', !msg);
}

// ================================
//  CALL
// ================================

startCallBtn.addEventListener('click', () => {
  if (buddies.length === 0) {
    emptyError.classList.remove('hidden');
    setTimeout(() => emptyError.classList.add('hidden'), 2000);
    return;
  }
  emptyError.classList.add('hidden');
  startCall();
});

endCallBtn.addEventListener('click', endCall);

function startCall() {
  isCallActive = true;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs && tabs[0];
    const creatingTabId = activeTab ? activeTab.id : null;

    const data = {
      buddies,
      buddyName: buddyNameInput.value || 'Buddy',
      currentIndex: 0,
      callStartTime: Date.now(),
      isCallActive: true,
      creatingTabId
    };

    saveCallState(data);

    cfSendToContent({ type: 'CF_START_CALL', data }, (res) => {
      if (!res || !res.success) {
        showPageError();
        isCallActive = false;
        saveCallState({ isCallActive: false });
        updateUI();
      }
    });

    updateUI();
  });
}

function endCall() {
  isCallActive = false;
  saveCallState({ isCallActive: false });
  cfSendToContent({ type: 'CF_END_CALL' });
  updateUI();
}

function saveCallState(customData) {
  chrome.storage.local.get(['callState'], (result) => {
    const existing = result.callState || {};
    const state = customData || {
      isCallActive,
      buddies,
      buddyName: buddyNameInput.value || 'Buddy',
      currentIndex: 0,
      callStartTime: Date.now(),
      creatingTabId: existing.creatingTabId
    };
    chrome.storage.local.set({ callState: state });
  });
}

function cfSendToContent(msg, callback) {
  chrome.storage.local.get(['callState'], (result) => {
    const s = result.callState || {};
    const targetTabId = s.creatingTabId;

    if (targetTabId && msg.type !== 'CF_START_CALL') {
      chrome.tabs.sendMessage(targetTabId, msg, (res) => {
        if (!chrome.runtime.lastError) {
          if (callback) callback(res);
        } else {
          cfSendToActiveTab(msg, callback);
        }
      });
    } else {
      cfSendToActiveTab(msg, callback);
    }
  });
}

function cfSendToActiveTab(msg, callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs.length) {
      if (callback) callback(null);
      return;
    }
    const tab = tabs[0];

    // Can't inject into chrome://, extension pages, new tab, edge://, or youtube.com
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.includes('youtube.com') ||
      tab.url.includes('youtube-nocookie.com')
    )) {
      if (callback) callback(null);
      return;
    }

    // Try sending to content script first
    chrome.tabs.sendMessage(tab.id, msg, (res) => {
      if (!chrome.runtime.lastError) {
        if (callback) callback(res);
        return;
      }

      // Inject on-demand
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            console.warn('CornerFriend: could not inject content script:', chrome.runtime.lastError.message);
            if (callback) callback(null);
            return;
          }
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, msg, (res2) => {
              if (chrome.runtime.lastError) {
                if (callback) callback(null);
                return;
              }
              if (callback) callback(res2);
            });
          }, 150);
        }
      );
    });
  });
}

function showPageError() {
  const errEl = document.getElementById('empty-error');
  if (errEl) {
    errEl.textContent = 'Navigate to any other webpage except youtube.com then click call';
    errEl.classList.remove('hidden');
    setTimeout(() => errEl.classList.add('hidden'), 4000);
  }
}

// ================================
//  FAVORITES
// ================================

saveBtn.addEventListener('click', () => {
  showSaveForm = !showSaveForm;
  saveForm.classList.toggle('hidden', !showSaveForm);
  if (showSaveForm) saveNameInput.focus();
});

saveNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSave();
});

saveConfirmBtn.addEventListener('click', handleSave);

function handleSave() {
  const name = saveNameInput.value.trim();
  if (!name || buddies.length === 0) return;

  saveFavorite(name, buddies.map((b) => b.url));
  saveNameInput.value = '';
  showSaveForm = false;
  saveForm.classList.add('hidden');
  renderFavorites();
}

function renderFavorites() {
  const favs = getFavorites();

  if (favs.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="fav-empty">
        <svg class="fav-empty-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        <p class="fav-empty-text">No saved buddies yet</p>
        <p class="fav-empty-sub">Add URLs and save your favorite setups</p>
      </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'fav-grid';

  favs.forEach((fav) => {
    const urls = JSON.parse(fav.urls);
    const card = document.createElement('div');
    card.className = 'fav-card';

    card.innerHTML = `
      <div class="fav-card-info">
        <div class="fav-card-name">${escapeHtml(fav.name)}</div>
        <div class="fav-card-meta">
          <span class="fav-card-vids">${urls.length} ${urls.length === 1 ? 'vid' : 'vids'}</span>
        </div>
      </div>
      <div class="fav-card-actions">
        <button class="fav-action-btn fav-action-play" title="Launch buddy" ${isCallActive ? 'disabled' : ''}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
        <button class="fav-action-btn fav-action-delete" title="Delete">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>`;

    card.querySelector('.fav-action-play').addEventListener('click', () => launchFavorite(fav));
    card.querySelector('.fav-action-delete').addEventListener('click', () => {
      deleteFavorite(fav.id);
      renderFavorites();
    });

    grid.appendChild(card);
  });

  favoritesGrid.innerHTML = '';
  favoritesGrid.appendChild(grid);
}

function launchFavorite(fav) {
  const urls = JSON.parse(fav.urls);
  buddies = [];
  buddyIdCounter = 0;

  urls.forEach((url) => {
    const videoId = extractVideoId(url);
    if (videoId) {
      buddies.push({
        id: `buddy_${++buddyIdCounter}_${Date.now()}`,
        url,
        videoId,
        name: fav.name,
      });
    }
  });

  if (buddyNameInput) buddyNameInput.value = fav.name;
  updateUI();
  startCall();
}

// ================================
//  UPDATE UI STATE
// ================================

function updateUI() {
  const hasBuddies = buddies.length > 0;
  const canSave = hasBuddies && !isCallActive;
  const buddyName = (buddyNameInput ? buddyNameInput.value : '') || 'Buddy';

  // Live badge
  liveBadge.classList.toggle('hidden', !isCallActive);

  // Disable inputs during call
  urlInput.disabled = isCallActive;
  buddyNameInput.disabled = isCallActive;
  addBtn.disabled = !urlInput.value.trim() || isCallActive;

  // Queue
  if (hasBuddies) {
    queueContainer.classList.remove('hidden');
    queueCount.textContent = buddies.length;
    renderQueue();
  } else {
    queueContainer.classList.add('hidden');
  }

  // Buttons
  startCallBtn.classList.toggle('hidden', !hasBuddies || isCallActive);
  endCallBtn.classList.toggle('hidden', !isCallActive);

  if (hasBuddies && !isCallActive) {
    startCallLabel.textContent = `Call ${buddyName}`;
  }

  // Save button visibility
  saveBtn.classList.toggle('hidden', !canSave);
  if (!canSave && showSaveForm) {
    showSaveForm = false;
    saveForm.classList.add('hidden');
  }

  // Re-render favorites
  renderFavorites();
}

function renderQueue() {
  queueList.innerHTML = '';
  buddies.forEach((buddy, index) => {
    const badge = document.createElement('div');
    badge.className = 'queue-badge';

    const num = document.createElement('span');
    num.className = 'queue-badge-num';
    num.textContent = `${index + 1}.`;

    const name = document.createElement('span');
    name.className = 'queue-badge-name';
    name.title = buddy.url;
    name.textContent = buddy.name;

    badge.appendChild(num);
    badge.appendChild(name);

    if (!isCallActive) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'queue-badge-remove';
      removeBtn.title = 'Remove';
      removeBtn.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      removeBtn.addEventListener('click', () => {
        buddies = buddies.filter((b) => b.id !== buddy.id);
        updateUI();
      });
      badge.appendChild(removeBtn);
    }

    queueList.appendChild(badge);
  });
}

// ================================
//  BUDDY NAME SYNC
// ================================

buddyNameInput.addEventListener('input', () => {
  const name = buddyNameInput.value || 'Buddy';
  if (!isCallActive && buddies.length > 0) {
    startCallLabel.textContent = `Call ${name}`;
  }
});

// ================================
//  UTILS
// ================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
