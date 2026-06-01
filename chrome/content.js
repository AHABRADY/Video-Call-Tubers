// CornerFriend Content Script & Subframe Ad Skipper
// Injected into web pages to create the floating buddy panel
// Running inside a real https:// page bypasses YouTube Error 153

if (window.location.host.includes('youtube.com') || window.location.host.includes('youtube-nocookie.com')) {
  // Inside the YouTube player iframe context: run high-frequency automatic ad skipper
  setInterval(() => {
    try {
      // 1. Click skip ad buttons
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container');
      if (skipBtn) {
        skipBtn.click();
      }

      // 2. Fast forward ads
      const ad = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
      const video = document.querySelector('video');
      if (ad && video && !isNaN(video.duration)) {
        video.currentTime = video.duration - 0.1;
      }
    } catch (e) {}
  }, 250);
} else {
  if (!window.cfLoaded) {
    window.cfLoaded = true;

// ---- Inline utilities (can't import shared.js in content scripts) ----

function cfExtractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function cfBuildEmbedUrl(videoId, { autoplay = true, muted = true, loop = false } = {}) {
  const p = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute:     '1',
    controls: '0', rel: '0', modestbranding: '1',
    iv_load_policy: '3', disablekb: '1', fs: '0', playsinline: '1',
    enablejsapi: '1'
  });
  if (loop) { p.set('loop', '1'); p.set('playlist', videoId); }
  p.set('origin', window.location.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}

// ---- State ----
let cfState = {
  buddies: [], currentIndex: 0, buddyName: 'Buddy',
  videoMuted: true, callStartTime: null,
};

let cfHost = null;       // host DOM element
let cfShadow = null;     // shadow root
let cfRoot = null;       // active document/shadow root container (inline or PiP)
let pipWindow = null;    // PiP window reference
let cfTimer = null;      // call timer interval
let cfDragState = null;  // drag state

// ---- Message listener ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'CF_START_CALL':
      cfStartCall(msg.data);
      sendResponse({ success: true });
      break;
    case 'CF_END_CALL':
      cfEndCall();
      sendResponse({ success: true });
      break;
    case 'CF_CHECK_ACTIVE':
      sendResponse({ active: cfHost !== null });
      break;
  }
  return true;
});

// ---- Call management ----
function cfStartCall(data) {
  cfState.buddies      = data.buddies;
  cfState.buddyName    = data.buddyName;
  cfState.videoMuted   = data.videoMuted !== undefined ? data.videoMuted : true;
  const indexChanged   = cfState.currentIndex !== data.currentIndex;
  cfState.currentIndex = data.currentIndex || 0;
  cfState.callStartTime = data.callStartTime || Date.now();

  if (!cfHost) {
    cfCreatePanel();
  } else {
    if (indexChanged) {
      cfLoadBuddy(cfState.currentIndex);
    }
    cfUpdateControls();
  }
}

function cfEndCall() {
  cfDestroyPanel();
  clearInterval(cfTimer);
  cfTimer = null;
  // Notify popup
  chrome.runtime.sendMessage({ type: 'CF_CALL_ENDED' }).catch(() => {});
}

// ---- Panel creation ----
function cfCreatePanel() {
  if (cfHost) cfDestroyPanel();

  cfHost = document.createElement('div');
  cfHost.id = 'cornerfriend-host';
  Object.assign(cfHost.style, {
    position: 'fixed',
    top: '60px',
    right: '16px',
    width: '160px',
    height: '250px',
    zIndex: '2147483647',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.75), inset 0 0 0 1.5px rgba(255,255,255,0.15)',
    userSelect: 'none',
  });

  cfShadow = cfHost.attachShadow({ mode: 'open' });
  cfShadow.innerHTML = cfGetTemplate();
  cfRoot = cfShadow;

  document.documentElement.appendChild(cfHost);

  cfBindEvents();
  cfLoadBuddy(cfState.currentIndex);
  cfAdjustPlayerScale();
}

