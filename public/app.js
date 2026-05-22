// ============================================================
//  app.js — Dark Coffee
// ============================================================

const API_URL = 'https://darkcoffee-production.up.railway.app/api/menu';
const FAV_KEY = 'darkcoffee_favorites';

function esc(str) {
  if (str === null || str === undefined) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

// FAVORITES
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}
function saveFavs(favs) { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }
function isFav(id) { return getFavs().some(f => f.id === String(id)); }
function toggleFav(item) {
  let favs = getFavs();
  const sid = String(item.id);
  const exists = favs.some(f => f.id === sid);
  if (exists) favs = favs.filter(f => f.id !== sid);
  else favs.push({ id: sid, name: item.name, price: item.price, description: item.description, image: item.image, category: item.category });
  saveFavs(favs);
  return !exists;
}

let _modalItem = null;

async function loadMenu() {
  try {
    const r = await fetch(API_URL);
    if (!r.ok) throw new Error('error');
    buildPage(await r.json());
  } catch {
    try {
      const r2 = await fetch('menu.json');
      if (!r2.ok) throw new Error('no fallback');
      buildPage(await r2.json());
    } catch { showError(); }
  }
}

function buildPage(data) {
  const { cafe, categories, items } = data;
  const catsArr = data.categoriesArr
    ? data.categoriesArr
    : Object.keys(categories).map(k => ({ key: k, ...categories[k] }));
  document.querySelector('.hero-title').textContent = cafe.name || 'Dark Coffee';
  buildTabs(catsArr);
  catsArr.forEach(cat => {
    const catItems = items.filter(i => i.category === cat.key).sort((a,b) => (a.order??9999)-(b.order??9999));
    buildSection(cat.key, cat, catItems);
  });
  buildFavoritesSection();
  if (catsArr.length > 0) activateTab(catsArr[0].key);
}

function buildTabs(catsArr) {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  catsArr.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.dataset.tab = cat.key;
    btn.textContent = ` ${cat.label}${cat.icon || ''}`;
    btn.addEventListener('click', () => activateTab(cat.key));
    tabsEl.appendChild(btn);
  });
  const favBtn = document.createElement('button');
  favBtn.className = 'tab-btn tab-btn-fav';
  favBtn.dataset.tab = '__favorites__';
  favBtn.textContent = '★ المفضلة';
  favBtn.addEventListener('click', () => { activateTab('__favorites__'); renderFavoritesSection(); });
  tabsEl.appendChild(favBtn);
}

function buildSection(catKey, cat, items) {
  const wrapper = document.getElementById('sections');
  const section = document.createElement('div');
  section.id = catKey; section.className = 'tab-content';
  const header = document.createElement('div'); header.className = 'section-header';
  const title = document.createElement('h2'); title.className = 'section-title'; title.textContent = `${cat.label} ${cat.icon || ''}`;
  const subtitle = document.createElement('p'); subtitle.className = 'section-subtitle'; subtitle.textContent = cat.subtitle || '';
  const gridIcon = document.createElement('div'); gridIcon.className = 'grid-icon';
  const grid = document.createElement('div'); grid.className = 'menu-grid'; grid.id = `grid-${catKey}`;
  header.appendChild(title); header.appendChild(subtitle);
  section.appendChild(header); section.appendChild(gridIcon); section.appendChild(grid);
  wrapper.appendChild(section);
  items.forEach((item, index) => grid.appendChild(buildCard(item, index)));
}

function buildFavoritesSection() {
  const wrapper = document.getElementById('sections');
  const section = document.createElement('div');
  section.id = '__favorites__'; section.className = 'tab-content';
  wrapper.appendChild(section);
}

function renderFavoritesSection() {
  const section = document.getElementById('__favorites__');
  section.innerHTML = '';
  const header = document.createElement('div'); header.className = 'section-header';
  const title = document.createElement('h2'); title.className = 'section-title'; title.textContent = '★ المفضلة';
  const subtitle = document.createElement('p'); subtitle.className = 'section-subtitle'; subtitle.textContent = 'العناصر التي أضفتها للمفضلة';
  header.appendChild(title); header.appendChild(subtitle); section.appendChild(header);
  const favs = getFavs();
  if (!favs.length) {
    const empty = document.createElement('div'); empty.className = 'fav-empty';
    const icon = document.createElement('span'); icon.textContent = '☆';
    const p = document.createElement('p'); p.textContent = 'لا توجد عناصر مفضلة بعد';
    const sm = document.createElement('small'); sm.textContent = 'اضغط على النجمة في أي عنصر لإضافته هنا';
    empty.appendChild(icon); empty.appendChild(p); empty.appendChild(sm); section.appendChild(empty);
    return;
  }
  const grid = document.createElement('div'); grid.className = 'menu-grid';
  favs.forEach((item, index) => grid.appendChild(buildCard(item, index)));
  section.appendChild(grid);
}

