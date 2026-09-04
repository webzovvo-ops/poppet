import { supabase, IMAGE_BUCKET, HISTORY_RETENTION_DAYS } from './config.js';
import { initOnboarding, registerServiceWorker, playChime, playNudge, isSoundEnabled, setSoundEnabled } from './sound.js';

/* ============================================================
   state
   ============================================================ */

let currentTab = 'assignment';       // 'assignment' | 'sched' | 'recap'
let assignmentSegment = 'active';    // 'active' | 'history'

let assignments = [];
let recaps = [];
let schedule = [];

let pendingImage = { assignment: null, recap: null }; // File objects staged before save
let pendingDelete = null; // { table, id, imagePath }

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Seeded once, automatically, the first time the schedule table is empty —
// so there's no manual SQL insert step. Table creation still needs to run
// once in Supabase (see README), but this row data fills itself in.
const DEFAULT_SCHEDULE_SEED = [
  { code: 'NSTP 01', title: 'National Service Training Program 1 (LTS)', day_of_week: 'Monday', start_time: '08:00', end_time: '11:00', room: 'GYMNASIUM', professor: null },
  { code: 'PATHFIT 1', title: 'Physical Education (Movement Competency Training)', day_of_week: 'Monday', start_time: '11:00', end_time: '13:00', room: 'GYMNASIUM', professor: null },
  { code: 'GE-SOC SCI 1', title: 'Understanding the Self', day_of_week: 'Monday', start_time: '14:00', end_time: '17:00', room: '301', professor: null },
  { code: 'TLE 102', title: 'Home Economics Literacy', day_of_week: 'Monday', start_time: '17:00', end_time: '20:00', room: '301', professor: null },
  { code: 'GE-HIS', title: 'Reading in Philippine History', day_of_week: 'Thursday', start_time: '08:00', end_time: '11:00', room: '301', professor: null },
  { code: 'GE-MATH', title: 'Mathematics in the Modern World', day_of_week: 'Thursday', start_time: '11:00', end_time: '14:00', room: '301', professor: null },
  { code: 'GEN-ENG 1', title: 'Purposive Communication', day_of_week: 'Thursday', start_time: '14:00', end_time: '17:00', room: '301', professor: 'Prof. Marifor Calles' },
  { code: 'TLE 101', title: 'Introduction to Industrial Arts', day_of_week: 'Saturday', start_time: '08:00', end_time: '11:00', room: '702', professor: null },
  { code: 'PROFED 101', title: 'The Child and Adolescent Learners and Learning Principles', day_of_week: 'Saturday', start_time: '11:00', end_time: '14:00', room: '301', professor: null },
  { code: 'PCK 101', title: 'Facilitate Learner-Centered Teaching', day_of_week: 'Saturday', start_time: '17:00', end_time: '20:00', room: '403', professor: null },
];

const CUSTOM_SUBJECT_VALUE = '__custom__';

