/* ================================
   CornerFriend - Floating Window Logic
   ================================ */

// ---- Parse data from URL ----
const params = new URLSearchParams(window.location.search);
let callData = {};
try {
  callData = JSON.parse(decodeURIComponent(params.get('data') || '{}'));
} catch {
  callData = {};
}

let buddies = callData.buddies || [];
let buddyName = callData.buddyName || 'Buddy';
let currentIndex = 0;
let videoMuted = true;
let lofiPlaying = callData.lofiPlaying !== undefined ? callData.lofiPlaying : true;
let lofiVolume = callData.lofiVolume !== undefined ? callData.lofiVolume : 0.5;
let currentStation = callData.lofiStation || 'groovesalad';
let isCompact = false;
let callStartTime = Date.now();

// ---- DOM ----
const $ = (id) => document.getElementById(id);

const iframe = $('buddy-iframe');
const buddyNameDisplay = $('buddy-name-display');
const callDurationEl = $('call-duration');
const buddyIndexEl = $('buddy-index');
const muteBtn = $('mute-btn');
const muteIcon = $('mute-icon');
const lofiBtn = $('lofi-btn');
const lofiIcon = $('lofi-icon');
const prevBtn = $('prev-btn');
const nextBtn = $('next-btn');
const endCallFlBtn = $('end-call-fl-btn');
const compactBtn = $('compact-btn');
const volumeRowEl = $('volume-row');
const volSliderFl = $('vol-slider-fl');
const stationLabelFl = $('station-label-fl');
const lofiAudio = $('lofi-audio');

// ================================
//  INIT
// ================================

document.addEventListener('DOMContentLoaded', () => {
  if (buddies.length === 0) {
    document.body.innerHTML = '<div style="color:#fff;font-family:Inter,sans-serif;padding:20px;font-size:12px;text-align:center;opacity:0.5">No buddies loaded.<br>Open CornerFriend popup to start a call.</div>';
    return;
  }

  loadBuddy(currentIndex);
  updateUI();
  startCallTimer();
  handleLofi();

  // Show/hide prev-next buttons
  if (buddies.length > 1) {
    prevBtn.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
  }

  // Listen for commands from popup via storage
  chrome.storage.local.onChanged.addListener(handleStorageChange);
});

// ================================
//  BUDDY LOADING
// ================================

function loadBuddy(index) {
  const buddy = buddies[index];
  if (!buddy) return;

  // Hide any stale error overlays first
  const errEl = document.getElementById('embed-error');
  if (errEl) errEl.classList.remove('visible');

  // Query YouTube oEmbed API to verify embedding permissions (Error 152-4 check)
  fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${buddy.videoId}&format=json`)
    .then(res => {
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        // Restricted / private / invalid video
        showEmbedError(buddy.videoId);
      }
    })
    .catch(err => {
      console.warn('oEmbed check failed:', err);
    });

  const isLoop = buddies.length === 1;
  const embedUrl = buildEmbedUrl(buddy.videoId, {
    autoplay: true,
    muted: videoMuted,
    loop: isLoop,
  });

  iframe.src = embedUrl;

  // Update index display
  if (buddies.length > 1) {
    buddyIndexEl.textContent = `${index + 1} / ${buddies.length}`;
    buddyIndexEl.classList.remove('hidden');
  }
}

function showEmbedError(videoId) {
  const errEl = document.getElementById('embed-error');
  if (errEl) {
    errEl.classList.add('visible');
    const linkEl = document.getElementById('watch-yt-link');
    if (linkEl && videoId) {
      linkEl.href = `https://www.youtube.com/watch?v=${videoId}`;
    }
  }
}

function updateUI() {
  // Buddy name
  buddyNameDisplay.textContent = `Live with ${buddyName}`;

  // Mute button
  if (videoMuted) {
    muteBtn.classList.add('ctrl-btn-muted');
    muteIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>`;
  } else {
    muteBtn.classList.remove('ctrl-btn-muted');
    muteIcon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/>
    </svg>`;
  }

  // Lofi button
  lofiBtn.classList.toggle('ctrl-btn-lofi-active', lofiPlaying);

  // Volume row
  volumeRowEl.classList.toggle('hidden', !lofiPlaying);
  volSliderFl.value = Math.round(lofiVolume * 100);

  // Station label
  const station = getStationById(currentStation);
  if (station) stationLabelFl.textContent = station.name;
}

// ================================
//  CONTROLS
// ================================

muteBtn.addEventListener('click', () => {
  videoMuted = !videoMuted;
  // Reload iframe with new mute state
  loadBuddy(currentIndex);
  updateUI();
});

lofiBtn.addEventListener('click', () => {
  lofiPlaying = !lofiPlaying;
  handleLofi();
  updateUI();
});

prevBtn.addEventListener('click', () => {
  currentIndex = (currentIndex - 1 + buddies.length) % buddies.length;
  loadBuddy(currentIndex);
});

nextBtn.addEventListener('click', () => {
  currentIndex = (currentIndex + 1) % buddies.length;
  loadBuddy(currentIndex);
});

endCallFlBtn.addEventListener('click', () => {
  // Notify extension
  chrome.runtime.sendMessage({ type: 'CLOSE_FLOATING_WINDOW' });
  // Also update storage so popup knows
  chrome.storage.local.set({ callState: { isCallActive: false } });
  window.close();
});

compactBtn.addEventListener('click', () => {
  isCompact = !isCompact;
  if (isCompact) {
    // Resize to tiny
    document.body.style.overflow = 'hidden';
    window.resizeTo(48, 48);
    compactBtn.title = 'Expand';
    compactBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>`;
  } else {
    window.resizeTo(240, 380);
    compactBtn.title = 'Minimize';
    compactBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>`;
  }
});

volSliderFl.addEventListener('input', () => {
  lofiVolume = parseInt(volSliderFl.value) / 100;
  if (lofiAudio) lofiAudio.volume = lofiVolume;
});

// ================================
//  LOFI AUDIO
// ================================

function handleLofi() {
  if (!lofiAudio) return;
  const station = getStationById(currentStation);
  if (!station) return;

  if (lofiPlaying) {
    if (lofiAudio.src !== station.url) {
      lofiAudio.src = station.url;
    }
    lofiAudio.volume = lofiVolume;
    lofiAudio.play().catch(() => {});
  } else {
    lofiAudio.pause();
  }
}

// ================================
//  CALL TIMER
// ================================

function startCallTimer() {
  setInterval(() => {
    const diff = Date.now() - callStartTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    callDurationEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, 1000);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// ================================
//  STORAGE COMMAND LISTENER
// ================================

function handleStorageChange(changes) {
  if (!changes.floatingCmd) return;
  const cmd = changes.floatingCmd.newValue;
  if (!cmd) return;

  switch (cmd.type) {
    case 'SET_STATION':
      currentStation = cmd.stationId;
      if (lofiPlaying) handleLofi();
      updateUI();
      break;

    case 'SET_LOFI':
      lofiPlaying = cmd.playing;
      handleLofi();
      updateUI();
      break;

    case 'SET_VOLUME':
      lofiVolume = cmd.volume;
      if (lofiAudio) lofiAudio.volume = lofiVolume;
      volSliderFl.value = Math.round(lofiVolume * 100);
      break;
  }
}
