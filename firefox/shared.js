/* ================================
   CornerFriend - Shared Data
   ================================ */



function extractVideoId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isValidYouTubeUrl(url) {
  return extractVideoId(url) !== null;
}

function buildEmbedUrl(videoId, options = {}) {
  const { autoplay = true, muted = true, loop = false } = options;
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    controls: '0',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    playsinline: '1',
    // Needed for chrome-extension:// contexts to avoid Error 153
    enablejsapi: '1',
    widget_referrer: 'https://www.youtube.com',
  });
  if (loop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  // Use youtube-nocookie.com — it bypasses origin enforcement (Error 153) in extensions
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

// ---- Favorites via localStorage ----
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('cf_favorites') || '[]');
  } catch {
    return [];
  }
}

function saveFavorite(name, urls) {
  const favs = getFavorites();
  const newFav = {
    id: `fav_${Date.now()}`,
    name,
    urls: JSON.stringify(urls),
    createdAt: new Date().toISOString(),
  };
  favs.unshift(newFav);
  localStorage.setItem('cf_favorites', JSON.stringify(favs));
  return newFav;
}

function deleteFavorite(id) {
  const favs = getFavorites().filter((f) => f.id !== id);
  localStorage.setItem('cf_favorites', JSON.stringify(favs));
}
