// Rules for the video that can be attached to a routine step: a YouTube link or an uploaded
// video file. No DOM and no storage, so they can be tested on their own. (The file's bytes are
// kept by videostore.js; a step only remembers the file's id and name.)

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_FILE_NAME_CHARS = 120;
const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'];
const EXAMPLE = 'https://www.youtube.com/watch?v=...';

// Turns a pasted YouTube link into { id }, or explains what is wrong with it as { error }.
export function parseYouTubeLink(text) {
  const trimmed = String(text).trim();
  if (trimmed === '') return { error: 'Paste a YouTube link first.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : 'https://' + trimmed;
  let url;
  try {
    url = new URL(withScheme);
  } catch (error) {
    return { error: 'That does not look like a link. It should look like ' + EXAMPLE };
  }
  if (!url.hostname.includes('.')) return { error: 'That does not look like a link. It should look like ' + EXAMPLE };
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !YOUTUBE_HOSTS.includes(url.hostname)) {
    return { error: 'Only YouTube links work here. It should look like ' + EXAMPLE };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const candidate = url.hostname.endsWith('youtu.be')
    ? parts[0]
    : url.searchParams.get('v') ?? (['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : '');
  if (!YOUTUBE_ID.test(candidate ?? '')) {
    return { error: 'That is a YouTube link, but not to a single video. It should look like ' + EXAMPLE };
  }
  return { id: candidate };
}

// Checks a chosen file before it is saved. Returns {} when it is fine, or { error }.
export function checkVideoFile({ type, size }) {
  if (!String(type).startsWith('video/')) return { error: 'Choose a video file (like .mp4 or .mov).' };
  if (size > MAX_VIDEO_BYTES) {
    return { error: 'That video is over ' + Math.round(MAX_VIDEO_BYTES / (1024 * 1024)) + ' MB. Trim it first, or use a YouTube link.' };
  }
  return {};
}

// A step's saved video, or null when it is missing or damaged. A video is
// { kind: 'youtube', id } or { kind: 'file', id, name }.
export function normalizeVideo(video) {
  if (video?.kind === 'youtube' && YOUTUBE_ID.test(String(video.id))) return { kind: 'youtube', id: video.id };
  if (video?.kind === 'file' && /^[a-z0-9-]+$/.test(String(video.id)) && typeof video.name === 'string') {
    return { kind: 'file', id: video.id, name: video.name.slice(0, MAX_FILE_NAME_CHARS) };
  }
  return null;
}

export const youtubeEmbedUrl = (id) => 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0';
export const youtubeWatchUrl = (id) => 'https://www.youtube.com/watch?v=' + id;

// What the video is called on screen.
export const videoLabel = (video) => (video.kind === 'youtube' ? 'YouTube video' : video.name);