function cfDestroyPanel() {
  if (cfHost) { cfHost.remove(); cfHost = null; cfShadow = null; cfRoot = null; }
  clearInterval(cfTimer);
}

// ---- Template ----
// ---- Template ----
function cfGetTemplate() {
  return `
<style>
  :host { display: block; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  #panel {
    width: 100%; height: 100%;
    background: #000;
    position: relative;
    overflow: hidden;
    border-radius: 16px;
  }

  /* Scaled wrapper container to force desktop mode and crop vertical video cleanly */
  #yt-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 16px;
    background: #000;
    z-index: 1;
    pointer-events: none;
  }

  #yt-scale-wrap {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    z-index: 1;
  }

  iframe {
    width: 100%;
    height: 100%;
    border: none;
    pointer-events: auto;
    background: #000;
  }


  /* ---- Click Shield: intercepts all hover & clicks to block YouTube UI. Class 'unlocked' makes it click-through ---- */
  #click-shield {
    position: absolute;
    inset: 0;
    z-index: 6;
    background: transparent;
    pointer-events: auto; /* Active by default (locks player) */
    cursor: default;
  }
  #click-shield.unlocked {
    pointer-events: none; /* Inactive (allows clicks to pass to YouTube for Skip Ad / interactions) */
  }

  /* ---- Drag handle ---- */
  #drag {
    position: absolute; top: 0; left: 0; right: 0;
    height: 32px; z-index: 30; cursor: move;
    display: flex; align-items: center; justify-content: center;
  }
  #drag-dots {
    display: flex; gap: 2px;
    opacity: 0; transition: opacity 0.2s ease;
  }
  #panel:hover #drag-dots { opacity: 0.45; }
  #drag-dots span {
    width: 3px; height: 3px; border-radius: 50%;
    background: #fff; display: block;
  }

  /* ---- Floating navigation arrows (FaceTime side navigation) ---- */
  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(15, 15, 20, 0.45);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 15;
    opacity: 0;
    padding: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  #panel:hover .nav-btn {
    opacity: 0.85;
  }
  .nav-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-50%) scale(1.1);
    opacity: 1 !important;
  }
  .nav-btn.left { left: 8px; }
  .nav-btn.right { right: 8px; }
  .nav-btn.hidden { display: none !important; }

  /* ---- High-end Top and Bottom gradients ---- */
  .grad-top {
    position: absolute; inset: 0; bottom: auto;
    height: 80px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.3) 50%, transparent);
    pointer-events: none; z-index: 5;
  }
  .grad-bot {
    position: absolute; inset: 0; top: auto;
    height: 100px;
    background: linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.3) 50%, transparent);
    pointer-events: none; z-index: 5;
  }

  /* ---- Top FaceTime overlay ---- */
  #top-ov {
    position: absolute; top: 0; left: 0; right: 0;
    padding: 10px 12px; z-index: 10;
    display: flex; flex-direction: column; align-items: center;
    pointer-events: none;
  }
  .top-meta-row {
    display: flex; justify-content: space-between; align-items: center; width: 100%;
    margin-bottom: 2px; pointer-events: auto;
  }

  .top-btn {
    width: 24px; height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s ease; padding: 0;
    pointer-events: auto;
  }
  .top-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    transform: scale(1.05);
  }
  .top-btn.unlocked {
    background: rgba(74, 222, 128, 0.2);
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
  }

  .buddy-idx {
    font-size: 8px; font-weight: 600; color: rgba(255,255,255,0.6);
    background: rgba(0, 0, 0, 0.4); padding: 3px 6px; border-radius: 20px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);
    font-family: monospace;
  }

  .top-center-stack {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; width: 100%; margin-top: 2px;
  }

  .buddy-name {
    font-size: 13px; font-weight: 600; color: #fff;
    text-shadow: 0 2px 8px rgba(0,0,0,0.8);
    max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    letter-spacing: -0.01em;
  }
  
  .timer {
    font-size: 9px; font-weight: 500; color: rgba(255,255,255,0.75);
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    margin-top: 1px;
    font-family: -apple-system, BlinkMacSystemFont, monospace;
  }

  /* ---- Bottom FaceTime controls ---- */
  #bot-ov {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 10px 12px 14px; z-index: 10;
    display: flex; flex-direction: column; align-items: center;
    pointer-events: auto;
  }
  .ctrl-row {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    width: 100%;
  }

  .ctrl-btn {
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 50%;
    color: #fff;
    cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); padding: 0;
    box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  }
  .ctrl-btn:hover { background: rgba(255, 255, 255, 0.3); transform: scale(1.1); box-shadow: 0 10px 28px rgba(0,0,0,0.45); }
  .ctrl-btn:active { transform: scale(0.95); }
  .ctrl-btn.muted { background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
  .ctrl-btn.muted:hover { background: rgba(239, 68, 68, 0.3); }
  .ctrl-btn.lofi-on { background: rgba(74, 222, 128, 0.2); color: #4ade80; border-color: rgba(74, 222, 128, 0.3); }
  .ctrl-btn.lofi-on:hover { background: rgba(74, 222, 128, 0.3); }
  .ctrl-btn.end { background: #ff3b30; color: #fff; border: none; box-shadow: 0 8px 24px rgba(255, 59, 48, 0.35); }
  .ctrl-btn.end:hover { background: #e02e24; box-shadow: 0 10px 28px rgba(255, 59, 48, 0.45); }
  .ctrl-btn.hidden { display: none; }

  .vol-row {
    display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px;
    background: rgba(0, 0, 0, 0.4); padding: 4px 8px; border-radius: 20px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08);
    width: 90%;
  }
  .vol-row.hidden { display: none; }

  input[type=range] {
    width: 60px; height: 3px; -webkit-appearance: none;
    background: rgba(255,255,255,0.25); border-radius: 2px;
    cursor: pointer; outline: none;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 9px; height: 9px;
    border-radius: 50%; background: #4ade80; cursor: pointer;
    box-shadow: 0 1px 4px rgba(74,222,128,0.5);
  }
  .station-lbl {
    font-size: 8px; color: rgba(255,255,255,0.7);
    max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-weight: 500;
  }

  /* ---- Resize handle (hover-only) ---- */
  #resize {
    position: absolute; bottom: 2px; right: 2px;
    width: 14px; height: 14px; cursor: se-resize; z-index: 20;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s ease;
  }
  #panel:hover #resize { opacity: 1; }

  /* ---- Error overlay for embedding-disabled videos ---- */
  #embed-error {
    display: none;
    position: absolute; inset: 0; z-index: 25;
    background: rgba(10,10,12,0.97);
    flex-direction: column; align-items: center; justify-content: center;
    padding: 20px; text-align: center; gap: 10px;
    border-radius: 16px;
  }
  #embed-error.visible { display: flex; }
  .err-icon { font-size: 24px; }
  .err-title { font-size: 11px; font-weight: 600; color: #f4f4f5; }
  .err-body { font-size: 9px; color: #71717a; line-height: 1.4; }
  .err-link {
    display: inline-flex; align-items: center; gap: 4px;
    margin-top: 4px; padding: 6px 12px;
    background: rgba(239,68,68,0.15); color: #f87171;
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 6px; font-size: 9px; font-weight: 500;
    text-decoration: none; cursor: pointer;
    transition: background 0.15s;
  }
  .err-link:hover { background: rgba(239,68,68,0.25); }
</style>

<div id="panel">
  <!-- Drag handle & Grab overlay -->
  <div id="drag">
    <div id="drag-dots">
      <span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
  </div>

  <!-- Transparent click shield to intercept clicks and prevent YouTube overlays -->
  <div id="click-shield"></div>

  <!-- YouTube iframe desktop scaled wrapper -->
  <div id="yt-container">
    <div id="yt-scale-wrap">
      <iframe id="yt" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" title="Buddy Video"></iframe>
    </div>
  </div>

  <!-- Navigation arrows for multi-buddy calls -->
  <button class="nav-btn left hidden" id="prev-btn" title="Previous Buddy">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>
  <button class="nav-btn right hidden" id="next-btn" title="Next Buddy">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>

  <!-- Always-on gradients -->
  <div class="grad-top"></div>
  <div class="grad-bot"></div>

  <!-- Top info — centered buddy name like FaceTime -->
  <div id="top-ov">
    <div class="top-meta-row" style="justify-content: flex-end;">
      <div class="buddy-idx" id="buddy-idx"></div>
    </div>
    <div class="top-center-stack">
      <span class="buddy-name" id="buddy-name">Buddy</span>
    </div>
  </div>

  <!-- Bottom controls — FaceTime call layout -->
  <div id="bot-ov">
    <div class="ctrl-row">
      <button class="ctrl-btn muted" id="mute-btn" title="Toggle video audio">
        <svg id="mute-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      </button>
      <button class="ctrl-btn end" id="end-btn" title="End call">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(135deg);">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Embedding-disabled error overlay -->
  <div id="embed-error">
    <span class="err-icon">🚫</span>
    <p class="err-title">Embedding disabled</p>
    <p class="err-body">This video's creator has disabled embedding.<br>Watch it on YouTube.</p>
    <a id="watch-yt-link" class="err-link" target="_blank">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
      Open on YouTube
    </a>
  </div>

  <!-- Resize handle -->
  <div id="resize">
    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.35)" stroke-width="2">
      <path stroke-linecap="round" d="M4 20L20 4M9 20L20 9M14 20L20 14"/>
    </svg>
  </div>
</div>`;
}
// ---- YouTube error handling and seamless looping via postMessage ----
window.addEventListener('message', (event) => {
  if (typeof event.origin !== 'string') return;
  if (!event.origin.includes('youtube') && !event.origin.includes('youtube-nocookie')) return;
  try {
    let data = event.data;
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    // Only show embed error for actual embed-restriction error codes (101 / 150)
    if (data.event === 'onError') {
      const code = typeof data.info === 'number' ? data.info : (data.info && data.info.error);
      if (code === 101 || code === 150) {
        const currentBuddy = cfState.buddies[cfState.currentIndex];
        if (currentBuddy) {
          cfShowEmbedError(currentBuddy.videoId);
        }
      }
    }

    // Subscribe to state change updates once the iframe is loaded and ready
    if (data.event === 'onReady' || data.event === 'initialDelivery') {
      cfSendPlayerCommand('addEventListener', ['onStateChange']);
    }

    // Seamless loop: listen for player ended state and instantly seek to 0 and play.
    // This bypasses YouTube's playlist-based loop reload which causes "loading" spinners and touch UI overlays!
    if (
      (data.event === 'infoDelivery' && data.info && data.info.playerState === 0) ||
      (data.event === 'onStateChange' && data.info === 0) ||
      (data.info && data.info.playerState === 0)
    ) {
      cfSendPlayerCommand('seekTo', [0, true]);
      cfSendPlayerCommand('playVideo');
    }
  } catch (e) {
    // Ignore non-JSON messages
  }
});

