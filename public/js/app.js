// SATINOSTITCH storefront master application
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Currency configuration
  const CURRENCIES = {
    INR: { symbol: '₹', rate: 1, label: 'INR (₹)' },
    USD: { symbol: '$', rate: 0.012, label: 'USD ($)' },
    EUR: { symbol: '€', rate: 0.011, label: 'EUR (€)' },
    GBP: { symbol: '£', rate: 0.0095, label: 'GBP (£)' },
    AED: { symbol: 'AED ', rate: 0.044, label: 'AED (د.إ)' }
  };

  const getCurrency = () => localStorage.getItem('ss_currency') || 'INR';
  const setCurrency = (c) => {
    localStorage.setItem('ss_currency', c);
    renderAllPrices();
  };

  const money = n => {
    const cur = CURRENCIES[getCurrency()] || CURRENCIES.INR;
    const converted = Math.round(Number(n) * cur.rate);
    return cur.symbol + converted.toLocaleString('en-IN');
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const db = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('ss_' + k)) ?? d; } catch { return d; } },
    set: (k, v) => { localStorage.setItem('ss_' + k, JSON.stringify(v)); updateCounts(); }
  };

  let PRODUCTS = [];
  const byId = id => PRODUCTS.find(p => p.id === Number(id));

  const COLLECTIONS = [
    { key: 'wedding', name: 'Wedding Edit', text: 'Royal Banarasi silk sarees, bridal lehengas and gold zari sets.', img: 'images/wedding-edit.jpg' },
    { key: 'festive', name: 'Festive Wear', text: 'Heritage bandhani, lustrous satin and antique gold craft.', img: 'images/p4.jpg' },
    { key: 'everyday', name: 'Everyday Cotton', text: 'Breathable Mulmul hand-block prints and pure Chanderi kurtas.', img: 'images/p5.jpg' },
    { key: 'work', name: 'Work Wardrobe', text: 'Sartorial linen check blazers and pleated crepe tailoring.', img: 'images/p9.jpg' }
  ];

  /* ---------- shared chrome ---------- */
  const NAV = [
    ['index.html', 'Home'],
    ['shop.html', 'Shop'],
    ['collections.html', 'Collections'],
    ['about.html', 'About'],
    ['contact.html', 'Contact']
  ];

  function mountChrome() {
    const file = location.pathname.split('/').pop() || 'index.html';
    const current = file === 'product.html' ? 'shop.html' : file;
    const user = db.get('user', null);
    const activeCur = getCurrency();

    // Site Header
    const headerEl = $('#site-header');
    if (headerEl) {
      headerEl.innerHTML = `
        <div class="announcement-bar">
          <div class="wrap announcement-in">
            <div class="announcement-ticker">
              <span>COMPLIMENTARY EXPRESS SHIPPING ON ORDERS OVER ${money(3000)}</span>
              <span>•</span>
              <span>10% OFF YOUR FIRST ORDER:</span>
              <span class="promo-badge-click" id="copy-promo" title="Click to copy code">HERITAGE10 (Tap to Copy)</span>
            </div>
            <div class="top-utils">
              <select class="currency-select" id="cur-select" aria-label="Select Currency">
                ${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === activeCur ? 'selected' : ''}>${v.label}</option>`).join('')}
              </select>
              <span>${user ? `Welcome, ${esc(user.name)}` : `<a href="login.html" style="color:var(--gold-light)">Sign In</a>`}</span>
            </div>
          </div>
        </div>

        <header class="top">
          <div class="wrap top-in">
            <a class="logo" href="index.html" aria-label="SATINOSTITCH Home">
              <img src="images/emblem-gold.png" alt="SATINOSTITCH Emblem" class="site-logo-emblem">
              <img src="images/logo-wordmark-gold.png" alt="SATINOSTITCH" class="site-logo-wordmark">
            </a>
            
            <nav class="nav" id="nav">
              ${NAV.map(([href, label]) => `<a href="${href}" ${file === href ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
            </nav>

            <div class="tools">
              <a class="tool-link" href="shop.html" aria-label="Search Shop">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </a>
              <a class="tool-link" href="wishlist.html" aria-label="Wishlist">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                <b class="tool-badge" data-count="wish">0</b>
              </a>
              <a class="tool-link" href="cart.html" aria-label="Shopping Cart">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                <b class="tool-badge" data-count="cart">0</b>
              </a>
              <button class="menu-btn" aria-label="Toggle navigation" aria-expanded="false">☰</button>
            </div>
          </div>
        </header>`;
    }

    // Site Footer
    const footerEl = $('#site-footer');
    if (footerEl) {
      footerEl.innerHTML = `
        <footer>
          <div class="wrap foot-grid">
              <div class="foot-logo-brand">
                <img src="images/emblem-gold.png" alt="" class="foot-logo-emblem">
                <img src="images/logo-wordmark-gold.png" alt="SATINOSTITCH" class="foot-logo-wordmark">
              </div>
              <p>Woven for weddings, cut for every day. Curating authentic Indian heritage textiles alongside contemporary sartorial tailoring with uncompromising precision.</p>
              <div style="margin-top:1.2rem;display:flex;gap:0.8rem">
                <span class="hero-pill" style="font-size:0.75rem;background:rgba(255,255,255,0.1);color:var(--gold-light);border-color:rgba(198,161,91,0.3)">Silk Mark Certified</span>
                <span class="hero-pill" style="font-size:0.75rem;background:rgba(255,255,255,0.1);color:var(--gold-light);border-color:rgba(198,161,91,0.3)">Ethical Handloom</span>
              </div>
            </div>
            <div>
              <h3>Explore</h3>
              <a href="shop.html?cat=ethnic">Ethnic Sarees &amp; Sets</a>
              <a href="shop.html?cat=western">Western Blazers &amp; Dresses</a>
              <a href="collections.html">Curated Collections</a>
              <a href="shop.html?col=wedding">Bridal Troussau</a>
            </div>
            <div>
              <h3>Patron Care</h3>
              <a href="about.html">Our Heritage Story</a>
              <a href="contact.html">Bespoke Inquiries</a>
              <a href="login.html">Account &amp; Orders</a>
              <a href="javascript:void(0)" onclick="openFitFinder()">Virtual Size Finder</a>
            </div>
            <div>
              <h3>The VIP Atelier</h3>
              <p>Receive exclusive invitations to private trunk shows and seasonal previews.</p>
              <form class="newsletter-form" onsubmit="event.preventDefault(); this.reset(); window.toast('Welcome to the SATINOSTITCH VIP Atelier.');">
                <input type="email" required placeholder="Enter your email" aria-label="Email Address">
                <button class="btn gold sm" type="submit">Join</button>
              </form>
            </div>
          </div>
          <div class="wrap copy-row">
            <span>© 2026 SATINOSTITCH LUXURY BOUTIQUE. All rights reserved.</span>
            <span>Handcrafted with precision · Banarasi Silk · Pure Mulberry · Fine Suiting</span>
          </div>
        </footer>`;
    }

    // Currency Switcher Event
    const curSelect = $('#cur-select');
    if (curSelect) {
      curSelect.addEventListener('change', e => {
        setCurrency(e.target.value);
        toast(`Currency changed to ${e.target.value}`);
      });
    }

    // Coupon Copy Event
    const copyPromo = $('#copy-promo');
    if (copyPromo) {
      copyPromo.addEventListener('click', () => {
        navigator.clipboard?.writeText('HERITAGE10');
        db.set('promo', 'HERITAGE10');
        copyPromo.textContent = 'HERITAGE10 (Copied!)';
        toast('Promo code HERITAGE10 copied & applied for 10% off!');
        setTimeout(() => { copyPromo.textContent = 'HERITAGE10 (Tap to Copy)'; }, 4000);
      });
    }

    // Mobile Menu Toggle
    const menuBtn = $('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        const isOpen = $('#nav').classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', isOpen);
      });
    }

    // Sticky Header Scroll Shadow
    window.addEventListener('scroll', () => {
      const topBar = $('.top');
      if (topBar) topBar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    updateCounts();
  }

  function updateCounts() {
    const c = db.get('cart', []).reduce((s, i) => s + i.qty, 0);
    $$('[data-count=cart]').forEach(e => {
      e.textContent = c;
      e.classList.add('pop');
      setTimeout(() => e.classList.remove('pop'), 400);
    });
    $$('[data-count=wish]').forEach(e => {
      e.textContent = db.get('wish', []).length;
    });
  }

  function renderAllPrices() {
    // Re-render active page to reflect changed currency
    const page = document.body.dataset.page;
    if (pages[page]) pages[page]();
  }

  function toast(msg, href, label) {
    $('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>` + (href ? `<a href="${href}">${label}</a>` : '');
    document.body.append(t);
    setTimeout(() => {
      t.style.animation = 'toastIn 0.3s reverse forwards';
      setTimeout(() => t.remove(), 300);
    }, 3800);
  }

  window.toast = toast;

  /* ---------- Cart and Wishlist operations ---------- */
  function addToCart(id, size, qty = 1) {
    const cart = db.get('cart', []);
    const hit = cart.find(i => i.id === id && i.size === size);
    hit ? hit.qty += qty : cart.push({ id, size, qty });
    db.set('cart', cart);
  }

  function toggleWish(id) {
    const w = db.get('wish', []);
    const on = !w.includes(id);
    db.set('wish', on ? [...w, id] : w.filter(x => x !== id));
    return on;
  }

  const lines = () => db.get('cart', []).map(i => ({ ...i, p: byId(i.id) })).filter(l => l.p);

  function totals(ls) {
    const sub = ls.reduce((s, l) => s + l.p.price * l.qty, 0);
    const disc = db.get('promo', '') === 'HERITAGE10' ? Math.round(sub * 0.1) : 0;
    const ship = !sub || (sub - disc >= 3000) ? 0 : 150;
    return { sub, disc, ship, total: sub - disc + ship };
  }

  function summary(ls, t) {
    const remainingForFreeShip = Math.max(0, 3000 - (t.sub - t.disc));
    const progressPct = Math.min(100, Math.round(((t.sub - t.disc) / 3000) * 100));

    return `
      <div class="shipping-progress">
        <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600">
          <span>${remainingForFreeShip > 0 ? `Add ${money(remainingForFreeShip)} more for Free Shipping` : 'You qualify for complimentary express delivery'}</span>
          <span>${progressPct}%</span>
        </div>
        <div class="shipping-bar-wrap">
          <div class="shipping-bar-fill" style="width:${progressPct}%"></div>
        </div>
      </div>

      ${ls.map(l => `
        <div class="row">
          <span>${esc(l.p.name)} <span class="muted">(${l.size})</span> × ${l.qty}</span>
          <span style="font-weight:500">${money(l.p.price * l.qty)}</span>
        </div>
      `).join('')}
      
      <div class="row" style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px dashed var(--line)">
        <span>Subtotal</span>
        <span>${money(t.sub)}</span>
      </div>
      ${t.disc ? `
        <div class="row" style="color:var(--success);font-weight:500">
          <span>Promo HERITAGE10 (10% OFF)</span>
          <span>−${money(t.disc)}</span>
        </div>
      ` : ''}
      <div class="row">
        <span>Express Insured Shipping</span>
        <span>${t.ship ? money(t.ship) : '<span style="color:var(--success);font-weight:600">Complimentary</span>'}</span>
      </div>
      <div class="row total">
        <span>Order Total</span>
        <span>${money(t.total)}</span>
      </div>`;
  }

  // Product card renderer
  function card(p) {
    const on = db.get('wish', []).includes(p.id);
    const href = `product.html?id=${p.id}`;
    const imgSrc = p.image || 'images/p1.jpg';
    const discount = p.old ? Math.round(((p.old - p.price) / p.old) * 100) : null;

    return `
      <article class="card" data-product-id="${p.id}">
        <div class="card-media">
          <a href="${href}" aria-label="${esc(p.name)}">
            <img src="${imgSrc}" alt="${esc(p.name)}" loading="lazy">
          </a>
          ${p.tag ? `<span class="card-tag ${p.tag.toLowerCase().includes('bridal') ? 'bridal' : ''}">${p.tag}</span>` : ''}
          <button class="heart-btn ${on ? 'on' : ''}" data-wish="${p.id}" aria-pressed="${on}" aria-label="Save ${esc(p.name)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
          </button>
          <div class="quick-view-overlay">
            <button class="btn-quick-view" data-quickview="${p.id}">Quick View</button>
          </div>
        </div>

        <div class="card-body">
          <div class="card-meta">
            <span>${p.cat === 'ethnic' ? 'Ethnic Heritage' : 'Western Sartorial'}</span>
            <span class="card-rating">${p.rating || '4.9'} / 5 <span class="muted" style="font-size:0.75rem">(${p.reviews || 42})</span></span>
          </div>

          <h3 class="card-title"><a href="${href}">${esc(p.name)}</a></h3>
          
          <div class="card-price-row">
            <span class="card-price">${money(p.price)}</span>
            ${p.old ? `<span class="card-old-price">${money(p.old)}</span>` : ''}
            ${discount ? `<span class="card-discount">${discount}% OFF</span>` : ''}
          </div>
        </div>
      </article>`;
  }

  // Quick view modal dialog
  function openQuickView(id) {
    const p = byId(id);
    if (!p) return;
    const modal = $('#quick-view-modal');
    if (!modal) return;
    const on = db.get('wish', []).includes(p.id);
    const sizes = ['XS', 'S', 'M', 'L', 'XL'];
    let selectedSize = 'M';
    let qty = 1;

    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="modal-close-btn" aria-label="Close modal">✕</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;padding:2.5rem">
          <div class="pdp-main-image" style="aspect-ratio:4/5">
            <img src="${p.image || 'images/p1.jpg'}" alt="${esc(p.name)}">
          </div>
          <div>
            <p class="pdp-category-breadcrumb">${p.cat === 'ethnic' ? 'Ethnic Couture' : 'Western Couture'} / ${esc(p.type)}</p>
            <h2 style="font-size:1.8rem;margin-bottom:0.4rem">${esc(p.name)}</h2>
            <div class="pdp-rating-strip">
              <span class="card-rating">${p.rating || '4.9'} / 5</span>
              <span class="muted">(${p.reviews || 48} patron reviews)</span>
            </div>
            <div class="pdp-price-wrap" style="margin-bottom:1rem;padding-bottom:0.8rem">
              <span class="pdp-price">${money(p.price)}</span>
              ${p.old ? `<span class="pdp-old-price">${money(p.old)}</span>` : ''}
            </div>
            <div class="pdp-urgency-badge">Only ${p.stock || 4} pieces in stock</div>
            <p style="font-size:0.95rem;color:var(--esp-light);margin-bottom:1.2rem">${esc(p.desc)}</p>
            
            <div class="size-header">
              <strong>Select Size</strong>
              <button class="btn-size-guide" onclick="openFitFinder()">Size Guide</button>
            </div>
            <div class="sizes" id="qv-sizes" style="margin-bottom:1.2rem">
              ${sizes.map(s => `<button data-qv-size="${s}" aria-pressed="${s === selectedSize}">${s}</button>`).join('')}
            </div>

            <div class="buy-row">
              <button class="btn gold" id="qv-add-cart">Add to Cart</button>
              <button class="btn ghost sm" id="qv-wish" aria-pressed="${on}">${on ? 'Saved to Wishlist' : 'Save to Wishlist'}</button>
            </div>
            
            <div style="margin-top:1.2rem;border-top:1px solid var(--line);padding-top:1rem">
              <a href="product.html?id=${p.id}" style="color:var(--wine);font-weight:600;font-size:0.92rem;text-decoration:underline">View Complete Specifications &amp; Drape Details →</a>
            </div>
          </div>
        </div>
      </div>`;

    modal.style.display = 'grid';

    $('#modal-close-btn').onclick = () => { modal.style.display = 'none'; };
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };

    $$('[data-qv-size]').forEach(b => {
      b.onclick = () => {
        selectedSize = b.dataset.qvSize;
        $$('[data-qv-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
      };
    });

    $('#qv-add-cart').onclick = () => {
      addToCart(p.id, selectedSize, 1);
      toast(`${p.name} (${selectedSize}) added to bag`, 'cart.html', 'View Bag');
      modal.style.display = 'none';
    };

    $('#qv-wish').onclick = e => {
      const v = toggleWish(p.id);
      e.target.textContent = v ? 'Saved to Wishlist' : 'Save to Wishlist';
      e.target.setAttribute('aria-pressed', v);
    };
  }

  // Size recommendation and fit helper
  function openFitFinder() {
    const modal = $('#fit-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px">
        <button class="modal-close" id="fit-close-btn" aria-label="Close modal">✕</button>
        <div class="fit-finder-box">
          <span class="hero-pill" style="display:block;width:max-content;margin:0 auto 0.8rem">Atelier Smart Fit</span>
          <h2>Virtual Size &amp; Drape Finder</h2>
          <p class="subtitle">Enter your measurements to determine your tailored fit across our ethnic cuts and western tailoring.</p>

          <div class="calc-grid">
            <div class="field">
              <label for="fit-bust">Bust (inches): <strong id="bust-val">34</strong>"</label>
              <input id="fit-bust" type="range" min="30" max="44" value="34" step="1">
            </div>
            <div class="field">
              <label for="fit-waist">Waist (inches): <strong id="waist-val">28</strong>"</label>
              <input id="fit-waist" type="range" min="24" max="40" value="28" step="1">
            </div>
          </div>

          <div class="calc-result-box">
            <p class="muted" style="font-size:0.9rem">YOUR RECOMMENDED FIT:</p>
            <div class="calc-size-badge" id="calc-rec-size">SIZE M</div>
            <p id="calc-fit-note" style="font-size:0.9rem;color:var(--esp);margin-top:0.4rem">
              Provides an effortless regal drape through the bust with comfortable ease for ethnic churidars and tailored blazers.
            </p>
          </div>

          <button class="btn block" id="fit-apply-btn" style="margin-top:1.5rem">Apply Size to Selection</button>
        </div>
      </div>`;

    modal.style.display = 'grid';

    const bustIn = $('#fit-bust'), waistIn = $('#fit-waist');
    const bustOut = $('#bust-val'), waistOut = $('#waist-val');
    const sizeOut = $('#calc-rec-size'), noteOut = $('#calc-fit-note');

    const updateFit = () => {
      const b = +bustIn.value, w = +waistIn.value;
      bustOut.textContent = b;
      waistOut.textContent = w;

      let rec = 'M';
      if (b <= 32 && w <= 26) rec = 'XS';
      else if (b <= 34 && w <= 28) rec = 'S';
      else if (b <= 37 && w <= 31) rec = 'M';
      else if (b <= 40 && w <= 34) rec = 'L';
      else rec = 'XL';

      sizeOut.textContent = 'SIZE ' + rec;
      noteOut.textContent = `Tailored for a bust of ${b}" and waist of ${w}". Relaxed ease for all-day comfort.`;
    };

    bustIn.oninput = updateFit;
    waistIn.oninput = updateFit;

    $('#fit-close-btn').onclick = () => { modal.style.display = 'none'; };
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    $('#fit-apply-btn').onclick = () => {
      const sizeText = sizeOut.textContent.replace('SIZE ', '').trim();
      const targetSizeBtn = $(`[data-size="${sizeText}"]`) || $(`[data-qv-size="${sizeText}"]`);
      if (targetSizeBtn) targetSizeBtn.click();
      toast(`Selected Size ${sizeText} from Size Finder`);
      modal.style.display = 'none';
    };
  }

  window.openFitFinder = openFitFinder;

  /* ---------- Global Click Delegate ---------- */
  document.addEventListener('click', e => {
    // Wishlist Toggle
    const h = e.target.closest('[data-wish]');
    if (h) {
      e.preventDefault();
      const on = toggleWish(Number(h.dataset.wish));
      h.classList.toggle('on', on);
      h.setAttribute('aria-pressed', on);
      if (document.body.dataset.page === 'wishlist') pages.wishlist();
      else toast(on ? 'Saved to wishlist' : 'Removed from wishlist', on ? 'wishlist.html' : '', 'View Wishlist');
      return;
    }

    // Quick View
    const qv = e.target.closest('[data-quickview]');
    if (qv) {
      e.preventDefault();
      openQuickView(Number(qv.dataset.quickview));
      return;
    }
  });

  /* ---------- Pages Definitions ---------- */
  const pages = {
    home() {
      // 1. Featured pieces
      const featEl = $('#featured');
      if (featEl) {
        featEl.innerHTML = PRODUCTS.slice(0, 4).map(card).join('');
      }

      // Style & occasion concierge matcher
      const matcherGrid = $('#matcher-grid');
      const matcherChips = $$('#matcher-options .matcher-chip');
      
      const renderMatcher = (mood) => {
        matcherChips.forEach(c => c.classList.toggle('active', c.dataset.mood === mood));
        let matches = PRODUCTS.filter(p => p.col === mood);
        if (!matches.length) matches = PRODUCTS.filter(p => p.cat === 'ethnic').slice(0, 4);
        if (matcherGrid) {
          matcherGrid.innerHTML = matches.map(card).join('');
        }
      };

      matcherChips.forEach(chip => {
        chip.onclick = () => renderMatcher(chip.dataset.mood);
      });

      renderMatcher('wedding');

      // Scroll to matcher from hero
      const jumpBtn = $('#jump-matcher');
      if (jumpBtn) {
        jumpBtn.onclick = () => {
          $('#style-matcher')?.scrollIntoView({ behavior: 'smooth' });
        };
      }
    },

    collections() {
      const colEl = $('#collections');
      if (colEl) {
        colEl.innerHTML = COLLECTIONS.map(c => `
          <a class="col-tile" href="shop.html?col=${c.key}">
            <img src="${c.img}" alt="${c.name}" loading="lazy">
            <div class="col-tile-content">
              <h3>${c.name}</h3>
              <p>${c.text}</p>
            </div>
          </a>
        `).join('');
      }
    },

    shop() {
      const q = new URLSearchParams(location.search);
      const f = {
        cat: q.get('cat') || 'all',
        type: q.get('type') || 'all',
        col: q.get('col') || 'all',
        q: q.get('q') || '',
        max: +q.get('max') || 15000,
        sort: q.get('sort') || 'new'
      };

      const types = [...new Set(PRODUCTS.map(p => p.type))];
      const typeSelect = $('#f-type');
      if (typeSelect) {
        typeSelect.innerHTML = '<option value="all">All Silhouettes</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        typeSelect.value = f.type;
      }

      if ($('#f-search')) $('#f-search').value = f.q;
      if ($('#f-price')) $('#f-price').value = f.max;
      if ($('#f-sort')) $('#f-sort').value = f.sort;

      const draw = () => {
        $$('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === f.cat));
        if ($('#f-price-out')) $('#f-price-out').textContent = 'Up to ' + money(f.max);

        const term = f.q.trim().toLowerCase();
        let list = PRODUCTS.filter(p => 
          (f.cat === 'all' || p.cat === f.cat) &&
          (f.type === 'all' || p.type === f.type) &&
          (f.col === 'all' || p.col === f.col) &&
          p.price <= f.max &&
          (!term || (p.name + p.type + p.fabric + p.desc).toLowerCase().includes(term))
        );

        if (f.sort === 'low') list.sort((a, b) => a.price - b.price);
        if (f.sort === 'high') list.sort((a, b) => b.price - a.price);

        const col = COLLECTIONS.find(c => c.key === f.col);
        if ($('#shop-count')) {
          $('#shop-count').textContent = `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}${col ? ' in ' + col.name : ''}`;
        }
        if ($('#col-clear')) $('#col-clear').hidden = !col;

        const grid = $('#grid');
        if (grid) {
          grid.innerHTML = list.length ? list.map(card).join('') : `
            <div class="empty" style="grid-column:1/-1;text-align:center;padding:4rem 1rem">
              <h3>No matching creations found</h3>
              <p class="muted" style="margin:0.5rem 0 1.5rem">Try broadening your search term or clearing active filters.</p>
              <button class="btn ghost" id="reset">Reset All Filters</button>
            </div>`;
        }

        const params = new URLSearchParams();
        if (f.cat !== 'all') params.set('cat', f.cat);
        if (f.type !== 'all') params.set('type', f.type);
        if (f.col !== 'all') params.set('col', f.col);
        if (f.q) params.set('q', f.q);
        if (f.max < 15000) params.set('max', f.max);
        if (f.sort !== 'new') params.set('sort', f.sort);
        history.replaceState(null, '', params.toString() ? '?' + params : location.pathname);
      };

      $$('[data-cat]').forEach(b => b.onclick = () => { f.cat = b.dataset.cat; draw(); });
      if ($('#f-type')) $('#f-type').onchange = e => { f.type = e.target.value; draw(); };
      if ($('#f-search')) $('#f-search').oninput = e => { f.q = e.target.value; draw(); };
      if ($('#f-price')) $('#f-price').oninput = e => { f.max = +e.target.value; draw(); };
      if ($('#f-sort')) $('#f-sort').onchange = e => { f.sort = e.target.value; draw(); };
      if ($('#col-clear')) $('#col-clear').onclick = () => { f.col = 'all'; draw(); };
      if ($('#reset-top')) $('#reset-top').onclick = () => {
        Object.assign(f, { cat: 'all', type: 'all', col: 'all', q: '', max: 15000, sort: 'new' });
        if ($('#f-type')) $('#f-type').value = 'all';
        if ($('#f-search')) $('#f-search').value = '';
        if ($('#f-price')) $('#f-price').value = 15000;
        if ($('#f-sort')) $('#f-sort').value = 'new';
        draw();
      };

      document.addEventListener('click', e => {
        if (e.target.id === 'reset') {
          Object.assign(f, { cat: 'all', type: 'all', col: 'all', q: '', max: 15000, sort: 'new' });
          if ($('#f-type')) $('#f-type').value = 'all';
          if ($('#f-search')) $('#f-search').value = '';
          if ($('#f-price')) $('#f-price').value = 15000;
          if ($('#f-sort')) $('#f-sort').value = 'new';
          draw();
        }
      });

      draw();
    },

    product() {
      const p = byId(new URLSearchParams(location.search).get('id'));
      const root = $('#product');
      if (!p) {
        if (root) root.innerHTML = '<div class="empty wrap" style="text-align:center;padding:5rem 1rem"><h2>Creation Not Found</h2><p class="muted" style="margin:1rem 0 2rem">The requested piece is no longer available in our active catalogue.</p><a class="btn" href="shop.html">Return to Shop</a></div>';
        return;
      }

      document.title = `${p.name} — SATINOSTITCH Haute Couture`;
      const sizes = ['XS', 'S', 'M', 'L', 'XL'];
      let size = 'M', qty = 1;
      const on = () => db.get('wish', []).includes(p.id);

      root.innerHTML = `
        <div class="wrap pdp">
          <div class="pdp-gallery">
            <div class="pdp-main-image" id="zoom-container">
              <img id="main-product-img" src="${p.image || 'images/p1.jpg'}" alt="${esc(p.name)}">
              <div class="pdp-zoom-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Hover to Zoom Fabric
              </div>
            </div>
          </div>

          <div>
            <p class="pdp-category-breadcrumb">${p.cat === 'ethnic' ? 'Ethnic Heritage' : 'Western Sartorial'} / ${esc(p.type)}</p>
            <h1>${esc(p.name)}</h1>
            
            <div class="pdp-rating-strip">
              <span class="card-rating">${p.rating || '4.9'} / 5</span>
              <span class="muted">(${p.reviews || 64} Verified Reviews)</span>
              <span>·</span>
              <span style="color:var(--success);font-weight:600">In Stock</span>
            </div>

            <div class="pdp-price-wrap">
              <span class="pdp-price">${money(p.price)}</span>
              ${p.old ? `<span class="pdp-old-price">${money(p.old)}</span>` : ''}
              <span class="card-discount">Inclusive of all taxes</span>
            </div>

            <div class="pdp-urgency-badge">Limited Atelier Edition: Only ${p.stock || 4} units crafted</div>

            <p style="font-size:1.05rem;line-height:1.7;color:var(--esp-light);margin-bottom:1.8rem">${esc(p.desc)}</p>

            <div class="size-header">
              <strong>Select Size</strong>
              <button class="btn-size-guide" onclick="openFitFinder()">Virtual Size Finder &amp; Drape Guide</button>
            </div>
            <div class="sizes" role="group" aria-label="Size">
              ${sizes.map(s => `<button data-size="${s}" aria-pressed="${s === size}">${s}</button>`).join('')}
            </div>

            <div class="buy-row">
              <div class="qty-control">
                <button id="minus" aria-label="Fewer">−</button>
                <span id="qty">1</span>
                <button id="plus" aria-label="More">+</button>
              </div>
              <button class="btn gold" id="add">Add to Shopping Bag</button>
              <button class="btn ghost sm" id="wish" aria-pressed="${on()}">${on() ? 'Saved to Wishlist' : 'Save to Wishlist'}</button>
            </div>

            <details open>
              <summary>Artisanal Fabric &amp; Weave Specifications</summary>
              <p><strong>Primary Textile:</strong> ${esc(p.fabric)}.</p>
              <p style="margin-top:0.4rem">Each meter is hand-inspected in our atelier. Dry clean only for pure Banarasi zari, mulmul block print and heavy silks to preserve lustrous sheen and tensile strength.</p>
            </details>

            <details>
              <summary>Complimentary Shipping &amp; 7-Day Exchange</summary>
              <p>Free white-glove express courier shipping across India on orders exceeding ${money(3000)}. Complimentary reverse pickup for size exchange within 7 days of delivery, provided original tags remain intact.</p>
            </details>

            <details>
              <summary>Stylist Pairings &amp; Notes</summary>
              <p>${p.cat === 'ethnic' ? 'Pair with antique polki jewelry and embellished juttis for celebratory occasions.' : 'Style with sharp structured suiting trousers or layered beneath a tailored blazer for boardroom poise.'}</p>
            </details>
          </div>
        </div>

        <section class="wrap" style="padding-top:2rem">
          <div class="section-head">
            <h2>Complete The Ensemble</h2>
          </div>
          <div class="grid" id="related"></div>
        </section>`;

      // Related products
      const related = PRODUCTS.filter(x => x.id !== p.id && (x.type === p.type || x.cat === p.cat)).slice(0, 4);
      $('#related').innerHTML = related.map(card).join('');

      // Size Selection
      $$('[data-size]').forEach(b => {
        b.onclick = () => {
          size = b.dataset.size;
          $$('[data-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
        };
      });

      // Quantity controls
      $('#plus').onclick = () => { qty = Math.min(qty + 1, 9); $('#qty').textContent = qty; };
      $('#minus').onclick = () => { qty = Math.max(qty - 1, 1); $('#qty').textContent = qty; };

      // Add to bag
      $('#add').onclick = () => {
        if (!size) { toast('Please select your preferred size first'); return; }
        addToCart(p.id, size, qty);
        toast(`${p.name} (${size}) added to your shopping bag`, 'cart.html', 'View Bag');
      };

      // Wishlist toggle
      $('#wish').onclick = e => {
        const v = toggleWish(p.id);
        e.target.textContent = v ? 'Saved to Wishlist' : 'Save to Wishlist';
        e.target.setAttribute('aria-pressed', v);
      };
    },

    wishlist() {
      const items = db.get('wish', []).map(byId).filter(Boolean);
      const root = $('#wish-grid');
      if (root) {
        root.innerHTML = items.length ? items.map(card).join('') : `
          <div class="empty" style="grid-column:1/-1;text-align:center;padding:5rem 1rem">
            <h2>Your Wishlist is Empty</h2>
            <p class="muted" style="margin:1rem 0 2rem">Curate your dream trousseau by tapping the heart icon on any piece.</p>
            <a class="btn gold" href="shop.html">Explore The Catalogue</a>
          </div>`;
      }
    },

    cart() {
      const ls = lines(), root = $('#cart');
      if (!root) return;

      if (!ls.length) {
        root.innerHTML = `
          <div class="empty wrap" style="grid-column:1/-1;text-align:center;padding:5rem 1rem">
            <h2>Your Shopping Bag is Empty</h2>
            <p class="muted" style="margin:1rem 0 2rem">Explore our new festive collection and timeless tailoring pieces.</p>
            <a class="btn gold" href="shop.html">Explore Creations</a>
          </div>`;
        return;
      }

      const t = totals(ls);
      root.innerHTML = `
        <div class="two-col-layout wrap">
          <div>
            <h1 style="font-size:2.2rem;margin-bottom:1.5rem">Your Shopping Bag (${ls.reduce((s, i) => s + i.qty, 0)})</h1>
            ${ls.map((l, i) => `
              <div class="cart-item">
                <a class="cart-item-thumb" href="product.html?id=${l.p.id}">
                  <img src="${l.p.image || 'images/p1.jpg'}" alt="${esc(l.p.name)}">
                </a>
                <div>
                  <h3 style="font-size:1.15rem"><a href="product.html?id=${l.p.id}">${esc(l.p.name)}</a></h3>
                  <p class="muted" style="font-size:0.9rem;margin:0.2rem 0 0.8rem">Size: <strong>${l.size}</strong> · ${money(l.p.price)}</p>
                  <div class="qty-control" style="height:2.4rem">
                    <button data-q="${i}:-1" aria-label="Fewer">−</button>
                    <span style="min-width:2rem">${l.qty}</span>
                    <button data-q="${i}:1" aria-label="More">+</button>
                  </div>
                  <div style="margin-top:0.6rem">
                    <button class="link" data-rm="${i}" style="color:var(--wine);font-size:0.85rem;text-decoration:underline;background:none;border:none;cursor:pointer">Remove item</button>
                  </div>
                </div>
                <strong style="font-size:1.15rem;color:var(--wine)">${money(l.p.price * l.qty)}</strong>
              </div>
            `).join('')}
          </div>

          <aside class="summary-card">
            <h2 style="font-size:1.5rem;margin-bottom:1.2rem">Order Summary</h2>
            ${summary(ls, t)}
            
            <form class="promo-form" id="promo">
              <input id="code" placeholder="Enter coupon code" value="${esc(db.get('promo', ''))}" aria-label="Coupon code">
              <button class="btn sm" type="submit">Apply</button>
            </form>

            <a class="btn gold block" href="checkout.html" style="margin-top:1.2rem">Proceed to Secure Checkout</a>
            <p class="muted" style="font-size:0.8rem;text-align:center;margin-top:1rem">Encrypted 256-bit SSL Checkout · Silk Mark Verified</p>
          </aside>
        </div>`;

      $$('[data-q]').forEach(b => b.onclick = () => {
        const [i, d] = b.dataset.q.split(':').map(Number);
        const c = db.get('cart', []);
        c[i].qty = Math.min(Math.max(c[i].qty + d, 1), 9);
        db.set('cart', c);
        pages.cart();
      });

      $$('[data-rm]').forEach(b => b.onclick = () => {
        db.set('cart', db.get('cart', []).filter((_, i) => i !== +b.dataset.rm));
        pages.cart();
      });

      $('#promo').onsubmit = e => {
        e.preventDefault();
        const v = $('#code').value.trim().toUpperCase();
        if (v && v !== 'HERITAGE10') {
          toast('That code is not valid. Use HERITAGE10 for 10% off.');
          return;
        }
        db.set('promo', v);
        toast(v ? 'Promo code HERITAGE10 applied!' : 'Promo removed');
        pages.cart();
      };
    },

    checkout() {
      const ls = lines();
      const checkoutEl = $('#checkout');
      if (!checkoutEl) return;

      if (!ls.length) {
        checkoutEl.innerHTML = '<div class="empty wrap" style="text-align:center;padding:5rem 1rem"><h2>Your shopping bag is empty</h2><p class="muted" style="margin:1rem 0 2rem">Add pieces before proceeding to checkout.</p><a class="btn gold" href="shop.html">Browse Shop</a></div>';
        return;
      }

      if ($('#order-summary')) {
        $('#order-summary').innerHTML = summary(ls, totals(ls));
      }

      const user = db.get('user', null);
      if (user) {
        if ($('[name=name]')) $('[name=name]').value = user.name;
        if ($('[name=email]')) $('[name=email]').value = user.email;
      }

      const orderForm = $('#order-form');
      if (orderForm) {
        orderForm.onsubmit = async e => {
          e.preventDefault();
          const customer = Object.fromEntries(new FormData(e.target));
          try {
            const res = await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customer, items: db.get('cart', []) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            db.set('cart', []);
            db.set('promo', '');
            checkoutEl.innerHTML = `
              <div class="wrap" style="max-width:580px;margin:4rem auto;text-align:center;background:#fff;padding:3.5rem;border-radius:var(--radius-lg);border:1px solid var(--line);box-shadow:var(--shadow-md)">
                <div style="width:4rem;height:4rem;background:var(--ivory-soft);color:var(--wine);border-radius:50%;display:grid;place-items:center;margin:0 auto 1.5rem">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h1 style="font-size:2.4rem">Thank you, ${esc(customer.name.split(' ')[0])}.</h1>
                <p style="margin:1.2rem 0 1.8rem;color:var(--esp-light);font-size:1.1rem">
                  Your bespoke order <strong>${data.id}</strong> is confirmed. A receipt and tracking dispatch schedule for <strong>${money(data.total)}</strong> has been sent to <strong>${esc(customer.email)}</strong>.
                </p>
                <div style="background:var(--ivory-soft);padding:1.2rem;border-radius:var(--radius);margin-bottom:2rem;font-size:0.9rem">
                  Estimated hand-dispatch: <strong>Within 24 to 48 hours</strong> with signature packaging.
                </div>
                <a class="btn gold" href="shop.html">Continue Exploring Creations</a>
              </div>`;
          } catch (err) {
            toast(err.message || 'Could not place order. Please try again.');
          }
        };
      }
    },

    login() {
      const root = $('#auth');
      if (!root) return;

      const render = (mode = 'in') => {
        root.innerHTML = `
          <div class="wrap" style="max-width:440px;margin:3.5rem auto;background:#fff;padding:2.5rem;border-radius:var(--radius);border:1px solid var(--line);box-shadow:var(--shadow-md)">
            <div class="tabs" style="display:flex;margin-bottom:1.5rem;border-bottom:1px solid var(--line)">
              <button style="flex:1;padding:0.75rem;background:none;border:none;border-bottom:2px solid ${mode === 'in' ? 'var(--gold)' : 'transparent'};font:600 1rem var(--sans);cursor:pointer;color:${mode === 'in' ? 'var(--wine)' : 'var(--muted)'}" data-m="in">Sign In</button>
              <button style="flex:1;padding:0.75rem;background:none;border:none;border-bottom:2px solid ${mode === 'up' ? 'var(--gold)' : 'transparent'};font:600 1rem var(--sans);cursor:pointer;color:${mode === 'up' ? 'var(--wine)' : 'var(--muted)'}" data-m="up">Create Account</button>
            </div>
            <form id="auth-form" style="display:grid;gap:1.2rem">
              ${mode === 'up' ? '<div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Full Name</label><input name="name" required placeholder="Meera Kapoor"></div>' : ''}
              <div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Email Address</label><input name="email" type="email" required placeholder="meera@example.com"></div>
              <div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Password</label><input name="pass" type="password" required placeholder="••••••••"></div>
              <button class="btn gold block" type="submit" style="margin-top:0.5rem">${mode === 'in' ? 'Sign In' : 'Join VIP Atelier'}</button>
            </form>
          </div>`;

        $$('[data-m]').forEach(b => b.onclick = () => render(b.dataset.m));

        $('#auth-form').onsubmit = e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target));
          db.set('user', { name: d.name || d.email.split('@')[0], email: d.email });
          toast(`Welcome back, ${d.name || d.email.split('@')[0]}!`);
          setTimeout(() => { location.href = 'shop.html'; }, 800);
        };
      };

      render();
    },

    contact() {
      const contactForm = $('#contact-form');
      if (contactForm) {
        contactForm.onsubmit = async e => {
          e.preventDefault();
          try {
            const res = await fetch('/api/contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
            });
            if (!res.ok) throw new Error((await res.json()).error);
            e.target.reset();
            toast('Message received by our stylist atelier. We reply within 24 hours.');
          } catch (err) {
            toast(err.message || 'Message could not be sent. Please retry.');
          }
        };
      }
    }
  };

  /* ---------- Initialization & Boot ---------- */
  mountChrome();
  const page = document.body.dataset.page;
  const needsData = ['home', 'collections', 'shop', 'product', 'wishlist', 'cart', 'checkout'].includes(page);

  (needsData
    ? fetch('/api/products').then(r => r.json()).then(d => { PRODUCTS = d; })
    : Promise.resolve()
  )
    .then(() => pages[page]?.())
    .catch(() => {
      const m = $('main');
      if (m) m.innerHTML = '<div class="empty wrap" style="text-align:center;padding:5rem 1rem"><h2>Catalogue Temporarily Unavailable</h2><p class="muted">Please ensure the backend server is running on port 3000.</p></div>';
    });
})();
