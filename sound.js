// ============================================================
// poppet. — sound
//
// Plays a real cute sound file (assets/sounds/cutesounds.mp3)
// if one has been added to the project. If it's missing or
// fails to load, everything falls back to a synthesized chime
// (Web Audio API, no file needed) so the app never breaks —
// it just sounds even cuter once the real file is in place.
// The service worker (sw.js) precaches the mp3 too, so once
// it's added it keeps working offline.
// ============================================================

const LS_SOUND_ENABLED = 'poppet_sound_enabled';
const LS_ONBOARDED = 'poppet_onboarded';

const CUTE_SOUND_SRC = 'assets/sounds/cutesounds.mp3';

/* ---------------- real audio file, with fallback ---------------- */

let cuteAudio = null;
let cuteAudioBroken = false;

function getCuteAudio() {
  if (cuteAudioBroken) return null;
  if (!cuteAudio) {
    cuteAudio = new Audio(CUTE_SOUND_SRC);
    cuteAudio.preload = 'auto';
    cuteAudio.addEventListener('error', () => { cuteAudioBroken = true; });
  }
  return cuteAudio;
}

function playCuteFile() {
  const audio = getCuteAudio();
  if (!audio) return false;
  try {
    audio.currentTime = 0;
    const p = audio.play();
    if (p?.catch) p.catch(() => { cuteAudioBroken = true; playSynthChime(); });
    return true;
  } catch (e) {
    cuteAudioBroken = true;
    return false;
  }
}

/* ---------------- synthesized fallback (no file needed) ---------------- */

let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, startTime, duration, gainPeak = 0.18, type = 'sine') {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function playSynthChime() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    tone(880, now, 0.18, 0.16);
    tone(1318.5, now + 0.09, 0.22, 0.14);
  } catch (e) { /* audio not available — fail silently */ }
}

function playSynthNudge() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    tone(660, now, 0.16, 0.12);
    tone(494, now + 0.1, 0.2, 0.1);
  } catch (e) { /* fail silently */ }
}

/* ---------------- public sound API ---------------- */

export function isSoundEnabled() {
  return localStorage.getItem(LS_SOUND_ENABLED) === '1';
}

export function setSoundEnabled(on) {
  localStorage.setItem(LS_SOUND_ENABLED, on ? '1' : '0');
}

export function hasOnboarded() {
  return localStorage.getItem(LS_ONBOARDED) === '1';
}

export function markOnboarded() {
  localStorage.setItem(LS_ONBOARDED, '1');
}

// used for saves / new items / the onboarding demo
export function playChime() {
  if (!isSoundEnabled()) return;
  if (!playCuteFile()) playSynthChime();
}

// soft alert — used for due/overdue nudges
export function playNudge() {
  if (!isSoundEnabled()) return;
  if (!playCuteFile()) playSynthNudge();
}

export function initOnboarding({ onDone } = {}) {
  const overlay = document.getElementById('onboarding');
  const btnEnable = document.getElementById('btnEnableSound');
  const btnSkip = document.getElementById('btnSkipSound');

  if (hasOnboarded()) {
    overlay.hidden = true;
    onDone?.();
    return;
  }

  const finish = (soundOn) => {
    setSoundEnabled(soundOn);
    markOnboarded();
    overlay.hidden = true;
    onDone?.();
  };

  btnEnable.addEventListener('click', () => {
    setSoundEnabled(true);
    try { playChime(); } catch (e) {}
    finish(true);
  });

  btnSkip.addEventListener('click', () => finish(false));
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // offline caching is a nice-to-have — app still works without it
      });
    });
  }
}