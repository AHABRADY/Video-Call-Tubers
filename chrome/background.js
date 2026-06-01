// CornerFriend Background Service Worker
// Automatically recreates the content script panel in the newly active tab
// when switching tabs, keeping the buddy call persistent across all sites.

chrome.runtime.onInstalled.addListener(() => {
  setupAdBlockRules();
});

chrome.runtime.onStartup.addListener(() => {
  setupAdBlockRules();
});

function setupAdBlockRules() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'doubleclick.net',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script', 'image']
      }
    },
    {
      id: 2,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'googlesyndication.com',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script', 'image']
      }
    },
    {
      id: 3,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'youtube.com/pagead/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script']
      }
    },
    {
      id: 4,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'youtube.com/api/stats/ads/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script']
      }
    },
    {
      id: 5,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'youtube.com/get_midroll_info*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script']
      }
    },
    {
      id: 6,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'youtube-nocookie.com/pagead/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script']
      }
    },
    {
      id: 7,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: 'youtube-nocookie.com/api/stats/ads/*',
        resourceTypes: ['xmlhttprequest', 'sub_frame', 'script']
      }
    }
  ];

  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const existingIds = existingRules.map(r => r.id);
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: rules
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('AdBlock rules registration failed:', chrome.runtime.lastError.message);
      } else {
        console.log('CornerFriend AdBlock rules registered successfully.');
      }
    });
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  recreatePanelInTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    recreatePanelInTab(tabId);
  }
});

function recreatePanelInTab(tabId) {
  chrome.storage.local.get(['callState'], (result) => {
    if (chrome.runtime.lastError || !result.callState) return;
    const s = result.callState;
    if (!s.isCallActive) return;

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.url) return;

      // Skip non-web pages
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('about:') || 
          tab.url.startsWith('edge://')) {
        return;
      }

      // Programmatically inject content.js first to ensure it is loaded
      chrome.scripting.executeScript(
        { target: { tabId: tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) return;

          // Resume state (maintaining exact buddy, index, and elapsed time)
          const data = {
            buddies: s.buddies,
            buddyName: s.buddyName,
            currentIndex: s.currentIndex || 0,
            callStartTime: s.callStartTime || Date.now()
          };

          chrome.tabs.sendMessage(tabId, { type: 'CF_START_CALL', data }, (res) => {
            // Suppress error if tab closed/navigated away
            void chrome.runtime.lastError;
          });
        }
      );
    });
  });
}

// Broadcast call updates between popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CF_CHECK_EMBED') {
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${message.videoId}&format=json`)
      .then(res => {
        sendResponse({ restricted: (res.status === 401 || res.status === 403 || res.status === 404) });
      })
      .catch((err) => {
        console.warn('Background oEmbed fetch failed:', err);
        sendResponse({ restricted: false });
      });
    return true; // async
  }

  if (message.type === 'CF_CALL_ENDED') {
    chrome.storage.local.get(['callState'], (result) => {
      if (!chrome.runtime.lastError && result.callState) {
        chrome.storage.local.set({ callState: { ...result.callState, isCallActive: false } });
      }
    });
    // Notify popup if open
    chrome.runtime.sendMessage(message).catch(() => {});
    sendResponse({ success: true });
  }
  return true;
});
