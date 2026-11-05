// The "Video review" part of the Journal entry form: attach a game video (a YouTube link or a
// file from this device), watch it, and write notes tied to moments in it. Tapping a note jumps
// the video to that moment.
import { el } from './dom.js';
import { setFolded } from './fold.js';
import { checkVideoFile, normalizeVideo, parseYouTubeLink, videoLabel } from './stepvideo.js';
import { addVideoNote, cleanVideoNotes, formatTimestamp, parseTimestamp, removeVideoNote } from './video-review.js';
import { loadVideo, saveVideo } from './videostore.js';

const YOUTUBE_API = 'https://www.youtube.com/iframe_api';
const API_WAIT_MS = 6000;

let youtubeApi = null;
// Loads YouTube's player script once. Resolves with the YT object, or null when it cannot load
// (offline, blocked); notes then still work, with the time typed by hand.
function loadYouTubeApi() {
  if (youtubeApi) return youtubeApi;
  youtubeApi = new Promise((resolve) => {
    const finish = (api) => resolve(api);
    const timer = setTimeout(() => finish(null), API_WAIT_MS);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      finish(window.YT);
    };
    const script = el('script', { src: YOUTUBE_API });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    document.head.append(script);
  });
  return youtubeApi;
}

// Builds the section inside `container`. `onChange` runs after anything changes (so the form can
// tell there is something unsaved). Returns:
//   show(entry)     fill it from a saved entry (or an empty one)
//   collect()       saves a newly chosen video file and returns { video, videoNotes } for the entry
//   savedFileId()   the id of the file video the entry had when it was opened, if any
//   stop()          stop the video and free what it uses (call when the pop-up closes)
//   stateText()     a text that changes whenever the section does
export function createVideoReview(container, onChange, { readOnly = false } = {}) {
  let choice = null; // null, a saved video, or { kind: 'pending', file }
  let notes = [];
  let openedFileId = null;
  let player = null; // { currentTime(), seek(seconds) }
  let objectUrl = null;
  let generation = 0; // bumps whenever the player is rebuilt, so a slow load cannot land late

  // In read-only mode (viewing an entry) there is no choosing, removing or adding: just the video
  // and the notes, always showing.
  const title = readOnly ? el('h3', { class: 'video-view-title', text: 'Video review' }) : el('button', { class: 'meal-day-toggle fold-title', type: 'button', 'aria-expanded': 'false' },
    el('span', { class: 'video-review-title', text: 'Video review (optional)' }), el('span', { class: 'chevron', 'aria-hidden': 'true' }));
  const body = el('div', { class: 'fold-inner' });
  if (readOnly) {
    body.className = 'video-view-body';
    container.classList.add('video-view');
    container.replaceChildren(title, body);
  } else {
    container.classList.add('video-review', 'collapsed');
    container.replaceChildren(title, el('div', { class: 'fold' }, body));
    title.addEventListener('click', () => setFolded(container, title, !container.classList.contains('collapsed')));
  }

  // The video itself changed (chosen or removed): rebuild everything.
  const changed = () => {
    render();
    onChange();
  };
  // Only the notes changed: leave the video playing where it is.
  const notesChanged = () => {
    renderNotes();
    onChange();
  };

  function stop() {
    generation += 1;
    player = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  // ---- the player ----
  async function buildPlayer(slot, thisGeneration) {
    if (choice.kind === 'youtube') {
      const holder = el('div', { class: 'video-frame' });
      slot.replaceChildren(holder);
      const api = await loadYouTubeApi();
      if (thisGeneration !== generation) return;
      if (!api) {
        slot.replaceChildren(el('iframe', {
          class: 'video-frame', src: 'https://www.youtube-nocookie.com/embed/' + choice.id + '?rel=0', title: 'YouTube video',
          allow: 'fullscreen; picture-in-picture; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin',
        }), el('p', { class: 'series-note', text: 'The video time could not be read here, so type the time for each note.' }));
        return;
      }
      const target = el('div');
      holder.replaceChildren(target);
      const youtube = new api.Player(target, { videoId: choice.id, host: 'https://www.youtube-nocookie.com', playerVars: { rel: 0 } });
      youtube.addEventListener('onReady', () => {
        if (thisGeneration !== generation) return;
        player = {
          currentTime: () => youtube.getCurrentTime(),
          seek: (seconds) => youtube.seekTo(seconds, true),
        };
      });
      return;
    }
    slot.replaceChildren(el('p', { class: 'empty', text: 'Loading the video…' }));
    try {
      const file = choice.kind === 'pending' ? choice.file : await loadVideo(choice.id);
      if (thisGeneration !== generation) return;
      if (!file) {
        slot.replaceChildren(el('p', { class: 'form-error', text: 'This video is not saved on this device any more. Remove it and add it again.' }));
        return;
      }
      objectUrl = URL.createObjectURL(file);
      const video = el('video', { class: 'video-frame', src: objectUrl, controls: '', playsinline: '', 'aria-label': 'Your video' });
      slot.replaceChildren(video);
      player = { currentTime: () => video.currentTime, seek: (seconds) => { video.currentTime = seconds; video.play().catch(() => {}); } };
    } catch (problem) {
      slot.replaceChildren(el('p', { class: 'form-error', text: problem.message }));
    }
  }

  // ---- choosing a video ----
  function chooser() {
    const fileInput = el('input', { type: 'file', accept: 'video/*', 'aria-label': 'Choose a video file', hidden: '' });
    const link = el('input', { type: 'text', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'Paste a YouTube link', 'aria-label': 'YouTube link' });
    const note = el('p', { class: 'form-error', role: 'alert' });
    const useLink = () => {
      const parsed = parseYouTubeLink(link.value);
      note.textContent = parsed.error || '';
      if (parsed.error) return;
      choice = { kind: 'youtube', id: parsed.id };
      changed();
    };
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      useLink();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const problem = checkVideoFile(file).error;
      note.textContent = problem || '';
      if (problem) return;
      choice = { kind: 'pending', file };
      changed();
    });
    return el('div', { class: 'step-video' },
      el('p', { class: 'series-note', text: 'Watch back a bout or a whole tournament and write down what you notice.' }),
      el('div', { class: 'step-video-area' }, link,
        el('button', { class: 'btn ghost small', type: 'button', text: 'Use link', onclick: useLink }),
        el('button', { class: 'btn ghost small', type: 'button', text: 'Upload a video file', onclick: () => fileInput.click() })),
      fileInput, note);
  }

  // ---- the notes ----
  function noteList() {
    if (notes.length === 0) return el('p', { class: 'empty', text: readOnly ? 'No notes on this video.' : 'No notes yet. Pause the video where something happens and add one.' });
    return el('ul', { class: 'video-notes' }, ...notes.map((note, index) => el('li', {},
      el('button', {
        class: 'video-note-time', type: 'button', text: formatTimestamp(note.time),
        'aria-label': 'Jump to ' + formatTimestamp(note.time),
        onclick: () => player?.seek(note.time),
      }),
      el('span', { class: 'video-note-text', text: note.text }),
      ...(readOnly ? [] : [el('button', {
        class: 'icon-btn small', type: 'button', text: '✕', 'aria-label': 'Remove note at ' + formatTimestamp(note.time),
        onclick: () => { notes = removeVideoNote(notes, index); notesChanged(); },
      })]))));
  }

  function noteForm() {
    const time = el('input', { type: 'text', class: 'video-note-time-input', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Now', 'aria-label': 'Time in the video (leave empty for where the video is now)' });
    const text = el('input', { type: 'text', maxlength: '200', placeholder: 'What did you notice?', 'aria-label': 'Note' });
    const error = el('p', { class: 'form-error', role: 'alert' });
    const add = () => {
      let at = time.value;
      if (at.trim() === '') {
        const now = player?.currentTime();
        if (typeof now !== 'number') {
          error.textContent = 'Type the time like 1:32, since the video time is not available.';
          return;
        }
        at = formatTimestamp(now);
      } else if (parseTimestamp(at) === null) {
        error.textContent = 'Type the time like 1:32 (minutes:seconds).';
        return;
      }
      const result = addVideoNote(notes, { time: at, text: text.value });
      if (result.error) {
        error.textContent = result.error;
        return;
      }
      notes = result.notes;
      time.value = '';
      text.value = '';
      error.textContent = '';
      notesChanged();
    };
    for (const box of [time, text]) {
      box.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        add();
      });
    }
    return el('div', { class: 'video-note-form' },
      el('div', { class: 'video-note-row' }, time, text, el('button', { class: 'btn small', type: 'button', text: 'Add note', onclick: add })),
      error);
  }

  const notesArea = el('div', { class: 'video-notes-area' });
  function renderNotes() {
    notesArea.replaceChildren(noteList());
  }

  function render() {
    stop();
    if (!choice) {
      body.replaceChildren(chooser());
      return;
    }
    const slot = el('div', { class: 'video-slot' });
    if (readOnly) {
      body.replaceChildren(slot, notesArea);
      renderNotes();
      buildPlayer(slot, generation);
      return;
    }
    body.replaceChildren(
      slot,
      el('div', { class: 'video-review-bar' },
        el('span', { class: 'step-video-name', text: '▶ ' + (choice.kind === 'pending' ? choice.file.name : videoLabel(choice)) }),
        el('button', { class: 'btn danger small', type: 'button', text: 'Remove video', onclick: () => { choice = null; notes = []; changed(); } })),
      noteForm(),
      notesArea);
    renderNotes();
    buildPlayer(slot, generation);
  }

  return {
    show(entry) {
      stop();
      const video = normalizeVideo(entry?.video);
      choice = video;
      notes = video ? cleanVideoNotes(entry.videoNotes) : [];
      openedFileId = video?.kind === 'file' ? video.id : null;
      render();
      if (readOnly) container.hidden = !video;
      else setFolded(container, title, !video);
    },
    async collect() {
      if (!choice) return { video: null, videoNotes: [] };
      if (choice.kind === 'pending') {
        const id = await saveVideo(choice.file);
        choice = { kind: 'file', id, name: choice.file.name };
      }
      return { video: choice, videoNotes: notes };
    },
    savedFileId: () => openedFileId,
    stop,
    stateText: () => JSON.stringify([choice?.kind, choice?.id ?? choice?.file?.name, notes]),
  };
}