function cfShowEmbedError(videoId) {
  if (!cfRoot) return;
  const errEl = cfRoot.getElementById('embed-error');
  if (errEl) {
    errEl.classList.add('visible');
    const linkEl = cfRoot.getElementById('watch-yt-link');
    if (linkEl && videoId) {
      linkEl.href = `https://www.youtube.com/watch?v=${videoId}`;
    }
  }
}

// ---- Bind events after shadow DOM is created ----
function cfBindEvents() {
  if (!cfRoot) return;

  const panel = cfRoot.getElementById('panel');
  const drag  = cfRoot.getElementById('drag');

  // Close/end call
  cfRoot.getElementById('end-btn').addEventListener('click', cfEndCall);

  // Mute toggle
  cfRoot.getElementById('mute-btn').addEventListener('click', () => {
    cfState.videoMuted = !cfState.videoMuted;
    if (cfState.videoMuted) {
      cfSendPlayerCommand('mute');
    } else {
      cfSendPlayerCommand('unMute');
    }
    cfUpdateControls();
    cfSaveState();
  });

  // Prev/Next
  if (cfState.buddies.length > 1) {
    cfRoot.getElementById('prev-btn').classList.remove('hidden');
    cfRoot.getElementById('next-btn').classList.remove('hidden');
  }

  cfRoot.getElementById('prev-btn').addEventListener('click', () => {
    cfState.currentIndex = (cfState.currentIndex - 1 + cfState.buddies.length) % cfState.buddies.length;
    cfLoadBuddy(cfState.currentIndex);
    cfSaveState();
  });

  cfRoot.getElementById('next-btn').addEventListener('click', () => {
    cfState.currentIndex = (cfState.currentIndex + 1) % cfState.buddies.length;
    cfLoadBuddy(cfState.currentIndex);
    cfSaveState();
  });

  // Drag on top bar and also click shield (FaceTime grab style!)
  if (drag) drag.addEventListener('mousedown', cfDragStart);
  const shield = cfRoot.getElementById('click-shield');
  if (shield) shield.addEventListener('mousedown', cfDragStart);

  // Resize
  const resizeBtn = cfRoot.getElementById('resize');
  if (resizeBtn) resizeBtn.addEventListener('mousedown', cfResizeStart);


  const iframeEl = cfRoot.getElementById('yt');
  if (iframeEl) {
    iframeEl.addEventListener('load', () => {
      cfSendListening();
    });
  }

  cfUpdateControls();
}