function buildCard(item, index) {
  const card = document.createElement('div');
  card.className = 'menu-card';
  card.dataset.itemId = String(item.id);
  card.style.animationDelay = `${index * 0.06}s`;

  const imageWrap = document.createElement('div');
  imageWrap.className = 'card-image-wrap';

  const img = document.createElement('img');
  img.className = 'card-image'; img.loading = 'lazy';
  const safeImg = /^https?:\/\//i.test(item.image || '') ? item.image : 'images/placeholder.jpg';
  img.src = safeImg; img.alt = item.name;
  img.onerror = function() { this.src = 'images/placeholder.jpg'; this.onerror = null; };
  imageWrap.appendChild(img);

  const starBtn = document.createElement('button');
  starBtn.className = 'card-star-btn';
  starBtn.title = 'أضف للمفضلة';
  starBtn.setAttribute('aria-label', 'أضف للمفضلة');
  const favNow = isFav(item.id);
  starBtn.classList.toggle('active', favNow);
  starBtn.textContent = favNow ? '★' : '☆';

  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    const nowFav = toggleFav(item);
    syncAllCardStars(item.id, nowFav);
    if (_modalItem && String(_modalItem.id) === String(item.id)) updateModalStar(nowFav);
    if (document.getElementById('__favorites__')?.classList.contains('active')) renderFavoritesSection();
    starBtn.classList.add('pop');
    starBtn.addEventListener('animationend', () => starBtn.classList.remove('pop'), { once: true });
  });

  imageWrap.appendChild(starBtn);

  const body = document.createElement('div'); body.className = 'card-body';
  const top = document.createElement('div'); top.className = 'card-top';
  const name = document.createElement('span'); name.className = 'card-name'; name.textContent = item.name;
  const price = document.createElement('span'); price.className = 'card-price'; price.textContent = `${item.price} د.ع`;
  const desc = document.createElement('p'); desc.className = 'card-desc'; desc.textContent = item.description;
  top.appendChild(name); top.appendChild(price);
  body.appendChild(top); body.appendChild(desc);
  card.appendChild(imageWrap); card.appendChild(body);

  card.addEventListener('click', () => openItemModal(item));
  return card;
}

function syncAllCardStars(itemId, isFaved) {
  const sid = String(itemId);
  document.querySelectorAll('.menu-card').forEach(card => {
    if (card.dataset.itemId === sid) {
      const btn = card.querySelector('.card-star-btn');
      if (btn) {
        btn.textContent = isFaved ? '★' : '☆';
        btn.classList.toggle('active', isFaved);
      }
    }
  });
}

function openItemModal(item) {
  _modalItem = item;
  const overlay = document.getElementById('itemModalOverlay');
  const safeImg = /^https?:\/\//i.test(item.image || '') ? item.image : 'images/placeholder.jpg';
  document.getElementById('modalImg').src = safeImg;
  document.getElementById('modalImg').onerror = function() { this.src = 'images/placeholder.jpg'; this.onerror = null; };
  document.getElementById('modalImg').alt = item.name;
  document.getElementById('modalName').textContent = item.name;
  document.getElementById('modalPrice').textContent = `${item.price} د.ع`;
  document.getElementById('modalDesc').textContent = item.description || '';
  updateModalStar(isFav(item.id));
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateModalStar(isFaved) {
  const btn = document.getElementById('modalFavBtn');
  const icon = document.getElementById('modalFavIcon');
  if (!btn || !icon) return;
  icon.textContent = isFaved ? '★' : '☆';
  btn.classList.toggle('active', isFaved);
}

function toggleFavFromModal() {
  if (!_modalItem) return;
  const nowFav = toggleFav(_modalItem);
  updateModalStar(nowFav);
  syncAllCardStars(_modalItem.id, nowFav);
  if (document.getElementById('__favorites__')?.classList.contains('active')) renderFavoritesSection();
}

function closeItemModal(event) {
  if (event && event.target !== document.getElementById('itemModalOverlay')) return;
  _closeModal();
}
function closeItemModalDirect() { _closeModal(); }
function _closeModal() {
  const overlay = document.getElementById('itemModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  _modalItem = null;
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeModal(); });

function activateTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabKey));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === tabKey));
  if (tabKey === '__favorites__') renderFavoritesSection();
}

function showError() {
  const sections = document.getElementById('sections');
  sections.textContent = '';
  const msg = document.createElement('div');
  msg.style.cssText = 'text-align:center;padding:60px 20px;color:var(--dark-green);font-size:1.1rem;';
  msg.textContent = '⚠️ تعذّر تحميل القائمة، تأكد من تشغيل الخادم.';
  sections.appendChild(msg);
}

document.addEventListener('DOMContentLoaded', loadMenu);