/* ============================================================
   dom refs
   ============================================================ */

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  navBtns: document.querySelectorAll('.nav-btn'),
  bottomNav: document.querySelector('.bottom-nav'),
  btnAdd: $('btnAdd'),
  btnMute: $('btnMuteToggle'),

  viewAssignment: $('view-assignment'),
  viewSched: $('view-sched'),
  viewRecap: $('view-recap'),

  segments: document.querySelectorAll('.segment'),
  assignmentList: $('assignmentList'),
  assignmentEmpty: $('assignmentEmpty'),

  schedGroups: $('schedGroups'),
  schedEmpty: $('schedEmpty'),

  recapList: $('recapList'),
  recapEmpty: $('recapEmpty'),

  modalAssignment: $('modalAssignment'),
  formAssignment: $('formAssignment'),
  fAssignSubject: $('fAssignSubject'),
  fAssignCustomWrap: $('fAssignCustomWrap'),
  fAssignCustomTitle: $('fAssignCustomTitle'),
  fAssignDesc: $('fAssignDesc'),
  fAssignDueDate: $('fAssignDueDate'),
  fAssignDueTime: $('fAssignDueTime'),
  fAssignImage: $('fAssignImage'),
  assignImageDrop: $('assignImageDrop'),
  assignImageEmpty: $('assignImageEmpty'),
  assignImagePreview: $('assignImagePreview'),
  assignImageRemove: $('assignImageRemove'),

  modalRecap: $('modalRecap'),
  formRecap: $('formRecap'),
  fRecapTitle: $('fRecapTitle'),
  fRecapContent: $('fRecapContent'),
  fRecapImage: $('fRecapImage'),
  recapImageDrop: $('recapImageDrop'),
  recapImageEmpty: $('recapImageEmpty'),
  recapImagePreview: $('recapImagePreview'),
  recapImageRemove: $('recapImageRemove'),

  modalSched: $('modalSched'),
  formSched: $('formSched'),
  fSchedCode: $('fSchedCode'),
  fSchedTitle: $('fSchedTitle'),
  fSchedDay: $('fSchedDay'),
  fSchedStart: $('fSchedStart'),
  fSchedEnd: $('fSchedEnd'),
  fSchedRoom: $('fSchedRoom'),
  fSchedProf: $('fSchedProf'),

  modalConfirm: $('modalConfirm'),
  confirmTitle: $('confirmTitle'),
  confirmSub: $('confirmSub'),
  btnConfirmDelete: $('btnConfirmDelete'),

  toast: $('toast'),
};

/* ============================================================
   init
   ============================================================ */

function boot() {
  window.lucide?.createIcons();
  registerServiceWorker();
  initOnboarding({ onDone: startApp });
}

async function startApp() {
  el.app.hidden = false;
  window.lucide?.createIcons();
  syncMuteIcon();
  bindNav();
  bindSegments();
  bindModals();
  bindImagePickers();
  bindSubjectSelect();
  bindForms();
  await refreshAll();
}

/* ============================================================
   tabs / nav
   ============================================================ */

function bindNav() {
  el.navBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  el.btnAdd.addEventListener('click', () => {
    if (currentTab === 'assignment') { populateAssignSubjectOptions(); openModal(el.modalAssignment); }
    else if (currentTab === 'sched') openModal(el.modalSched);
    else openModal(el.modalRecap);
  });

  el.btnMute.addEventListener('click', () => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    syncMuteIcon();
    if (next) playChime();
  });
}

function syncMuteIcon() {
  const on = isSoundEnabled();
  el.btnMute.classList.toggle('is-muted', !on);
  el.btnMute.innerHTML = `<i data-lucide="${on ? 'volume-2' : 'volume-x'}"></i>`;
  window.lucide?.createIcons();
}

function switchTab(tab) {
  currentTab = tab;

  el.navBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  el.bottomNav.dataset.active = tab;
  el.btnAdd.className = 'nav-add' + (tab === 'recap' ? ' tint-recap' : tab === 'sched' ? ' tint-sched' : '');
  window.lucide?.createIcons();

  el.viewAssignment.hidden = tab !== 'assignment';
  el.viewSched.hidden = tab !== 'sched';
  el.viewRecap.hidden = tab !== 'recap';
}

function bindSegments() {
  el.segments.forEach((seg) => {
    seg.addEventListener('click', () => {
      el.segments.forEach((s) => { s.classList.remove('is-active'); s.setAttribute('aria-selected', 'false'); });
      seg.classList.add('is-active');
      seg.setAttribute('aria-selected', 'true');
      assignmentSegment = seg.dataset.segment;
      renderAssignments();
    });
  });
}

/* ============================================================
   modal helpers
   ============================================================ */

function bindModals() {
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeAllModals());
  });
  [el.modalAssignment, el.modalRecap, el.modalSched, el.modalConfirm].forEach((modal) => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); });
  });
}

function openModal(modal) {
  closeAllModals();
  modal.hidden = false;
}

