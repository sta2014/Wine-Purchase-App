import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/libre-caslon-display/latin-400.css';
import './style.css';
import { STORAGE_KEY, TYPES, CURRENCIES, localDate, normalizeWine, parseCollection, serializeCollection, saveCollection, mergeCollection, filterWines, escapeHTML as esc } from './model.js';
import { mountIntelligence } from './terminal.js';

const paths = {
  glass: '<path d="M7 3h10l1.5 7a6.7 6.7 0 0 1-13 0L7 3ZM12 17v5M8 22h8M6 10h12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  bottle: '<path d="M10 2h4v7l3 4v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8l3-4V2ZM10 5h4M7 15h10M7 19h10"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  down: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  up: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const state = { wines: [], status: 'all', query: '', type: 'all', sort: 'newest' };
let storageBlocked = false;
let storageProblem = '';
let editingId = null;
let returnFocus = null;
let toastTimeout;
try { state.wines = parseCollection(localStorage.getItem(STORAGE_KEY)); }
catch { storageBlocked = true; storageProblem = 'Your saved collection could not be opened. Nothing has been overwritten. Export it for safekeeping, then import a valid backup to recover it.'; }

document.querySelector('#app').innerHTML = `
  <a class="skip-link" href="#collection">Skip to your wines</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="./" aria-label="The Wine Journal home"><span class="brand-mark">${icon('glass')}</span><span>The Wine Journal<span class="brand-subtitle">A little collection of good taste.</span></span></a>
    <div class="header-actions"><button class="button quiet" id="backup-button" aria-label="Backups">${icon('down')}<span>Backups</span></button><button class="button primary" data-add>${icon('plus')}<span>Add a wine</span></button></div>
  </div></header>
  <main class="page">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy"><p class="eyebrow"><span></span> YOUR PERSONAL WINE JOURNAL</p><h1 id="hero-title">Good wine.<br><em>Worth remembering.</em></h1><p class="hero-description">The bottles you’re dreaming of. The ones you brought home.<br class="desktop-break"> Keep every good find in one happy place.</p><div class="hero-footnote">${icon('heart')} A collection that’s entirely yours.</div></div>
      <div class="hero-art" aria-hidden="true"><div class="art-orbit"></div><span class="art-star star-one">✧</span><span class="art-star star-two">✧</span><div class="art-caption">A GOOD BOTTLE<br>IS A GOOD BEGINNING.</div><div class="wine-bottle"><div class="bottle-cap"></div><div class="bottle-neck"></div><div class="bottle-body"><div class="bottle-label"><span>THE WINE</span><span class="label-grape">✺</span><strong>Journal</strong><span>ONE TO REMEMBER</span></div></div></div><div class="art-note">For the love<br><em>of a good find.</em></div></div>
    </section>
    <section class="stats" aria-label="Collection overview">
      <div class="stat"><span class="stat-icon wishlist-icon">${icon('heart')}</span><div><span class="stat-value" id="wishlist-count">0</span><span class="stat-label">Wines on your wishlist</span></div><span class="stat-detail">A little anticipation</span></div>
      <div class="stat"><span class="stat-icon bought-icon">${icon('check')}</span><div><span class="stat-value" id="purchased-count">0</span><span class="stat-label">Wines you’ve purchased</span></div><span class="stat-detail">Good finds, remembered</span></div>
      <div class="stat"><span class="stat-icon bottles-icon">${icon('bottle')}</span><div><span class="stat-value" id="bottles-count">0</span><span class="stat-label">Total bottles purchased</span></div><span class="stat-detail">Every bottle has a story</span></div>
    </section>
    <div class="alert" id="storage-alert" role="alert" hidden></div>
    <section class="collection" id="collection" aria-labelledby="collection-title">
      <div class="collection-heading"><div><p class="eyebrow">SAVED WITH GOOD TASTE</p><h2 id="collection-title">Your collection<span class="collection-total" id="collection-total">0</span></h2></div><span class="storage-note">${icon('check')} Saved in this browser</span></div>
      <div class="collection-toolbar"><div class="list-tabs" role="group" aria-label="Filter by list"><button class="list-tab active" data-status="all" aria-pressed="true">All wines</button><button class="list-tab" data-status="wishlist" aria-pressed="false">${icon('heart')}Wishlist</button><button class="list-tab" data-status="purchased" aria-pressed="false">${icon('check')}Purchased</button></div><label class="search-box">${icon('search')}<span class="sr-only">Search wines</span><input id="search" type="search" placeholder="Find a wine, producer, or region…" maxlength="200"></label></div>
      <div class="filter-row"><span id="result-count" aria-live="polite"></span><div class="filter-controls"><label><span class="sr-only">Wine type filter</span><select id="type-filter"><option value="all">All wine types</option>${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label><label><span class="sr-only">Sort wines</span><select id="sort"><option value="newest">Recently added</option><option value="name">Name: A to Z</option></select></label></div></div>
      <div id="wine-list"></div>
    </section>
    <footer class="footer"><span>${icon('glass')} Here’s to your next favorite.</span><p>Your journal stays in this browser. Export a backup to keep a copy or move devices.</p></footer>
  </main>
  <dialog id="wine-dialog" aria-labelledby="wine-dialog-title"><form id="wine-form"><div class="dialog-heading"><div><p class="eyebrow">MAKE A LITTLE NOTE</p><h2 id="wine-dialog-title">Add a wine</h2></div><button type="button" class="icon-button" data-close="wine-dialog" aria-label="Close wine form">${icon('close')}</button></div>
    <p class="dialog-intro">A few details now. A great bottle remembered later.</p>
    <div class="form-grid">
      <label class="full">Wine name <span class="required">*</span><input name="name" required maxlength="120" placeholder="e.g. Côtes du Rhône" autocomplete="off"></label>
      <label class="full">Producer<input name="producer" maxlength="120" placeholder="e.g. E. Guigal"></label>
      <label>Wine type<select name="type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Vintage<input name="vintage" type="number" min="1800" max="${new Date().getFullYear() + 1}" step="1" placeholder="Year, or leave blank"></label>
      <label class="full">Region or country<input name="region" maxlength="120" placeholder="e.g. Rhône Valley, France"></label>
      <label>Add to<select name="status"><option value="wishlist">Wishlist — want to buy</option><option value="purchased">Purchased — already bought</option></select></label>
      <label>Number of bottles<input name="quantity" type="number" min="1" max="9999" step="1" value="1" required inputmode="numeric"></label>
      <label>Price per bottle<input name="price" type="number" min="0" max="10000000" step="0.01" placeholder="Optional" inputmode="decimal"></label>
      <label>Currency<select name="currency">${CURRENCIES.map(c => `<option>${c}</option>`).join('')}</select></label>
      <label class="full" id="purchase-date-field" hidden>Purchase date<input name="purchaseDate" type="date"></label>
      <label class="full">Notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Where you found it, who recommended it, or what made it special…"></textarea></label>
    </div>
    <p id="form-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button danger" id="remove-wine" hidden>Remove wine</button><span class="action-spacer"></span><button type="button" class="button secondary" data-close="wine-dialog">Cancel</button><button type="submit" class="button primary" id="save-wine">Save wine ${icon('arrow')}</button></div>
  </form></dialog>
  <dialog id="delete-dialog" class="small-dialog" aria-labelledby="delete-title"><h2 id="delete-title">Remove this wine?</h2><p id="delete-description"></p><div class="dialog-actions"><button class="button secondary" data-close="delete-dialog">Keep wine</button><button class="button primary" id="confirm-delete">Remove wine</button></div></dialog>
  <dialog id="backup-dialog" class="small-dialog" aria-labelledby="backup-title"><div class="dialog-heading"><h2 id="backup-title">A copy for safekeeping.</h2><button class="icon-button" data-close="backup-dialog" aria-label="Close backups">${icon('close')}</button></div><p>Wines are saved in this browser on this device. Clearing browser data can remove them. Download a backup whenever you’d like to keep a copy.</p><button class="button primary backup-action" id="export-button">${icon('down')}Export backup</button><div class="backup-divider"></div><h3>Bring your journal with you</h3><p>Import a Wine Journal backup to add its wines. Wines already in your journal are kept as they are; duplicates are skipped.</p><button class="button secondary backup-action" id="import-button">${icon('up')}Import backup</button><input id="import-file" type="file" accept=".json,application/json" hidden><p id="backup-message" role="status" hidden></p></dialog>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
`;

const $ = selector => document.querySelector(selector);
const form = $('#wine-form');
function showToast(message) { clearTimeout(toastTimeout); $('#toast').textContent = message; $('#toast').hidden = false; toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function dateLabel(date) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function money(wine) { return wine.price === null ? 'Price not added' : `${new Intl.NumberFormat(undefined, { style: 'currency', currency: wine.currency }).format(wine.price)} <span class="price-currency">${wine.currency}</span>`; }
function card(wine) {
  const purchased = wine.status === 'purchased';
  const color = { Red: 'red', White: 'white', 'Rosé': 'rose', Sparkling: 'sparkling', Dessert: 'dessert', Fortified: 'fortified', Other: 'other' }[wine.type];
  return `<article class="wine-card"><div class="card-top"><span class="wine-type ${color}"><span></span>${wine.type}</span><button class="icon-button" data-edit="${wine.id}" aria-label="Edit ${esc(wine.name)}">${icon('edit')}</button></div><div class="card-title"><span class="vintage">${wine.vintage ?? 'NV / unknown'}</span><h3>${esc(wine.name)}</h3><p>${esc(wine.producer || 'Producer not added')}</p></div><div class="wine-region">${esc(wine.region || 'Region not added')}</div><p class="wine-notes ${wine.notes ? '' : 'no-notes'}">${esc(wine.notes || 'A good story starts with a little note.')}</p><div class="wine-details"><span class="wine-price">${money(wine)}</span><span>${wine.quantity} ${wine.quantity === 1 ? 'bottle' : 'bottles'}</span></div><div class="card-footer"><span class="status-badge ${purchased ? 'purchased' : 'wishlist'}">${icon(purchased ? 'check' : 'heart')}${purchased ? 'Purchased' : 'Wishlist'}</span>${purchased ? `<span class="purchase-date">${dateLabel(wine.purchaseDate)}</span>` : `<button class="purchase-button" data-purchase="${wine.id}">Mark as purchased ${icon('arrow')}</button>`}</div></article>`;
}
function render() {
  const wishlist = state.wines.filter(w => w.status === 'wishlist');
  const purchased = state.wines.filter(w => w.status === 'purchased');
  $('#wishlist-count').textContent = wishlist.length;
  $('#purchased-count').textContent = purchased.length;
  $('#bottles-count').textContent = purchased.reduce((sum, w) => sum + w.quantity, 0).toLocaleString();
  $('#collection-total').textContent = state.wines.length;
  $('#storage-alert').hidden = !storageProblem;
  $('#storage-alert').textContent = storageProblem;
  document.querySelectorAll('[data-add]').forEach(button => { button.disabled = storageBlocked; });
  document.querySelectorAll('[data-status]').forEach(button => { const active = button.dataset.status === state.status; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  const visible = filterWines(state.wines, state);
  $('#result-count').textContent = `${visible.length} ${visible.length === 1 ? 'wine' : 'wines'}${state.query || state.type !== 'all' ? ' found' : ' in this list'}`;
  const hasWines = state.wines.length > 0;
  $('#wine-list').className = visible.length ? 'wine-grid' : '';
  $('#wine-list').innerHTML = visible.length ? visible.map(card).join('') : `<div class="empty-state"><div class="empty-art">${icon(hasWines ? 'search' : 'bottle')}<span>✧</span></div><p class="eyebrow">${hasWines ? 'ROOM FOR ANOTHER GOOD FIND' : 'EVERY COLLECTION STARTS SOMEWHERE'}</p><h3>${hasWines ? 'No wines here just yet.' : 'Meet your next favorite bottle.'}</h3><p>${hasWines ? 'Try another search or filter, or add a wine to this list.' : 'Spotted something lovely? Add it to your wishlist.<br>Brought a bottle home? Keep the details here.'}</p><button class="button ${hasWines ? 'secondary' : 'primary'}" ${hasWines ? 'id="clear-filters"' : 'data-add'} ${storageBlocked ? 'disabled' : ''}>${icon(hasWines ? 'search' : 'plus')}${hasWines ? 'Show all wines' : 'Add your first wine'}</button><span class="empty-footnote">${hasWines ? 'A good find is always worth a note.' : 'No account needed. Just your good taste.'}</span></div>`;
}

function persist(next) {
  saveCollection(localStorage, next);
  state.wines = next;
  storageBlocked = false;
  storageProblem = '';
  render();
}
function updatePurchaseDate() {
  const purchased = form.elements.status.value === 'purchased';
  $('#purchase-date-field').hidden = !purchased;
  form.elements.purchaseDate.required = purchased;
  if (purchased && !form.elements.purchaseDate.value) form.elements.purchaseDate.value = localDate();
}
function openWine(id = null, purchase = false) {
  if (storageBlocked) return;
  const wine = state.wines.find(w => w.id === id);
  if (id && !wine) return;
  editingId = id;
  returnFocus = document.activeElement;
  form.reset();
  if (wine) for (const [key, value] of Object.entries(wine)) { if (form.elements[key]) form.elements[key].value = value ?? ''; }
  else { form.elements.status.value = state.status === 'purchased' ? 'purchased' : 'wishlist'; form.elements.currency.value = state.wines.at(-1)?.currency ?? 'USD'; }
  if (purchase) form.elements.status.value = 'purchased';
  updatePurchaseDate();
  $('#wine-dialog-title').textContent = purchase ? 'A good find, brought home.' : wine ? 'A little more about this wine.' : 'Add a wine';
  $('#save-wine').innerHTML = `${purchase ? 'Save purchase' : 'Save wine'} ${icon('arrow')}`;
  $('#remove-wine').hidden = !wine;
  $('#form-error').hidden = true;
  $('#wine-dialog').showModal();
  form.elements.name.focus();
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-add')) openWine();
  if (button.dataset.edit) openWine(button.dataset.edit);
  if (button.dataset.purchase) openWine(button.dataset.purchase, true);
  if (button.dataset.close) document.getElementById(button.dataset.close).close();
  if (button.dataset.status) { state.status = button.dataset.status; render(); }
  if (button.id === 'clear-filters') { state.status = 'all'; state.query = ''; state.type = 'all'; $('#search').value = ''; $('#type-filter').value = 'all'; render(); }
});
$('#wine-dialog').addEventListener('close', () => {
  const target = returnFocus?.isConnected ? returnFocus : $('[data-add]');
  target?.focus();
});
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#type-filter').addEventListener('change', event => { state.type = event.target.value; render(); });
$('#sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
form.elements.status.addEventListener('change', updatePurchaseDate);
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const previous = state.wines.find(w => w.id === editingId);
    const wine = normalizeWine({ ...Object.fromEntries(new FormData(form)), id: editingId ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? new Date().toISOString() });
    const next = editingId ? state.wines.map(w => w.id === editingId ? wine : w) : [...state.wines, wine];
    persist(next);
    $('#wine-dialog').close();
    showToast(`${wine.name} ${previous ? 'updated' : 'added to your ' + (wine.status === 'wishlist' ? 'wishlist' : 'purchased wines')}.`);
  } catch (error) { $('#form-error').textContent = error.name === 'QuotaExceededError' || error.name === 'SecurityError' ? 'Your browser could not save this wine. Export a backup and check that browser storage is available.' : error.message; $('#form-error').hidden = false; }
});
$('#remove-wine').addEventListener('click', () => {
  const wine = state.wines.find(w => w.id === editingId);
  $('#delete-description').textContent = `“${wine.name}” will be removed from your journal. This cannot be undone.`;
  $('#delete-dialog').showModal();
});
$('#confirm-delete').addEventListener('click', () => {
  try { persist(state.wines.filter(w => w.id !== editingId)); $('#delete-dialog').close(); $('#wine-dialog').close(); showToast('Wine removed from your journal.'); }
  catch { $('#delete-description').textContent = 'Your browser could not save this change. Your wine has not been removed. Please try again.'; }
});
$('#backup-button').addEventListener('click', () => { $('#backup-message').hidden = true; $('#backup-dialog').showModal(); });
$('#export-button').addEventListener('click', () => {
  try {
    const data = storageBlocked ? localStorage.getItem(STORAGE_KEY) : serializeCollection(state.wines);
    if (!data) throw new Error('No saved data is available to export.');
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `wine-journal-${localDate()}${storageBlocked ? '-recovery' : ''}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#backup-message').textContent = 'Your backup download has started. Keep it somewhere safe.';
  } catch (error) { $('#backup-message').textContent = error.message; }
  $('#backup-message').hidden = false;
});
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Please choose a backup smaller than 10 MB.');
    const imported = parseCollection(await file.text());
    const next = mergeCollection(state.wines, imported);
    const added = next.length - state.wines.length;
    persist(next);
    $('#backup-message').textContent = `${added} ${added === 1 ? 'wine' : 'wines'} imported. ${imported.length - added} already in your journal.`;
  } catch (error) { $('#backup-message').textContent = `Backup not imported. ${error.message}`; }
  $('#backup-message').hidden = false;
  event.target.value = '';
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    const updated = parseCollection(localStorage.getItem(STORAGE_KEY));
    // Close stale edit forms rather than silently overwriting another tab's changes.
    if ($('#wine-dialog').open) { $('#delete-dialog').close(); $('#wine-dialog').close(); showToast('Your journal changed in another tab. Reopen the wine to edit the latest version.'); }
    state.wines = updated; storageBlocked = false; storageProblem = ''; render();
  } catch { storageBlocked = true; storageProblem = 'Your saved collection changed but could not be read. Export a recovery copy before importing a valid backup.'; $('#delete-dialog').close(); $('#wine-dialog').close(); render(); }
});
render();
mountIntelligence();