function cfSaveState() {
  chrome.storage.local.get(['callState'], (result) => {
    if (chrome.runtime.lastError) return;
    const currentState = result.callState || {};
    const updated = {
      ...currentState,
      currentIndex: cfState.currentIndex,
      videoMuted: cfState.videoMuted,
    };
    chrome.storage.local.set({ callState: updated });
  });
}

function cfSendPlayerCommand(func, args = []) {
  if (!cfRoot) return;
  const iframe = cfRoot.getElementById('yt');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: func, args: args }),
      '*'
    );
  }
}

function cfSendListening() {
  if (!cfRoot) return;
  const iframe = cfRoot.getElementById('yt');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'listening' }),
      '*'
    );
  }
}

// ---- Iframe loading ----
function cfLoadBuddy(index) {
  if (!cfRoot) return;
  cfState.currentIndex = index; // Keep in sync
  const buddy = cfState.buddies[index];
  if (!buddy) return;

  // Clear embedding errors if any
  const errEl = cfRoot.getElementById('embed-error');
  if (errEl) errEl.classList.remove('visible');

  // Check embedding permissions via background script (bypassing page CSP blocks!)
  chrome.runtime.sendMessage({ type: 'CF_CHECK_EMBED', videoId: buddy.videoId }, (res) => {
    if (res && res.restricted) {
      cfShowEmbedError(buddy.videoId);
    }
  });

  const iframe = cfRoot.getElementById('yt');
  iframe.src = cfBuildEmbedUrl(buddy.videoId, {
    autoplay: true,
    muted: true,
    loop: false,
  });
  if (!cfState.videoMuted) {
    setTimeout(() => {
      cfSendPlayerCommand('unMute');
    }, 1200);
  }

  const nameEl = cfRoot.getElementById('buddy-name');
  if (nameEl) nameEl.textContent = cfState.buddyName;

  const idxEl = cfRoot.getElementById('buddy-idx');
  if (idxEl) idxEl.textContent = cfState.buddies.length > 1 ? `${index + 1} / ${cfState.buddies.length}` : '';
}