function closeAllModals() {
  [el.modalAssignment, el.modalRecap, el.modalSched, el.modalConfirm].forEach((m) => (m.hidden = true));
  resetAssignmentForm();
  resetRecapForm();
  el.formSched.reset();
}

/* ============================================================
   assignment subject picker (pick, don't type — sourced from Sched)
   ============================================================ */

function bindSubjectSelect() {
  el.fAssignSubject.addEventListener('change', () => {
    const isCustom = el.fAssignSubject.value === CUSTOM_SUBJECT_VALUE;
    el.fAssignCustomWrap.hidden = !isCustom;
    if (isCustom) {
      el.fAssignCustomTitle.setAttribute('required', 'required');
      el.fAssignCustomTitle.focus();
    } else {
      el.fAssignCustomTitle.removeAttribute('required');
    }
  });
}

function populateAssignSubjectOptions() {
  const uniqueTitles = [...new Set(schedule.map((s) => s.title))];

  el.fAssignSubject.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = uniqueTitles.length ? 'select a subject' : 'no subjects in Sched yet';
  el.fAssignSubject.appendChild(placeholder);

  uniqueTitles.forEach((title) => {
    const opt = document.createElement('option');
    opt.value = title;
    opt.textContent = title;
    el.fAssignSubject.appendChild(opt);
  });

  const customOpt = document.createElement('option');
  customOpt.value = CUSTOM_SUBJECT_VALUE;
  customOpt.textContent = '+ custom subject';
  el.fAssignSubject.appendChild(customOpt);

  el.fAssignCustomWrap.hidden = true;
  el.fAssignCustomTitle.removeAttribute('required');
}

/* ============================================================
   image picker widgets
   ============================================================ */

function bindImagePickers() {
  wireImagePicker({
    dropEl: el.assignImageDrop, inputEl: el.fAssignImage,
    emptyEl: el.assignImageEmpty, previewEl: el.assignImagePreview,
    removeEl: el.assignImageRemove, key: 'assignment',
  });
  wireImagePicker({
    dropEl: el.recapImageDrop, inputEl: el.fRecapImage,
    emptyEl: el.recapImageEmpty, previewEl: el.recapImagePreview,
    removeEl: el.recapImageRemove, key: 'recap',
  });
}

function wireImagePicker({ dropEl, inputEl, emptyEl, previewEl, removeEl, key }) {
  dropEl.addEventListener('click', (e) => {
    if (e.target === removeEl || removeEl.contains(e.target)) return;
    inputEl.click();
  });
  inputEl.addEventListener('change', () => {
    const file = inputEl.files?.[0];
    if (!file) return;
    pendingImage[key] = file;
    const url = URL.createObjectURL(file);
    previewEl.src = url;
    previewEl.hidden = false;
    emptyEl.hidden = true;
    removeEl.hidden = false;
  });
  removeEl.addEventListener('click', (e) => {
    e.stopPropagation();
    pendingImage[key] = null;
    inputEl.value = '';
    previewEl.hidden = true;
    emptyEl.hidden = false;
    removeEl.hidden = true;
  });
}

function resetAssignmentForm() {
  el.formAssignment.reset();
  pendingImage.assignment = null;
  el.assignImagePreview.hidden = true;
  el.assignImageEmpty.hidden = false;
  el.assignImageRemove.hidden = true;
  el.fAssignCustomWrap.hidden = true;
  el.fAssignCustomTitle.removeAttribute('required');
}

function resetRecapForm() {
  el.formRecap.reset();
  pendingImage.recap = null;
  el.recapImagePreview.hidden = true;
  el.recapImageEmpty.hidden = false;
  el.recapImageRemove.hidden = true;
}

/* ============================================================
   image upload
   ============================================================ */

async function uploadImage(file, folder) {
  if (!file) return null;
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) { console.error(error); return null; }
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/* ============================================================
   forms — submit handlers
   ============================================================ */

function bindForms() {
  el.formAssignment.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveAssignment();
  });
  el.formRecap.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveRecap();
  });
  el.formSched.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSched();
  });
  el.btnConfirmDelete.addEventListener('click', async () => {
    await executeDelete();
  });
}

async function saveAssignment() {
  const btn = $('btnSaveAssignment');
  btn.disabled = true;
  try {
    const isCustom = el.fAssignSubject.value === CUSTOM_SUBJECT_VALUE;
    const title = isCustom ? el.fAssignCustomTitle.value.trim() : el.fAssignSubject.value;
    if (!title) throw new Error('missing subject');

    let imageUrl = null;
    if (pendingImage.assignment) {
      const uploaded = await uploadImage(pendingImage.assignment, 'assignments');
      imageUrl = uploaded?.url ?? null;
    }

    const dateVal = el.fAssignDueDate.value;
    const timeVal = el.fAssignDueTime.value;
    const dueIso = (dateVal && timeVal) ? new Date(`${dateVal}T${timeVal}`).toISOString() : null;

    const { error } = await supabase.from('assignments').insert({
      title,
      description: el.fAssignDesc.value.trim() || null,
      due_date: dueIso,
      image_url: imageUrl,
      status: 'active',
    });
    if (error) throw error;

    closeAllModals();
    showToast('assignment saved', 'check');
    playChime();
    await loadAssignments();
    renderAssignments();
  } catch (err) {
    console.error(err);
    showToast('something went wrong, try again', 'alert-circle');
  } finally {
    btn.disabled = false;
  }
}

async function saveRecap() {
  const btn = $('btnSaveRecap');
  btn.disabled = true;
  try {
    let imageUrl = null;
    if (pendingImage.recap) {
      const uploaded = await uploadImage(pendingImage.recap, 'recaps');
      imageUrl = uploaded?.url ?? null;
    }

    const { error } = await supabase.from('recaps').insert({
      title: el.fRecapTitle.value.trim(),
      content: el.fRecapContent.value.trim() || null,
      image_url: imageUrl,
    });
    if (error) throw error;

    closeAllModals();
    showToast('recap saved', 'check');
    playChime();
    await loadRecaps();
    renderRecaps();
  } catch (err) {
    console.error(err);
    showToast('something went wrong, try again', 'alert-circle');
  } finally {
    btn.disabled = false;
  }
}