// ---- Controls update ----
function cfUpdateControls() {
  if (!cfRoot) return;

  const muteBtn = cfRoot.getElementById('mute-btn');
  const muteIcon = cfRoot.getElementById('mute-icon');

  if (muteBtn && muteIcon) {
    muteBtn.classList.toggle('muted', cfState.videoMuted);
    if (cfState.videoMuted) {
      muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    } else {
      muteIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/>`;
    }
  }
}

// ---- Timer ----
function cfStartTimer() {
  clearInterval(cfTimer);
  cfTimer = setInterval(() => {
    if (!cfShadow) { clearInterval(cfTimer); return; }
    const el = cfShadow.getElementById('timer');
    if (!el) return;
    const diff = Date.now() - cfState.callStartTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }, 1000);
}

function pad2(n) { return String(n).padStart(2, '0'); }

// ---- Drag ----
function cfDragStart(e) {
  e.preventDefault();
  const rect = cfHost.getBoundingClientRect();
  cfDragState = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };

  const onMove = (ev) => {
    const dx = ev.clientX - cfDragState.startX;
    const dy = ev.clientY - cfDragState.startY;
    const newX = Math.max(0, Math.min(window.innerWidth  - 60, cfDragState.origX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 60, cfDragState.origY + dy));
    cfHost.style.left = newX + 'px';
    cfHost.style.top  = newY + 'px';
    cfHost.style.right = 'auto';
  };
  const onUp = () => {
    // Snap to nearest corner
    const rect2 = cfHost.getBoundingClientRect();
    const cx = rect2.left + rect2.width / 2;
    const cy = rect2.top  + rect2.height / 2;
    const snapX = cx < window.innerWidth  / 2 ? 16 : window.innerWidth  - rect2.width  - 16;
    const snapY = cy < window.innerHeight / 2 ? 16 : window.innerHeight - rect2.height - 16;
    cfHost.style.left = snapX + 'px';
    cfHost.style.top  = snapY + 'px';
    cfHost.style.right = 'auto';
    cfDragState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ---- Resize ----
function cfResizeStart(e) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX, startY = e.clientY;
  const startW = cfHost.offsetWidth, startH = cfHost.offsetHeight;

  const onMove = (ev) => {
    const newW = Math.max(140, Math.min(480, startW + (ev.clientX - startX)));
    const newH = Math.max(220, Math.min(720, startH + (ev.clientY - startY)));
    cfHost.style.width  = newW + 'px';
    cfHost.style.height = newH + 'px';
    cfAdjustPlayerScale();
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function cfAdjustPlayerScale() {
  if (!cfRoot) return;
  const wrap = cfRoot.getElementById('yt-scale-wrap');
  if (!wrap) return;

  const W = cfHost ? cfHost.offsetWidth : 160;
  const H = cfHost ? cfHost.offsetHeight : 250;

  const shield = cfRoot.getElementById('click-shield');
  const isUnlocked = shield && shield.classList.contains('unlocked');

  // Render player at massive 1200x1800 resolution to scale down overlays by 78%!
  const D_W = 1200;
  const D_H = 1800;

  let S;
  if (isUnlocked) {
    // UNLOCKED: "Unzoom" to fit the entire player inside the panel so the user can see everything (Skip Ad, etc.)
    S = Math.min(W / D_W, H / D_H);
  } else {
    // LOCKED: "Zoom" and cover the panel to show only the vertical center crop
    const U_W = 720; 
    const U_H = 1260;
    S = Math.max(W / U_W, H / U_H);
  }

  wrap.style.width = D_W + 'px';
  wrap.style.height = D_H + 'px';
  wrap.style.transform = `translate(-50%, -50%) scale(${S})`;
}

}
}