async function saveSched() {
  const btn = $('btnSaveSched');
  btn.disabled = true;
  try {
    const { error } = await supabase.from('schedule').insert({
      code: el.fSchedCode.value.trim() || null,
      title: el.fSchedTitle.value.trim(),
      day_of_week: el.fSchedDay.value,
      start_time: el.fSchedStart.value,
      end_time: el.fSchedEnd.value,
      room: el.fSchedRoom.value.trim() || null,
      professor: el.fSchedProf.value.trim() || null,
    });
    if (error) throw error;

    closeAllModals();
    showToast('class added to sched', 'check');
    playChime();
    await loadSchedule();
    renderSchedule();
  } catch (err) {
    console.error(err);
    showToast('something went wrong, try again', 'alert-circle');
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   delete flow (shared confirm modal)
   ============================================================ */

function askDelete({ table, id, label }) {
  pendingDelete = { table, id };
  el.confirmTitle.textContent = `delete "${label}"?`;
  el.confirmSub.textContent = "This can't be undone.";
  openModal(el.modalConfirm);
}

async function executeDelete() {
  if (!pendingDelete) return;
  const { table, id } = pendingDelete;
  const { error } = await supabase.from(table).delete().eq('id', id);
  pendingDelete = null;
  closeAllModals();
  if (error) { console.error(error); showToast("couldn't delete, try again", 'alert-circle'); return; }

  showToast('deleted', 'trash-2');
  if (table === 'assignments') { await loadAssignments(); renderAssignments(); }
  else if (table === 'recaps') { await loadRecaps(); renderRecaps(); }
  else if (table === 'schedule') { await loadSchedule(); renderSchedule(); }
}

/* ============================================================
   mark assignment done -> moves to history immediately
   ============================================================ */

async function markDone(id) {
  const { error } = await supabase.from('assignments')
    .update({ status: 'history', moved_to_history_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error(error); return; }
  playChime();
  await loadAssignments();
  renderAssignments();
}

/* ============================================================
   load + cleanup + one-time sched seed
   ============================================================ */

async function refreshAll() {
  await runCleanup();
  await ensureScheduleSeed();
  await Promise.all([loadAssignments(), loadSchedule(), loadRecaps()]);
  renderAssignments();
  renderSchedule();
  renderRecaps();
  maybeNudgeForDueSoon();
}

async function runCleanup() {
  const nowIso = new Date().toISOString();

  // move overdue actives into history
  await supabase.from('assignments')
    .update({ status: 'history', moved_to_history_at: nowIso })
    .eq('status', 'active')
    .lt('due_date', nowIso);

  // purge history older than retention window
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('assignments')
    .delete()
    .eq('status', 'history')
    .lt('moved_to_history_at', cutoff);
}

// Runs once: if the schedule table has no rows yet, insert the default
// class list automatically so nobody has to paste SQL by hand.
async function ensureScheduleSeed() {
  const { count, error } = await supabase.from('schedule').select('id', { count: 'exact', head: true });
  if (error) { console.error(error); return; }
  if (count && count > 0) return;

  const { error: insertError } = await supabase.from('schedule').insert(DEFAULT_SCHEDULE_SEED);
  if (insertError) console.error(insertError);
}

async function loadAssignments() {
  const { data, error } = await supabase.from('assignments').select('*').order('due_date', { ascending: true });
  if (error) { console.error(error); return; }
  assignments = data || [];
}

async function loadRecaps() {
  const { data, error } = await supabase.from('recaps').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  recaps = data || [];
}

async function loadSchedule() {
  const { data, error } = await supabase.from('schedule').select('*');
  if (error) { console.error(error); return; }
  schedule = data || [];
}

function maybeNudgeForDueSoon() {
  const soon = assignments.some((a) => a.status === 'active' && dueBadgeState(a.due_date) === 'soon');
  if (soon) playNudge();
}

/* ============================================================
   render — assignments
   ============================================================ */

function dueBadgeState(dueIso) {
  const diffMs = new Date(dueIso).getTime() - Date.now();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 0) return 'overdue';
  if (hours <= 24) return 'soon';
  return 'normal';
}

function formatDue(dueIso) {
  return new Date(dueIso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function historyDaysLeft(movedIso) {
  const movedAt = new Date(movedIso).getTime();
  const cutoff = movedAt + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((cutoff - Date.now()) / (24 * 60 * 60 * 1000)));
  return daysLeft;
}

function renderAssignments() {
  const filtered = assignments.filter((a) => a.status === assignmentSegment);
  el.assignmentList.innerHTML = '';
  el.assignmentEmpty.hidden = filtered.length > 0;

  filtered.forEach((a) => {
    const li = document.createElement('li');
    li.className = 'item-card';

    const isHistory = a.status === 'history';
    const badgeState = isHistory ? null : dueBadgeState(a.due_date);

    let badgeHtml = '';
    if (!isHistory) {
      if (badgeState === 'overdue') badgeHtml = `<span class="pill is-overdue"><i data-lucide="alarm-clock"></i>overdue</span>`;
      else if (badgeState === 'soon') badgeHtml = `<span class="pill is-soon"><i data-lucide="alarm-clock"></i>due soon</span>`;
      else badgeHtml = `<span class="pill"><i data-lucide="calendar"></i>${formatDue(a.due_date)}</span>`;
    } else {
      badgeHtml = `<span class="pill"><i data-lucide="calendar"></i>due ${formatDue(a.due_date)}</span>`;
    }

    li.innerHTML = `
      <div class="item-top">
        ${isHistory ? '' : `<button class="item-check" data-action="done" aria-label="Mark done"><i data-lucide="check"></i></button>`}
        <div class="item-body">
          <div class="item-title">${escapeHtml(a.title)}</div>
          ${a.description ? `<div class="item-desc">${escapeHtml(a.description)}</div>` : ''}
          <div class="item-meta">${badgeHtml}</div>
          ${a.image_url ? `<img class="item-thumb" src="${a.image_url}" alt="" />` : ''}
          ${isHistory ? `<div class="history-note"><i data-lucide="timer"></i>auto-deletes in ${historyDaysLeft(a.moved_to_history_at)} day(s)</div>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="item-del" data-action="delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      askDelete({ table: 'assignments', id: a.id, label: a.title });
    });
    const doneBtn = li.querySelector('[data-action="done"]');
    if (doneBtn) doneBtn.addEventListener('click', () => markDone(a.id));

    el.assignmentList.appendChild(li);
  });

  window.lucide?.createIcons();
}

/* ============================================================
   render — recap
   ============================================================ */

function renderRecaps() {
  el.recapList.innerHTML = '';
  el.recapEmpty.hidden = recaps.length > 0;

  recaps.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.innerHTML = `
      <div class="item-top">
        <div class="item-body">
          <div class="item-title">${escapeHtml(r.title)}</div>
          ${r.content ? `<div class="item-desc">${escapeHtml(r.content)}</div>` : ''}
          <div class="item-meta"><span class="pill is-recap"><i data-lucide="sparkles"></i>${formatShortDate(r.created_at)}</span></div>
          ${r.image_url ? `<img class="item-thumb" src="${r.image_url}" alt="" />` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="item-del" data-action="delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      askDelete({ table: 'recaps', id: r.id, label: r.title });
    });
    el.recapList.appendChild(li);
  });

  window.lucide?.createIcons();
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/* ============================================================
   render — sched
   ============================================================ */

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function renderSchedule() {
  el.schedGroups.innerHTML = '';
  el.schedEmpty.hidden = schedule.length > 0;

  const byDay = {};
  schedule.forEach((s) => {
    (byDay[s.day_of_week] ||= []).push(s);
  });

  DAY_ORDER.filter((d) => byDay[d]?.length).forEach((day) => {
    const entries = byDay[day].sort((a, b) => a.start_time.localeCompare(b.start_time));

    const group = document.createElement('div');
    group.className = 'sched-day';
    group.innerHTML = `<div class="sched-day-label">${day}</div>`;

    entries.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'sched-card';
      card.innerHTML = `
        <div class="sched-time">${formatTime12(s.start_time)}<br/>–<br/>${formatTime12(s.end_time)}</div>
        <div class="sched-info">
          <div class="sched-title">${escapeHtml(s.title)}</div>
          ${s.code ? `<div class="sched-code">${escapeHtml(s.code)}</div>` : ''}
          <div class="sched-sub">
            ${s.room ? `<span><i data-lucide="map-pin"></i>${escapeHtml(s.room)}</span>` : ''}
            ${s.professor ? `<span><i data-lucide="user"></i>${escapeHtml(s.professor)}</span>` : ''}
          </div>
        </div>
        <button class="item-del" data-action="delete" aria-label="Delete"><i data-lucide="trash-2"></i></button>
      `;
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        askDelete({ table: 'schedule', id: s.id, label: s.title });
      });
      group.appendChild(card);
    });

    el.schedGroups.appendChild(group);
  });

  window.lucide?.createIcons();
}

/* ============================================================
   toast
   ============================================================ */

let toastTimer = null;
function showToast(message, icon = 'check') {
  clearTimeout(toastTimer);
  el.toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  el.toast.hidden = false;
  window.lucide?.createIcons();
  requestAnimationFrame(() => el.toast.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('is-visible');
    setTimeout(() => { el.toast.hidden = true; }, 250);
  }, 2200);
}

/* ============================================================
   utils
   ============================================================ */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* ============================================================
   go
   ============================================================ */

boot();