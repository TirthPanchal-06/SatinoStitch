// SATINOSTITCH storefront master application
// Modules 1-5 Complete Customer & Atelier Architecture
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

  /* ---------- Local Storage & Session State ---------- */
  let activeWishlist = null; // in-memory cache of product IDs for active user

  const db = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem('ss_' + k)) ?? d; } catch { return d; } },
    set: (k, v) => { localStorage.setItem('ss_' + k, JSON.stringify(v)); updateCounts(); },
    token: () => localStorage.getItem('ss_token') || '',
    setToken: (t) => localStorage.setItem('ss_token', t),
    user: () => { try { return JSON.parse(localStorage.getItem('ss_user')); } catch { return null; } },

    // User-scoped Wishlist methods (only the signed-in user who saved items can see them)
    getWishlist: () => {
      const u = db.user();
      if (!u || !db.token()) return [];
      if (activeWishlist !== null) return activeWishlist;
      try {
        const stored = JSON.parse(localStorage.getItem(`ss_wish_${u.id}`));
        if (Array.isArray(stored)) {
          activeWishlist = stored.map(Number);
          return activeWishlist;
        }
      } catch {}
      activeWishlist = [];
      return activeWishlist;
    },
    setWishlist: (ids) => {
      const u = db.user();
      if (!u || !db.token()) {
        activeWishlist = [];
        return;
      }
      activeWishlist = Array.isArray(ids) ? ids.map(Number) : [];
      localStorage.setItem(`ss_wish_${u.id}`, JSON.stringify(activeWishlist));
      updateCounts();
    },
    isWishlisted: (id) => {
      return db.getWishlist().includes(Number(id));
    },
    clearGuestWishlist: () => {
      localStorage.removeItem('ss_wish');
      activeWishlist = [];
      updateCounts();
    },
    clearAuth: () => {
      localStorage.removeItem('ss_token');
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_wish');
      activeWishlist = [];
      updateCounts();
      updateWishlistUI();
    }
  };

  async function syncUserWishlist() {
    const u = db.user();
    if (!u || !db.token()) {
      activeWishlist = [];
      updateCounts();
      updateWishlistUI();
      return [];
    }
    try {
      const res = await fetchAuth('/api/user/wishlist');
      if (res.ok) {
        const list = await res.json();
        const ids = Array.isArray(list) ? list.map(p => Number(p.id)) : [];
        db.setWishlist(ids);
        updateWishlistUI();
        return ids;
      }
    } catch (err) {
      console.warn('Could not sync wishlist with server:', err);
    }
    return db.getWishlist();
  }

  function updateWishlistUI() {
    const list = db.getWishlist();
    $$('[data-wish]').forEach(btn => {
      const pid = Number(btn.dataset.wish);
      const on = list.includes(pid);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
    });
    const pdpWish = $('#wish');
    if (pdpWish) {
      const urlParams = new URLSearchParams(location.search);
      const pid = Number(urlParams.get('id') || 1);
      const on = list.includes(pid);
      pdpWish.textContent = on ? 'Saved to Wishlist' : 'Save to Wishlist';
      pdpWish.setAttribute('aria-pressed', on);
    }
    const qvWish = $('#qv-wish');
    if (qvWish && window._qvProductId) {
      const on = list.includes(Number(window._qvProductId));
      qvWish.textContent = on ? 'Saved to Wishlist' : 'Save to Wishlist';
      qvWish.setAttribute('aria-pressed', on);
    }
  }

  async function fetchAuth(url, opts = {}) {
    opts.headers = opts.headers || {};
    const token = db.token();
    if (token) {
      opts.headers['Authorization'] = `Bearer ${token}`;
    }
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts);
  }

  let PRODUCTS = [];
  const byId = id => PRODUCTS.find(p => p.id === Number(id));

  const COLLECTIONS = [
    { key: 'wedding', name: 'Wedding Edit', text: 'Royal Banarasi silk sarees, bridal lehengas and gold zari sets.', img: 'images/wedding-edit.jpg' },
    { key: 'festive', name: 'Festive Wear', text: 'Heritage bandhani, lustrous satin and antique gold craft.', img: 'images/p4.jpg' },
    { key: 'everyday', name: 'Everyday Cotton', text: 'Breathable Mulmul hand-block prints and pure Chanderi kurtas.', img: 'images/p5.jpg' },
    { key: 'work', name: 'Work Wardrobe', text: 'Sartorial linen check blazers and pleated crepe tailoring.', img: 'images/p9.jpg' }
  ];

  /* ---------- Shared Chrome (Header & Footer) ---------- */
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

    // Site Header (Excluded from Admin Panel)
    const isAdminMode = document.body.dataset.page === 'admin' || 
                        document.body.classList.contains('admin-dashboard-theme') || 
                        (user && user.role === 'admin' && (file === 'admin.html' || file === 'login.html'));
    const headerEl = $('#site-header');
    if (headerEl) {
      if (isAdminMode) {
        headerEl.innerHTML = '';
        headerEl.style.display = 'none';
      } else {
        headerEl.style.display = '';
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
              <span>${user ? `<a href="${user.role === 'admin' ? 'admin.html' : 'login.html'}" style="color:var(--gold-light);font-weight:500">${user.role === 'admin' ? 'Admin Dashboard' : `My Account (${esc(user.name.split(' ')[0])})`}</a>` : `<a href="login.html" style="color:var(--gold-light)">Sign In</a>`}</span>
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
              <a class="tool-link" href="login.html" aria-label="Customer Account">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </a>
              <button class="menu-btn" aria-label="Toggle navigation" aria-expanded="false">☰</button>
            </div>
          </div>
        </header>`;
      }
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
              <p style="margin-top:0.8rem">Woven for weddings, cut for every day. Curating authentic Indian heritage textiles alongside contemporary sartorial tailoring with uncompromising precision.</p>
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
              <a href="shop.html?col=wedding">Bridal Trousseau</a>
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
              <form class="newsletter-form" id="newsletter-form">
                <input type="email" id="news-email" required placeholder="Enter your email" aria-label="Email Address">
                <button class="btn gold sm" type="submit">Join</button>
              </form>
            </div>
          </div>
          <div class="wrap copy-row">
            <span>© 2026 SATINOSTITCH LUXURY BOUTIQUE. All rights reserved.</span>
            <a href="/api/health" target="_blank" id="system-health-badge" class="health-badge" title="Verifying server and database health...">
              <span class="health-dot health-checking"></span> Connecting...
            </a>
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
        toast('Promo code HERITAGE10 copied & applied!');
        setTimeout(() => { copyPromo.textContent = 'HERITAGE10 (Tap to Copy)'; }, 2500);
      });
    }

    // Mobile Navigation Toggle
    const menuBtn = $('.menu-btn');
    if (menuBtn) {
      menuBtn.onclick = () => {
        const nav = $('#nav');
        if (!nav) return;
        const expanded = nav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', expanded);
        menuBtn.textContent = expanded ? '✕' : '☰';
      };
    }

    // Newsletter Submission
    const newsForm = $('#newsletter-form');
    if (newsForm) {
      newsForm.onsubmit = async e => {
        e.preventDefault();
        const email = $('#news-email')?.value;
        try {
          const res = await fetch('/api/newsletter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const d = await res.json();
          newsForm.reset();
          toast(d.message || 'Welcome to the SATINOSTITCH VIP Atelier.');
        } catch {
          newsForm.reset();
          toast('Welcome to the SATINOSTITCH VIP Atelier.');
        }
      };
    }

    updateCounts();
  }

  function updateCounts() {
    const wish = db.getWishlist().length;
    const cart = db.get('cart', []).reduce((s, i) => s + (i.qty || 1), 0);
    $$('[data-count=wish]').forEach(b => b.textContent = wish);
    $$('[data-count=cart]').forEach(b => b.textContent = cart);
  }

  function renderAllPrices() {
    if (typeof pages[document.body.dataset.page] === 'function') {
      pages[document.body.dataset.page]();
    }
  }

  /* ---------- Toast Notification ---------- */
  function toast(msg, linkHref = null, linkText = null) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.innerHTML = `
      <span>${esc(msg)}</span>
      ${linkHref && linkText ? `<a href="${linkHref}">${esc(linkText)}</a>` : ''}
    `;
    t.classList.add('show');
    clearTimeout(t.timer);
    t.timer = setTimeout(() => t.classList.remove('show'), 3800);
  }
  window.toast = toast;

  /* ---------- Cart and Wishlist Operations ---------- */
  function addToCart(id, size = 'M', qty = 1, color = null) {
    const cart = db.get('cart', []);
    const p = byId(id);
    const selectedColor = color || (p?.colors?.[0]?.name) || 'Selected Shade';
    const hit = cart.find(i => i.id === id && i.size === size && i.color === selectedColor);
    hit ? hit.qty += qty : cart.push({ id, size, qty, color: selectedColor });
    db.set('cart', cart);

    // Sync to PostgreSQL cart table when authenticated or record guest cart activity
    if (db.token()) {
      fetchAuth('/api/cart', {
        method: 'POST',
        body: { productId: id, size, color: selectedColor, quantity: qty }
      }).catch(() => {});
    } else {
      fetch('/api/activity/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, size, color: selectedColor, quantity: qty })
      }).catch(() => {});
    }
  }

  function toggleWish(id) {
    const u = db.user();
    if (!u || !db.token()) {
      toast('Please sign in to save creations to your personal trousseau wishlist.', 'login.html', 'Sign In');
      return null;
    }
    const numId = Number(id);
    const list = db.getWishlist();
    const on = !list.includes(numId);
    const updated = on ? [...list, numId] : list.filter(x => x !== numId);
    db.setWishlist(updated);
    updateWishlistUI();

    // Persist to PostgreSQL database for this authenticated user
    fetchAuth(on ? '/api/user/wishlist' : `/api/user/wishlist/${numId}`, {
      method: on ? 'POST' : 'DELETE',
      body: on ? { productId: numId } : undefined
    }).catch(err => {
      console.error('Wishlist sync error:', err);
    });

    return on;
  }

  const lines = () => db.get('cart', []).map(i => ({ ...i, p: byId(i.id) })).filter(l => l.p);

  function totals(ls) {
    const sub = ls.reduce((s, l) => s + l.p.price * l.qty, 0);
    const promo = (db.get('promo', '') || '').toUpperCase();
    let disc = 0;
    if (promo === 'HERITAGE10') disc = Math.round(sub * 0.1);
    else if (promo === 'ROYAL15' && sub >= 5000) disc = Math.round(sub * 0.15);
    else if (promo === 'ATELIER20' && sub >= 10000) disc = Math.round(sub * 0.2);

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
          <span>${esc(l.p.name)} <span class="muted">(${l.size}${l.color ? ` · ${l.color}` : ''})</span> × ${l.qty}</span>
          <span style="font-weight:500">${money(l.p.price * l.qty)}</span>
        </div>
      `).join('')}
      
      <div class="row" style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px dashed var(--line)">
        <span>Subtotal</span>
        <span>${money(t.sub)}</span>
      </div>
      ${t.disc ? `
        <div class="row" style="color:var(--success);font-weight:500">
          <span>Promo Applied (${db.get('promo', '')})</span>
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
    const on = db.isWishlisted(p.id);
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
            <span class="card-rating">★ ${p.rating || '4.9'} <span class="muted" style="font-size:0.75rem">(${p.reviews || 42})</span></span>
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
    window._qvProductId = p.id;

    // Track product view in analytics
    fetch(`/api/products/${p.id}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(db.token() ? { 'Authorization': `Bearer ${db.token()}` } : {})
      }
    }).catch(() => {});

    const modal = $('#quick-view-modal');
    if (!modal) return;
    const on = db.isWishlisted(p.id);
    const sizes = p.sizes || ['XS', 'S', 'M', 'L', 'XL'];
    const colors = p.colors || [{ name: 'Primary Shade', hex: p.c1 || '#5B1835' }];
    let selectedSize = sizes[0] || 'M';
    let selectedColor = colors[0]?.name || 'Selected Shade';

    modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close" id="modal-close-btn" aria-label="Close modal">✕</button>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2.5rem;padding:2.5rem">
          <div class="pdp-main-image zoom-lens-container" style="aspect-ratio:4/5">
            <img src="${p.image || 'images/p1.jpg'}" alt="${esc(p.name)}">
          </div>
          <div>
            <p class="pdp-category-breadcrumb">${p.cat === 'ethnic' ? 'Ethnic Couture' : 'Western Couture'} / ${esc(p.type)}</p>
            <h2 style="font-size:1.8rem;margin-bottom:0.4rem">${esc(p.name)}</h2>
            <div class="pdp-rating-strip">
              <span class="card-rating">★ ${p.rating || '4.9'} / 5</span>
              <span class="muted">(${p.reviews || 48} verified reviews)</span>
              <span>·</span>
              <span style="color:${(p.stock || 0) > 0 ? 'var(--success)' : '#dc2626'};font-weight:600">
                ${(p.stock || 0) > 0 ? `In Stock (${p.stock} units)` : 'Sold Out'}
              </span>
            </div>
            <div class="pdp-price-wrap" style="margin-bottom:1rem;padding-bottom:0.8rem">
              <span class="pdp-price">${money(p.price)}</span>
              ${p.old ? `<span class="pdp-old-price">${money(p.old)}</span>` : ''}
            </div>
            
            <p style="font-size:0.95rem;color:var(--esp-light);margin-bottom:1.2rem">${esc(p.desc)}</p>

            <div class="size-header">
              <strong>Select Colour</strong>
            </div>
            <div class="color-swatches" id="qv-colors">
              ${colors.map((c, i) => `
                <button class="color-swatch-btn ${i === 0 ? 'active' : ''}" data-qv-color="${esc(c.name)}">
                  <span class="color-dot" style="background:${c.hex}"></span> ${esc(c.name)}
                </button>
              `).join('')}
            </div>
            
            <div class="size-header">
              <strong>Select Size</strong>
              <button class="btn-size-guide" onclick="openFitFinder()">Size Guide</button>
            </div>
            <div class="sizes" id="qv-sizes" style="margin-bottom:1.2rem">
              ${sizes.map(s => `<button data-qv-size="${s}" aria-pressed="${s === selectedSize}">${s}</button>`).join('')}
            </div>

            <div class="buy-row">
              <button class="btn gold" id="qv-add-cart" ${(p.stock || 0) <= 0 ? 'disabled' : ''}>
                ${(p.stock || 0) > 0 ? 'Add to Shopping Bag' : 'Sold Out'}
              </button>
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

    $$('[data-qv-color]').forEach(b => {
      b.onclick = () => {
        selectedColor = b.dataset.qvColor;
        $$('[data-qv-color]').forEach(x => x.classList.toggle('active', x === b));
      };
    });

    $$('[data-qv-size]').forEach(b => {
      b.onclick = () => {
        selectedSize = b.dataset.qvSize;
        $$('[data-qv-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
      };
    });

    $('#qv-add-cart').onclick = () => {
      addToCart(p.id, selectedSize, 1, selectedColor);
      toast(`${p.name} (${selectedSize} · ${selectedColor}) added to bag`, 'cart.html', 'View Bag');
      modal.style.display = 'none';
    };

    $('#qv-wish').onclick = e => {
      const v = toggleWish(p.id);
      if (v === null) return;
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
      if (on === null) return;
      h.classList.toggle('on', on);
      h.setAttribute('aria-pressed', on);
      const svg = h.querySelector('svg');
      if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
      if (document.body.dataset.page === 'wishlist') pages.wishlist();
      else if (document.body.dataset.page === 'login') {
        const activeTab = document.querySelector('.account-tab-btn.active')?.dataset?.tab;
        if (activeTab === 'wishlist') {
          const tabBtn = document.querySelector('.account-tab-btn[data-tab="wishlist"]');
          if (tabBtn) tabBtn.click();
        }
      }
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

  /* ==========================================================================
     Pages Definitions (Modules 1 - 5)
     ========================================================================== */
  const pages = {
    /* ---------- Module 1: Home ---------- */
    async home() {
      // 1. Featured pieces
      const featEl = $('#featured');
      if (featEl) {
        featEl.innerHTML = PRODUCTS.slice(0, 4).map(card).join('');
      }

      // 2. Style & occasion concierge matcher
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

    /* ---------- Module 2: Collections ---------- */
    async collections() {
      const colEl = $('#collections');
      if (!colEl) return;

      try {
        const res = await fetch('/api/collections');
        const list = res.ok ? await res.json() : COLLECTIONS;
        colEl.innerHTML = list.map(c => `
          <a class="col-tile" href="shop.html?col=${c.key}">
            <img src="${c.img}" alt="${esc(c.name)}" loading="lazy">
            <div class="col-tile-content">
              <span class="hero-pill" style="font-size:0.75rem;margin-bottom:0.4rem;display:inline-block">${c.tagline || 'Curated Edit'} · ${c.count || 3} Creations</span>
              <h3>${esc(c.name)}</h3>
              <p>${esc(c.text)}</p>
            </div>
          </a>
        `).join('');
      } catch {
        colEl.innerHTML = COLLECTIONS.map(c => `
          <a class="col-tile" href="shop.html?col=${c.key}">
            <img src="${c.img}" alt="${esc(c.name)}" loading="lazy">
            <div class="col-tile-content">
              <h3>${esc(c.name)}</h3>
              <p>${esc(c.text)}</p>
            </div>
          </a>
        `).join('');
      }
    },

    /* ---------- Module 2: Product Catalogue (Shop) ---------- */
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

      const types = [...new Set(PRODUCTS.map(p => p.type))].filter(Boolean);
      const typeSelect = $('#f-type');
      if (typeSelect) {
        typeSelect.innerHTML = '<option value="all">All Silhouettes</option>' + types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        typeSelect.value = f.type;
      }

      if ($('#f-search')) $('#f-search').value = f.q;
      if ($('#f-price')) $('#f-price').value = f.max;
      if ($('#f-sort')) $('#f-sort').value = f.sort;

      let debounceTimer = null;

      const renderGrid = (list) => {
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
      };

      const fetchFromApi = async () => {
        const params = new URLSearchParams();
        if (f.cat !== 'all') params.set('cat', f.cat);
        if (f.type !== 'all') params.set('type', f.type);
        if (f.col !== 'all') params.set('col', f.col);
        if (f.q) params.set('q', f.q);
        if (f.max < 15000) params.set('max', f.max);
        if (f.sort !== 'new') params.set('sort', f.sort);

        history.replaceState(null, '', params.toString() ? '?' + params : location.pathname);

        try {
          const res = await fetch('/api/products?' + params.toString());
          if (!res.ok) throw new Error('API response was not ok');
          const list = await res.json();
          list.forEach(item => {
            const idx = PRODUCTS.findIndex(p => p.id === item.id);
            if (idx >= 0) PRODUCTS[idx] = item;
            else PRODUCTS.push(item);
          });
          renderGrid(list);
        } catch (err) {
          console.warn('[SATINOSTITCH] API fetch fallback to cache:', err.message);
          const term = f.q.trim().toLowerCase();
          let list = PRODUCTS.filter(p => 
            (f.cat === 'all' || p.cat === f.cat) &&
            (f.type === 'all' || p.type === f.type) &&
            (f.col === 'all' || p.col === f.col) &&
            p.price <= f.max &&
            (!term || (p.name + p.type + p.fabric + (p.desc || '')).toLowerCase().includes(term))
          );
          if (f.sort === 'low') list.sort((a, b) => a.price - b.price);
          if (f.sort === 'high') list.sort((a, b) => b.price - a.price);
          if (f.sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
          renderGrid(list);
        }
      };

      const draw = (immediate = true) => {
        $$('[data-cat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === f.cat));
        if ($('#f-price-out')) $('#f-price-out').textContent = 'Up to ' + money(f.max);

        clearTimeout(debounceTimer);
        if (immediate) {
          fetchFromApi();
        } else {
          debounceTimer = setTimeout(fetchFromApi, 250);
        }
      };

      $$('[data-cat]').forEach(b => b.onclick = () => { f.cat = b.dataset.cat; draw(true); });
      if ($('#f-type')) $('#f-type').onchange = e => { f.type = e.target.value; draw(true); };
      if ($('#f-search')) $('#f-search').oninput = e => { f.q = e.target.value; draw(false); };
      if ($('#f-price')) $('#f-price').oninput = e => { f.max = +e.target.value; draw(false); };
      if ($('#f-sort')) $('#f-sort').onchange = e => { f.sort = e.target.value; draw(true); };
      if ($('#col-clear')) $('#col-clear').onclick = () => { f.col = 'all'; draw(true); };

      const resetFilters = () => {
        Object.assign(f, { cat: 'all', type: 'all', col: 'all', q: '', max: 15000, sort: 'new' });
        if ($('#f-type')) $('#f-type').value = 'all';
        if ($('#f-search')) $('#f-search').value = '';
        if ($('#f-price')) $('#f-price').value = 15000;
        if ($('#f-sort')) $('#f-sort').value = 'new';
        draw(true);
      };

      if ($('#reset-top')) $('#reset-top').onclick = resetFilters;
      document.addEventListener('click', e => {
        if (e.target.id === 'reset') resetFilters();
      });

      draw(true);
    },

    /* ---------- Module 3: Product Details (PDP) ---------- */
    async product() {
      const id = new URLSearchParams(location.search).get('id');
      const root = $('#product');
      if (!id || !root) return;

      let p = byId(id);
      try {
        const headers = db.token() ? { 'Authorization': `Bearer ${db.token()}` } : {};
        const res = await fetch(`/api/products/${id}`, { headers });
        if (res.ok) {
          p = await res.json();
          const idx = PRODUCTS.findIndex(x => x.id === p.id);
          if (idx >= 0) PRODUCTS[idx] = p;
          else PRODUCTS.push(p);
        }
      } catch {}

      if (!p) {
        root.innerHTML = '<div class="empty wrap" style="text-align:center;padding:5rem 1rem"><h2>Creation Not Found</h2><p class="muted" style="margin:1rem 0 2rem">The requested piece is no longer available in our active catalogue.</p><a class="btn" href="shop.html">Return to Shop</a></div>';
        return;
      }

      document.title = `${p.name} — SATINOSTITCH Haute Couture`;
      const sizes = p.sizes || ['XS', 'S', 'M', 'L', 'XL'];
      const colors = p.colors || [
        { name: 'Primary Shade', hex: p.c1 || '#5B1835' },
        { name: 'Accent Shade', hex: p.c2 || '#C6A15B' }
      ];
      const images = (p.images && p.images.length) ? p.images : [p.image];
      let selectedImage = images[0];
      let size = sizes[0] || 'M';
      let color = colors[0]?.name || 'Selected Shade';
      let qty = 1;
      const on = () => db.isWishlisted(p.id);

      root.innerHTML = `
        <div class="wrap pdp">
          <div class="pdp-gallery-wrap">
            <div class="zoom-lens-container" id="zoom-container" title="Hover to inspect handloom weave">
              <img id="main-product-img" src="${selectedImage}" alt="${esc(p.name)}">
            </div>
            ${images.length > 1 ? `
              <div class="pdp-thumbs">
                ${images.map((img, i) => `
                  <div class="pdp-thumb ${i === 0 ? 'active' : ''}" data-thumb="${img}">
                    <img src="${img}" alt="${esc(p.name)} view ${i + 1}">
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>

          <div>
            <p class="pdp-category-breadcrumb">${p.cat === 'ethnic' ? 'Ethnic Heritage' : 'Western Sartorial'} / ${esc(p.type)}</p>
            <h1>${esc(p.name)}</h1>
            
            <div class="pdp-rating-strip">
              <span class="card-rating">★ ${p.rating || '4.9'} / 5</span>
              <span class="muted">(${p.reviews || 64} Verified Patron Reviews)</span>
              <span>·</span>
              <span style="color:${(p.stock || 0) > 0 ? 'var(--success)' : '#dc2626'};font-weight:600">
                ${(p.stock || 0) > 0 ? `In Stock & Ready for Tailored Dispatch` : 'Sold Out in Atelier'}
              </span>
            </div>

            <div class="pdp-price-wrap">
              <span class="pdp-price">${money(p.price)}</span>
              ${p.old ? `<span class="pdp-old-price">${money(p.old)}</span>` : ''}
              <span class="card-discount">Inclusive of all artisan duties &amp; GST</span>
            </div>

            <div class="pdp-urgency-badge">
              ${(p.stock || 0) <= 3 && (p.stock || 0) > 0 
                ? `Limited Edition: Only ${p.stock} units remaining in atelier` 
                : `Authentic Handcrafted Creation: ${p.stock || 8} units available`}
            </div>

            <p style="font-size:1.05rem;line-height:1.7;color:var(--esp-light);margin-bottom:1.8rem">${esc(p.desc)}</p>

            <div class="size-header">
              <strong>Select Colour</strong>
            </div>
            <div class="color-swatches" id="pdp-colors">
              ${colors.map((c, i) => `
                <button class="color-swatch-btn ${i === 0 ? 'active' : ''}" data-color="${esc(c.name)}">
                  <span class="color-dot" style="background:${c.hex}"></span> ${esc(c.name)}
                </button>
              `).join('')}
            </div>

            <div class="size-header">
              <strong>Select Size</strong>
              <button class="btn-size-guide" onclick="openFitFinder()">Virtual Size Finder &amp; Drape Guide</button>
            </div>
            <div class="sizes" role="group" aria-label="Size">
              ${sizes.map((s, i) => `<button data-size="${s}" aria-pressed="${i === 0}">${s}</button>`).join('')}
            </div>

            <div class="buy-row">
              <div class="qty-control">
                <button id="minus" aria-label="Fewer">−</button>
                <span id="qty">1</span>
                <button id="plus" aria-label="More">+</button>
              </div>
              <button class="btn gold" id="add" ${(p.stock || 0) <= 0 ? 'disabled' : ''}>
                ${(p.stock || 0) > 0 ? 'Add to Shopping Bag' : 'Out of Stock'}
              </button>
              <button class="btn ghost sm" id="wish" aria-pressed="${on()}">${on() ? 'Saved to Wishlist' : 'Save to Wishlist'}</button>
            </div>

            <details open>
              <summary>Artisanal Fabric &amp; Weave Specifications</summary>
              <p><strong>Primary Textile:</strong> ${esc(p.fabric || 'Pure handwoven silk')}.</p>
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

        <!-- Customer Reviews Section -->
        <section class="wrap pdp-reviews-section">
          <div class="section-head">
            <h2>Patron Experiences &amp; Reviews</h2>
            <p class="muted">Authentic feedback from our bespoke clientele</p>
          </div>
          <div class="reviews-grid">
            <div class="review-summary-box">
              <div style="font-size:3.5rem;font-weight:700;color:var(--wine)">${p.rating || '4.9'}</div>
              <div class="star-rating" style="margin:0.5rem 0">★★★★★</div>
              <p class="muted">Based on ${p.reviews || 64} verified orders</p>
              <button class="btn gold sm" id="open-review-form-btn" style="margin-top:1.5rem">Write a Review</button>
            </div>
            <div>
              <div id="new-review-container" style="display:none;margin-bottom:2rem;background:#fff;padding:1.5rem;border-radius:var(--radius);border:1px solid var(--gold)">
                <h3 style="margin-bottom:1rem">Share Your Patron Experience</h3>
                <form id="submit-review-form" style="display:grid;gap:0.8rem">
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Your Rating</label>
                    <div class="star-rating-input" id="star-input">
                      <span data-star="1" class="active">★</span>
                      <span data-star="2" class="active">★</span>
                      <span data-star="3" class="active">★</span>
                      <span data-star="4" class="active">★</span>
                      <span data-star="5" class="active">★</span>
                    </div>
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Your Name</label>
                    <input id="rev-name" placeholder="Meera Kapoor" value="${db.get('user', {})?.name || ''}">
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Review Headline</label>
                    <input id="rev-title" placeholder="Exquisite Banarasi Weave" required>
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Feedback Details</label>
                    <textarea id="rev-comment" rows="3" placeholder="Describe the fit, fabric quality, and drape..." required></textarea>
                  </div>
                  <div style="display:flex;gap:0.8rem">
                    <button class="btn gold sm" type="submit">Submit Review</button>
                    <button class="btn ghost sm" type="button" id="cancel-review-btn">Cancel</button>
                  </div>
                </form>
              </div>
              <div id="reviews-list">Loading patron reviews...</div>
            </div>
          </div>
        </section>

        <!-- Related Ensemble -->
        <section class="wrap" style="padding-top:3rem">
          <div class="section-head">
            <h2>Complete The Ensemble</h2>
          </div>
          <div class="grid" id="related"></div>
        </section>`;

      // Load Reviews from PostgreSQL
      const loadReviews = async () => {
        const revList = $('#reviews-list');
        if (!revList) return;
        try {
          const res = await fetch(`/api/products/${p.id}/reviews`);
          const revs = await res.json();
          if (revs && revs.length) {
            revList.innerHTML = revs.map(r => `
              <div class="review-card">
                <div class="review-header">
                  <strong>${esc(r.user_name)} <span class="hero-pill" style="font-size:0.7rem;padding:0.15rem 0.5rem;background:#dcfce7;color:#15803d;border:none">Verified Patron</span></strong>
                  <span class="star-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                </div>
                ${r.title ? `<h4 style="font-size:1rem;margin-bottom:0.4rem;color:var(--wine)">${esc(r.title)}</h4>` : ''}
                <p style="font-size:0.92rem;color:var(--esp-light);line-height:1.6">${esc(r.comment)}</p>
                <span class="muted" style="font-size:0.75rem;margin-top:0.6rem;display:block">${new Date(r.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            `).join('');
          } else {
            revList.innerHTML = '<p class="muted">No reviews yet for this creation. Be the first patron to share your experience!</p>';
          }
        } catch {
          revList.innerHTML = '<p class="muted">Verified patron reviews will appear here.</p>';
        }
      };
      loadReviews();

      // Review Form toggle & submission
      const openRevBtn = $('#open-review-form-btn');
      const revContainer = $('#new-review-container');
      let currentRating = 5;

      if (openRevBtn && revContainer) {
        openRevBtn.onclick = () => { revContainer.style.display = 'block'; openRevBtn.style.display = 'none'; };
        $('#cancel-review-btn').onclick = () => { revContainer.style.display = 'none'; openRevBtn.style.display = 'inline-block'; };

        $$('#star-input span').forEach(s => {
          s.onclick = () => {
            currentRating = Number(s.dataset.star);
            $$('#star-input span').forEach(x => {
              x.classList.toggle('active', Number(x.dataset.star) <= currentRating);
            });
          };
        });

        $('#submit-review-form').onsubmit = async e => {
          e.preventDefault();
          const title = $('#rev-title').value;
          const comment = $('#rev-comment').value;
          const name = $('#rev-name').value;
          try {
            const res = await fetchAuth(`/api/products/${p.id}/reviews`, {
              method: 'POST',
              body: { rating: currentRating, title, comment, name }
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            toast('Thank you for sharing your bespoke review!');
            revContainer.style.display = 'none';
            openRevBtn.style.display = 'inline-block';
            loadReviews();
          } catch (err) {
            toast(err.message || 'Could not submit review.');
          }
        };
      }

      // Thumbnail image switcher
      $$('[data-thumb]').forEach(t => {
        t.onclick = () => {
          selectedImage = t.dataset.thumb;
          $('#main-product-img').src = selectedImage;
          $$('[data-thumb]').forEach(x => x.classList.toggle('active', x === t));
        };
      });

      // Interactive Image Zoom
      const zoomContainer = $('#zoom-container');
      const mainImg = $('#main-product-img');
      if (zoomContainer && mainImg) {
        zoomContainer.onmousemove = e => {
          const rect = zoomContainer.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          mainImg.style.transformOrigin = `${x}% ${y}%`;
        };
      }

      // Related products
      const related = PRODUCTS.filter(x => x.id !== p.id && (x.type === p.type || x.cat === p.cat)).slice(0, 4);
      $('#related').innerHTML = related.map(card).join('');

      // Color selection
      $$('[data-color]').forEach(b => {
        b.onclick = () => {
          color = b.dataset.color;
          $$('[data-color]').forEach(x => x.classList.toggle('active', x === b));
        };
      });

      // Size Selection
      $$('[data-size]').forEach(b => {
        b.onclick = () => {
          size = b.dataset.size;
          $$('[data-size]').forEach(x => x.setAttribute('aria-pressed', x === b));
        };
      });

      // Quantity controls
      $('#plus').onclick = () => { qty = Math.min(qty + 1, p.stock || 9); $('#qty').textContent = qty; };
      $('#minus').onclick = () => { qty = Math.max(qty - 1, 1); $('#qty').textContent = qty; };

      // Add to bag
      $('#add').onclick = () => {
        if (!size) { toast('Please select your preferred size first'); return; }
        addToCart(p.id, size, qty, color);
        toast(`${p.name} (${size} · ${color}) added to your shopping bag`, 'cart.html', 'View Bag');
      };

      // Wishlist toggle
      $('#wish').onclick = e => {
        const v = toggleWish(p.id);
        if (v === null) return;
        e.target.textContent = v ? 'Saved to Wishlist' : 'Save to Wishlist';
        e.target.setAttribute('aria-pressed', v);
      };
    },

    /* ---------- Module 4: Wishlist ---------- */
    async wishlist() {
      const root = $('#wish-grid');
      if (!root) return;

      const user = db.user();
      if (!db.token() || !user) {
        root.innerHTML = `
          <div class="empty" style="grid-column:1/-1;text-align:center;padding:5rem 1rem">
            <span class="hero-pill" style="margin-bottom:1rem">Atelier Authentication Required</span>
            <h2 style="margin:1rem 0 0.5rem">Your Curated Trousseau</h2>
            <p class="muted" style="margin:0.5rem 0 2rem;max-width:500px;margin-inline:auto">
              Please sign in to your patron account to view your private wishlist and saved haute couture creations.
            </p>
            <a class="btn gold" href="login.html">Sign In to Your Account</a>
          </div>`;
        return;
      }

      root.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 1rem"><p class="muted">Loading your curated trousseau...</p></div>';

      try {
        const res = await fetchAuth('/api/user/wishlist');
        let items = [];
        if (res.ok) {
          items = await res.json();
          db.setWishlist(items.map(p => Number(p.id)));
        } else {
          items = db.getWishlist().map(byId).filter(Boolean);
        }

        root.innerHTML = items.length ? items.map(card).join('') : `
          <div class="empty" style="grid-column:1/-1;text-align:center;padding:5rem 1rem">
            <h2>Your Wishlist is Empty</h2>
            <p class="muted" style="margin:1rem 0 2rem">Curate your dream trousseau by tapping the heart icon on any piece.</p>
            <a class="btn gold" href="shop.html">Explore The Catalogue</a>
          </div>`;
      } catch (err) {
        root.innerHTML = `
          <div class="empty" style="grid-column:1/-1;text-align:center;padding:4rem 1rem">
            <h2>Unable to load wishlist</h2>
            <p class="muted" style="margin:1rem 0 2rem">Please refresh the page or verify your server connection.</p>
            <a class="btn gold" href="shop.html">Explore The Catalogue</a>
          </div>`;
      }
    },

    /* ---------- Module 4: Shopping Bag (Cart) ---------- */
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
                  <p class="muted" style="font-size:0.9rem;margin:0.2rem 0 0.8rem">
                    Size: <strong>${l.size}</strong> · Shade: <strong>${esc(l.color || 'Standard')}</strong> · ${money(l.p.price)}
                  </p>
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
              <input id="code" placeholder="Coupon (e.g. HERITAGE10, ROYAL15)" value="${esc(db.get('promo', ''))}" aria-label="Coupon code">
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
        if (db.token()) {
          fetchAuth('/api/cart/sync', { method: 'POST', body: { items: c } }).catch(() => {});
        }
        pages.cart();
      });

      $$('[data-rm]').forEach(b => b.onclick = () => {
        const c = db.get('cart', []).filter((_, i) => i !== +b.dataset.rm);
        db.set('cart', c);
        if (db.token()) {
          fetchAuth('/api/cart/sync', { method: 'POST', body: { items: c } }).catch(() => {});
        }
        pages.cart();
      });

      $('#promo').onsubmit = async e => {
        e.preventDefault();
        const v = $('#code').value.trim().toUpperCase();
        if (!v) {
          db.set('promo', '');
          toast('Promo code removed');
          pages.cart();
          return;
        }

        try {
          const res = await fetch(`/api/coupons/${v}`);
          const c = await res.json();
          if (!res.ok) throw new Error(c.error);
          db.set('promo', c.code);
          toast(`Promo code ${c.code} (${c.discount_percent}% OFF) applied!`);
          pages.cart();
        } catch (err) {
          toast(err.message || 'Invalid promo code. Use HERITAGE10, ROYAL15, or ATELIER20.');
        }
      };
    },

    /* ---------- Module 4: Checkout Flow ---------- */
    async checkout() {
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
      let savedAddresses = [];

      // If user is logged in, try loading saved addresses
      if (user && db.token()) {
        try {
          const res = await fetchAuth('/api/user/addresses');
          if (res.ok) savedAddresses = await res.json();
        } catch {}
      }

      // Pre-fill user details if logged in
      if (user) {
        if ($('#o-n')) $('#o-n').value = user.name || '';
        if ($('#o-e')) $('#o-e').value = user.email || '';
        if ($('#o-p')) $('#o-p').value = user.phone || '';
      }

      // Render saved address selector if available
      const formEl = $('#order-form');
      if (savedAddresses.length && formEl) {
        let addrContainer = $('#saved-addr-picker');
        if (!addrContainer) {
          addrContainer = document.createElement('div');
          addrContainer.id = 'saved-addr-picker';
          addrContainer.className = 'field full';
          addrContainer.style.marginBottom = '1.5rem';
          formEl.insertBefore(addrContainer, formEl.children[1]);
        }
        addrContainer.innerHTML = `
          <label style="font-weight:600;color:var(--wine)">Choose From Saved Addresses</label>
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-top:0.4rem">
            ${savedAddresses.map((a, i) => `
              <button type="button" class="btn ghost sm addr-choice-btn" data-addr-idx="${i}" style="text-align:left;padding:0.6rem 1rem">
                <strong>${esc(a.label)}</strong>: ${esc(a.address_line1)}, ${esc(a.city)} (${a.pincode})
              </button>
            `).join('')}
          </div>
        `;

        $$('.addr-choice-btn').forEach(b => {
          b.onclick = () => {
            const a = savedAddresses[Number(b.dataset.addrIdx)];
            if ($('#o-n')) $('#o-n').value = a.recipient_name;
            if ($('#o-p')) $('#o-p').value = a.phone;
            if ($('#o-a')) $('#o-a').value = a.address_line1 + (a.address_line2 ? ', ' + a.address_line2 : '');
            if ($('#o-c')) $('#o-c').value = a.city;
            if ($('#o-pin')) $('#o-pin').value = a.pincode;
            toast(`Selected saved address: ${a.label}`);
          };
        });
      }

      const orderForm = $('#order-form');
      if (orderForm) {
        orderForm.onsubmit = async e => {
          e.preventDefault();
          const customer = Object.fromEntries(new FormData(e.target));
          const paymentMethod = customer.payment || 'cod';

          try {
            const res = await fetchAuth('/api/orders', {
              method: 'POST',
              body: {
                customer,
                items: db.get('cart', []),
                promo: db.get('promo', ''),
                paymentMethod,
                shippingAddress: {
                  recipient: customer.name,
                  line1: customer.address,
                  city: customer.city,
                  pincode: customer.pin,
                  phone: customer.phone
                }
              }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            db.set('cart', []);
            db.set('promo', '');

            checkoutEl.innerHTML = `
              <div class="wrap" style="max-width:620px;margin:4rem auto;text-align:center;background:#fff;padding:3.5rem;border-radius:var(--radius-lg);border:1px solid var(--line);box-shadow:var(--shadow-md)">
                <div style="width:4.5rem;height:4.5rem;background:var(--ivory-soft);color:var(--wine);border-radius:50%;display:grid;place-items:center;margin:0 auto 1.5rem">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <h1 style="font-size:2.4rem">Thank you, ${esc(customer.name.split(' ')[0])}.</h1>
                <p style="margin:1.2rem 0 1.8rem;color:var(--esp-light);font-size:1.1rem">
                  Your bespoke couture order <strong>${data.id}</strong> has been confirmed. A formal dispatch tracking schedule has been transmitted to <strong>${esc(customer.email)}</strong>.
                </p>
                <div style="background:var(--ivory-soft);padding:1.4rem;border-radius:var(--radius);margin-bottom:2rem;text-align:left">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
                    <span>Order Reference:</span> <strong>${data.id}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
                    <span>Tracking Number:</span> <strong>${data.trackingNumber}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
                    <span>Order Total:</span> <strong>${money(data.total)}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between">
                    <span>Dispatch Status:</span> <span class="order-badge in-atelier">In Atelier Handcrafting</span>
                  </div>
                </div>
                <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap">
                  <a class="btn gold" href="login.html">View &amp; Track in My Account</a>
                  <a class="btn ghost" href="shop.html">Continue Exploring Creations</a>
                </div>
              </div>`;
          } catch (err) {
            toast(err.message || 'Could not place order. Please try again.');
          }
        };
      }
    },

    /* ---------- Module 5: Customer Account & Authentication ---------- */
    async login() {
      const root = $('#auth');
      if (!root) return;

      const user = db.get('user', null);
      const token = db.token();

      // If user is already authenticated, render full Patron / Admin Dashboard
      if (user && token) {
        const isAdmin = user.role === 'admin';

        if (isAdmin) {
          root.className = 'account-wrapper admin-dashboard';
          document.body.classList.add('admin-dashboard-theme');
          const siteHeader = $('#site-header');
          if (siteHeader) {
            siteHeader.innerHTML = '';
            siteHeader.style.display = 'none';
          }
          root.innerHTML = `
            <div class="account-header">
              <div style="display:flex;align-items:center;gap:1.2rem">
                <img src="images/emblem.png" alt="SATINOSTITCH" style="height:44px;width:auto;border-radius:4px">
                <div>
                  <span class="admin-role-badge">Atelier Master &bull; Administrator</span>
                  <h1 style="font-family:var(--serif);font-size:2rem;margin:0.2rem 0;color:var(--admin-charcoal)">SATINOSTITCH Atelier Portal</h1>
                  <p class="admin-subtext">${esc(user.name)} &bull; ${esc(user.email)} &bull; Status: Active Curator</p>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:0.75rem">
                <a href="index.html" class="btn ghost sm" style="color:var(--admin-charcoal);border-color:var(--admin-border);text-decoration:none">View Storefront</a>
                <button class="btn ghost sm" id="signout-btn" style="color:var(--admin-charcoal);border-color:var(--admin-border)">Sign Out</button>
              </div>
            </div>

            <div class="account-nav">
              <button class="account-tab-btn active" data-tab="overview">Atelier Overview &amp; Analytics</button>
              <button class="account-tab-btn" data-tab="admin-orders">All Orders &amp; Fulfillment</button>
              <button class="account-tab-btn" data-tab="activity">Customer Activity Feed</button>
              <button class="account-tab-btn" data-tab="crud">Garment Management (CRUD)</button>
              <button class="account-tab-btn" data-tab="coupons">Promotional Coupons</button>
              <button class="account-tab-btn" data-tab="users">Patrons &amp; Staff Roles</button>
              <button class="account-tab-btn" data-tab="orders">My Personal Orders</button>
              <button class="account-tab-btn" data-tab="addresses">Saved Addresses</button>
              <button class="account-tab-btn" data-tab="profile">Profile Details</button>
            </div>

            <div id="account-tab-content">Loading bespoke atelier data...</div>
          `;
        } else {
          root.className = 'account-wrapper';
          document.body.classList.remove('admin-dashboard-theme');
          root.innerHTML = `
            <div class="account-header">
              <div>
                <span class="hero-pill" style="margin-bottom:0.4rem;display:inline-block">VIP Patron</span>
                <h1 style="font-size:2.2rem">${esc(user.name)}</h1>
                <p class="muted">${esc(user.email)} · Phone: ${esc(user.phone || 'Not registered')}</p>
              </div>
              <button class="btn ghost sm" id="signout-btn" style="color:#b91c1c;border-color:#fca5a5">Sign Out</button>
            </div>

            <div class="account-nav">
              <button class="account-tab-btn active" data-tab="orders">My Orders &amp; Tracking</button>
              <button class="account-tab-btn" data-tab="addresses">Saved Addresses</button>
              <button class="account-tab-btn" data-tab="wishlist">Curated Wishlist</button>
              <button class="account-tab-btn" data-tab="profile">Profile Details</button>
            </div>

            <div id="account-tab-content">Loading your bespoke details...</div>
          `;
        }

        $('#signout-btn').onclick = () => {
          if (window._adminSyncInterval) clearInterval(window._adminSyncInterval);
          document.body.classList.remove('admin-dashboard-theme');
          const siteHeader = $('#site-header');
          if (siteHeader) siteHeader.style.display = '';
          db.clearAuth();
          toast('You have successfully signed out.');
          setTimeout(() => { location.href = 'index.html'; }, 500);
        };

        // Utility: Relative time formatter for live activities
        const timeAgo = (dateStr) => {
          if (!dateStr) return 'Just now';
          const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
          if (diff < 15) return 'Just now';
          if (diff < 60) return `${diff}s ago`;
          if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
          if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
          return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        };

        // Utility: Activity icon, class and semantic label
        const getActivityMeta = (type) => {
          switch (type) {
            case 'order_placed':
              return { icon: '🛍️', cls: 'order', label: 'Order Commission' };
            case 'payment_received':
              return { icon: '💳', cls: 'order', label: 'Payment Settled' };
            case 'payment_status_update':
              return { icon: '💰', cls: 'order', label: 'Payment Status' };
            case 'cart_addition':
              return { icon: '🛒', cls: 'cart', label: 'Bag Addition' };
            case 'view':
              return { icon: '👁️', cls: 'view', label: 'Storefront View' };
            case 'register':
              return { icon: '👑', cls: 'register', label: 'Patron Enrolment' };
            case 'cancellation':
              return { icon: '✕', cls: 'cancel', label: 'Order Cancelled' };
            case 'return_request':
              return { icon: '↩', cls: 'return', label: 'Return Initiated' };
            case 'review_submission':
              return { icon: '★', cls: 'review', label: 'Patron Review' };
            case 'order_status_update':
              return { icon: '🚚', cls: 'order', label: 'Fulfillment Dispatch' };
            default:
              return { icon: '⚡', cls: '', label: 'Atelier Event' };
          }
        };

        const renderTab = async (tabName, isSilent = false) => {
          $$('.account-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
          const container = $('#account-tab-content');
          if (!container) return;

          // Manage live sync auto-polling (every 15s) for real-time monitoring
          if (window._adminSyncInterval) clearInterval(window._adminSyncInterval);
          if (isAdmin && (tabName === 'overview' || tabName === 'activity')) {
            window._adminSyncInterval = setInterval(() => {
              if (document.hidden) return;
              const currentActive = $('.account-tab-btn.active')?.dataset.tab;
              if (currentActive === 'overview' || currentActive === 'activity') {
                renderTab(currentActive, true);
              }
            }, 15000);
          }

          /* ==========================================================================
             ADMIN TAB 1: Atelier Overview & Real-Time Analytics
             ========================================================================== */
          if (tabName === 'overview') {
            if (!isSilent) {
              container.innerHTML = '<p class="muted">Connecting to PostgreSQL atelier analytics &amp; live activity feed...</p>';
            }

            try {
              const res = await fetchAuth('/api/admin/analytics');
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to retrieve analytics');

              const summary = data.summary || data.kpis || {};
              const salesGraphs = data.salesGraphs || { daily: [], weekly: [], monthly: [] };
              const bestSellers = data.bestSellers || [];
              const mostViewed = data.mostViewed || [];
              const lowStockItems = data.lowStockAlerts || [];
              const recentOrders = data.recentOrders || [];
              const recentActivities = data.recentActivities || [];
              const demandCat = data.demandByCategory || [];

              // Active range for sales graph (daily, weekly, monthly)
              const activeRange = window._adminChartRange || 'daily';
              const graphData = salesGraphs[activeRange] || [];
              const maxRev = Math.max(...graphData.map(d => Number(d.revenue) || 0), 1000);
              const totalRangeRev = graphData.reduce((acc, d) => acc + (Number(d.revenue) || 0), 0);
              const totalRangeOrders = graphData.reduce((acc, d) => acc + (Number(d.orders) || 0), 0);

              // Category demand calculations
              const maxDemandSold = Math.max(...demandCat.map(c => Number(c.total_units_sold) || 0), 1);
              const maxCatViews = Math.max(...demandCat.map(c => Number(c.total_views) || 0), 1);

              // Status pipeline calculations
              const statusCounts = summary.statusCounts || {
                'Confirmed': 0, 'In Atelier': 0, 'Dispatched': 0, 'Delivered': 0, 'Cancelled': 0
              };
              const maxOrderCount = Math.max(...Object.values(statusCounts), 1);

              const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              container.innerHTML = `
                <!-- Live Synchronization Banner -->
                <div class="admin-live-header">
                  <div>
                    <span class="admin-live-badge">
                      <span class="admin-live-dot"></span>
                      PostgreSQL Real-Time Synchronisation Active
                    </span>
                    <p style="margin:0.25rem 0 0;font-size:0.83rem;color:var(--admin-charcoal-muted)">
                      Live pulse synced across customer browsing, cart additions, commissions, and fulfillment.
                    </p>
                  </div>
                  <div style="display:flex;align-items:center;gap:0.9rem">
                    <span style="font-size:0.82rem;color:var(--admin-charcoal-muted)">Refreshed: ${nowTime}</span>
                    <button class="btn ghost sm" id="admin-manual-sync-btn" style="padding:0.35rem 0.85rem;font-size:0.82rem">
                      🔄 Sync Now
                    </button>
                  </div>
                </div>

                <!-- 6 Metric KPI Tiles from Real Database Records -->
                <div class="admin-stat-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:1rem;margin-bottom:1.8rem">
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Gross Revenue</div>
                    <div class="admin-stat-value" style="color:var(--admin-forest)">${money(summary.grossRevenue || 0)}</div>
                    <div class="admin-stat-meta">Net (excl. discounts): ${money(summary.netRevenue || 0)}</div>
                  </div>
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Patron Orders</div>
                    <div class="admin-stat-value">${summary.validOrdersCount || 0}</div>
                    <div class="admin-stat-meta">Avg Order Value: ${money(summary.averageOrderValue || 0)}</div>
                  </div>
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Registered Patrons</div>
                    <div class="admin-stat-value">${summary.totalCustomers || 0}</div>
                    <div class="admin-stat-meta">Curated patrons in database</div>
                  </div>
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Storefront Demand</div>
                    <div class="admin-stat-value">${summary.totalViews || 0} views</div>
                    <div class="admin-stat-meta">Tracked garment visits</div>
                  </div>
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Atelier Stock Units</div>
                    <div class="admin-stat-value">${summary.totalStock || 0} pcs</div>
                    <div class="admin-stat-meta">Across ${summary.totalProducts || 0} active designs</div>
                  </div>
                  <div class="admin-stat-tile">
                    <div class="admin-stat-title">Low Stock Alerts</div>
                    <div class="admin-stat-value" style="color:${summary.lowStockCount > 0 ? '#B91C1C' : 'var(--admin-forest)'}">
                      ${summary.lowStockCount || 0} items
                    </div>
                    <div class="admin-stat-meta">${summary.lowStockCount > 0 ? 'Requires immediate restock' : 'All stock levels optimal'}</div>
                  </div>
                </div>

                <!-- Interactive Sales & Revenue Analytics Graph -->
                <div class="admin-surface-card" style="margin-bottom:1.8rem">
                  <div class="admin-graph-header">
                    <div>
                      <h3 style="margin-bottom:0.2rem">Haute Couture Sales &amp; Revenue Analytics</h3>
                      <p class="muted" style="font-size:0.86rem">
                        Period Revenue: <strong>${money(totalRangeRev)}</strong> &bull; Volume: <strong>${totalRangeOrders} orders</strong> (excludes cancelled orders)
                      </p>
                    </div>
                    <div class="admin-graph-toggle">
                      <button class="admin-graph-toggle-btn ${activeRange === 'daily' ? 'active' : ''}" data-range="daily">Daily (7 Days)</button>
                      <button class="admin-graph-toggle-btn ${activeRange === 'weekly' ? 'active' : ''}" data-range="weekly">Weekly (4 Weeks)</button>
                      <button class="admin-graph-toggle-btn ${activeRange === 'monthly' ? 'active' : ''}" data-range="monthly">Monthly (6 Months)</button>
                    </div>
                  </div>

                  <div class="admin-sales-chart-wrap">
                    ${graphData.length ? graphData.map(d => {
                      const rev = Number(d.revenue) || 0;
                      const pct = Math.min(100, Math.max(6, Math.round((rev / maxRev) * 100)));
                      return `
                        <div class="admin-sales-col" title="${esc(d.label || d.key)}: ${money(rev)} (${d.orders || 0} orders)">
                          <div class="admin-sales-val">${rev > 0 ? money(rev) : '₹0'}</div>
                          <div class="admin-sales-bar-container">
                            <div class="admin-sales-bar" style="height:${pct}%"></div>
                          </div>
                          <div class="admin-sales-date">${esc(d.label || d.key)}</div>
                          <div class="admin-sales-count">${d.orders || 0} orders</div>
                        </div>
                      `;
                    }).join('') : '<p class="muted" style="padding:2rem">No sales data recorded in this period.</p>'}
                  </div>
                </div>

                <!-- Two-Column Product Performance: Best-Sellers vs Most-Viewed Demand -->
                <div class="admin-chart-section" style="margin-bottom:1.8rem">
                  <!-- Column 1: Best-Selling Garments -->
                  <div class="admin-chart-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                      <div>
                        <h3>Best-Selling Garments</h3>
                        <p style="margin:0">Ranked by actual pieces sold &amp; revenue</p>
                      </div>
                      <span class="admin-pill forest">Top Performers</span>
                    </div>

                    ${bestSellers.length ? `
                      <div class="admin-rank-list">
                        ${bestSellers.map((item, idx) => `
                          <div class="admin-rank-item">
                            <span class="admin-rank-num ${idx < 3 ? 'gold' : ''}">#${idx + 1}</span>
                            <img class="admin-rank-thumb" src="${item.image || 'images/p1.jpg'}" alt="${esc(item.product_name || item.name)}">
                            <div class="admin-rank-info">
                              <div class="admin-rank-name">${esc(item.product_name || item.name)}</div>
                              <div class="admin-rank-meta">
                                <span class="admin-pill sage" style="font-size:0.68rem;padding:0.1rem 0.45rem">${item.cat === 'ethnic' ? 'Ethnic' : 'Western'}</span>
                                &bull; In Stock: ${item.stock} pcs
                              </div>
                            </div>
                            <div class="admin-rank-val">
                              <strong>${item.total_sold || item.totalSold || 0} sold</strong>
                              <span>${money(item.total_revenue || item.totalRevenue || 0)}</span>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    ` : '<p class="muted">No garment orders fulfilled yet.</p>'}
                  </div>

                  <!-- Column 2: Most-Viewed Storefront Demand -->
                  <div class="admin-chart-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                      <div>
                        <h3>Most-Viewed Garments</h3>
                        <p style="margin:0">Live customer traffic &amp; product interest</p>
                      </div>
                      <span class="admin-pill sage">Storefront Interest</span>
                    </div>

                    ${mostViewed.length ? `
                      <div class="admin-rank-list">
                        ${mostViewed.map((item, idx) => `
                          <div class="admin-rank-item">
                            <span class="admin-rank-num">#${idx + 1}</span>
                            <img class="admin-rank-thumb" src="${item.image || 'images/p1.jpg'}" alt="${esc(item.name)}">
                            <div class="admin-rank-info">
                              <div class="admin-rank-name">${esc(item.name)}</div>
                              <div class="admin-rank-meta">
                                <strong>${money(item.price)}</strong> &bull; Rating: ★ ${item.rating || '4.9'}
                              </div>
                            </div>
                            <div class="admin-rank-val">
                              <strong style="color:var(--admin-forest)">${item.views_count || item.viewsCount || 0} views</strong>
                              <span style="color:${item.stock <= 5 ? '#B91C1C' : 'inherit'}">${item.stock} in stock</span>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    ` : '<p class="muted">No garment views recorded yet.</p>'}
                  </div>
                </div>

                <!-- Two-Column Category Demand & Order Pipeline -->
                <div class="admin-chart-section" style="margin-bottom:1.8rem">
                  <div class="admin-chart-box">
                    <h3>Silhouette Demand &amp; Sales</h3>
                    <p>Comparison of customer units commissioned across active silhouettes</p>
                    <div class="admin-chart-bars">
                      ${demandCat.map(c => {
                        const units = Number(c.total_units_sold) || 0;
                        const views = Number(c.total_views) || 0;
                        const pct = Math.round((units / maxDemandSold) * 100);
                        return `
                          <div class="admin-bar-row">
                            <span class="admin-bar-label">${esc(c.label)}</span>
                            <div class="admin-bar-track">
                              <div class="admin-bar-fill" style="width:${pct}%"></div>
                            </div>
                            <span class="admin-bar-val">${units} sold (${views} views)</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <div class="admin-chart-box">
                    <h3>Order Fulfillment Pipeline</h3>
                    <p>Current volume distribution across order lifecycle</p>
                    <div class="admin-chart-bars">
                      ${Object.entries(statusCounts).map(([status, cnt]) => {
                        const pct = Math.round((cnt / maxOrderCount) * 100);
                        return `
                          <div class="admin-bar-row">
                            <span class="admin-bar-label">${status}</span>
                            <div class="admin-bar-track">
                              <div class="admin-bar-fill accent" style="width:${pct}%"></div>
                            </div>
                            <span class="admin-bar-val">${cnt} orders</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                </div>

                <!-- Low Stock Priority Restock Table -->
                <div class="admin-surface-card" style="margin-bottom:1.8rem">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.8rem">
                    <div>
                      <h3 style="margin-bottom:0.2rem">Atelier Restock Priority</h3>
                      <p class="muted" style="font-size:0.86rem">Garments with 5 or fewer units remaining in atelier inventory</p>
                    </div>
                    ${lowStockItems.length ? `<span class="admin-pill warn">${lowStockItems.length} Urgent Restocks</span>` : ''}
                  </div>

                  ${lowStockItems.length ? `
                    <div class="admin-table-wrap">
                      <table class="admin-table">
                        <thead>
                          <tr>
                            <th>Garment</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Stock Level</th>
                            <th>Quick Replenishment</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${lowStockItems.map(it => `
                            <tr>
                              <td>
                                <div style="display:flex;align-items:center;gap:0.8rem">
                                  <img src="${it.image || 'images/p1.jpg'}" alt="${esc(it.name)}" style="width:36px;height:46px;object-fit:cover;border-radius:4px;border:1px solid var(--admin-border)">
                                  <strong>${esc(it.name)}</strong>
                                </div>
                              </td>
                              <td><span class="admin-pill sage">${it.cat === 'ethnic' ? 'Ethnic Couture' : 'Western Pret'}</span></td>
                              <td><strong>${money(it.price)}</strong></td>
                              <td>
                                <span class="admin-pill warn">${it.stock} units left</span>
                              </td>
                              <td>
                                <div style="display:flex;gap:0.5rem">
                                  <button class="btn gold sm restock-quick-btn" data-pid="${it.id}" data-current="${it.stock}" data-add="5">+5 Units</button>
                                  <button class="btn ghost sm restock-quick-btn" data-pid="${it.id}" data-current="${it.stock}" data-add="10">+10 Units</button>
                                </div>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  ` : `
                    <p class="muted" style="padding:1rem 0">All inventory units are abundantly stocked across the atelier.</p>
                  `}
                </div>

                <!-- Recent Orders & Payment Updates -->
                <div class="admin-surface-card" style="margin-bottom:1.8rem">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.8rem">
                    <div>
                      <h3 style="margin-bottom:0.2rem">Recent Patron Commissions</h3>
                      <p class="muted" style="font-size:0.86rem">Latest orders placed with real-time payment and dispatch statuses</p>
                    </div>
                    <button class="btn ghost sm" id="go-all-orders-btn">View All Orders &amp; Fulfillment &rarr;</button>
                  </div>

                  ${recentOrders.length ? `
                    <div class="admin-table-wrap">
                      <table class="admin-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Patron</th>
                            <th>Date</th>
                            <th>Total</th>
                            <th>Payment</th>
                            <th>Status</th>
                            <th>Quick Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${recentOrders.map(o => `
                            <tr>
                              <td>
                                <strong style="color:var(--admin-forest)">#${esc(o.id)}</strong>
                                <div style="font-size:0.76rem;color:var(--admin-charcoal-muted)">${o.item_count || 1} items</div>
                              </td>
                              <td>
                                <div><strong>${esc(o.customer_name || 'VIP Patron')}</strong></div>
                                <div style="font-size:0.76rem;color:var(--admin-charcoal-muted)">${esc(o.customer_email || '')}</div>
                              </td>
                              <td>${new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</td>
                              <td><strong>${money(o.total)}</strong></td>
                              <td>
                                <span class="admin-pill sage">${(o.payment_method || 'COD').toUpperCase()}</span>
                                <span class="admin-pill ${o.payment_status === 'paid' ? 'forest' : 'warn'}" style="margin-left:0.3rem">
                                  ${(o.payment_status || 'Pending').toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <select class="overview-order-status-select" data-order-id="${o.id}" style="width:auto;padding:0.3rem 0.5rem;font-size:0.84rem">
                                  ${['Confirmed', 'In Atelier', 'Dispatched', 'Delivered', 'Cancelled'].map(st => `
                                    <option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>
                                  `).join('')}
                                </select>
                              </td>
                              <td>
                                <button class="btn gold sm save-overview-status-btn" data-order-id="${o.id}">Update</button>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  ` : '<p class="muted" style="padding:1rem 0">No orders registered yet.</p>'}
                </div>

                <!-- Live Customer Activity Feed Widget -->
                <div class="admin-surface-card">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.8rem">
                    <div>
                      <h3 style="margin-bottom:0.2rem">Live Patron Activity Stream</h3>
                      <p class="muted" style="font-size:0.86rem">Real-time audit log of browsing, cart updates, registrations and commissions</p>
                    </div>
                    <button class="btn ghost sm" id="go-activity-tab-btn">View Full Activity Feed &rarr;</button>
                  </div>

                  ${recentActivities.length ? `
                    <div class="admin-activity-stream">
                      ${recentActivities.slice(0, 8).map(act => {
                        const meta = getActivityMeta(act.activity_type);
                        return `
                          <div class="admin-activity-item">
                            <div class="admin-activity-icon ${meta.cls}">${meta.icon}</div>
                            <div class="admin-activity-body">
                              <div class="admin-activity-desc">${esc(act.description)}</div>
                              <div class="admin-activity-meta">
                                <span class="admin-activity-actor">${esc(act.user_name || 'Guest Patron')}</span>
                                <span>&bull;</span>
                                <span>${meta.label}</span>
                                <span>&bull;</span>
                                <span>${timeAgo(act.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : '<p class="muted" style="padding:1rem 0">No customer activity recorded yet.</p>'}
                </div>
              `;

              // Event Delegate: Sales graph toggle
              $$('.admin-graph-toggle-btn').forEach(btn => {
                btn.onclick = () => {
                  window._adminChartRange = btn.dataset.range;
                  renderTab('overview', true);
                };
              });

              // Event Delegate: Manual Sync Now
              const manualSyncBtn = $('#admin-manual-sync-btn');
              if (manualSyncBtn) {
                manualSyncBtn.onclick = () => {
                  toast('Refreshing atelier metrics from PostgreSQL...');
                  renderTab('overview', true);
                };
              }

              // Event Delegate: Navigation shortcuts
              const allOrdBtn = $('#go-all-orders-btn');
              if (allOrdBtn) allOrdBtn.onclick = () => renderTab('admin-orders');
              const actTabBtn = $('#go-activity-tab-btn');
              if (actTabBtn) actTabBtn.onclick = () => renderTab('activity');

              // Event Delegate: Quick Restock Buttons
              $$('.restock-quick-btn').forEach(btn => {
                btn.onclick = async () => {
                  const pid = btn.dataset.pid;
                  const add = Number(btn.dataset.add || 5);
                  const newStock = Number(btn.dataset.current) + add;
                  try {
                    const r = await fetchAuth(`/api/products/${pid}/stock`, {
                      method: 'PUT',
                      body: { stock: newStock }
                    });
                    if (!r.ok) throw new Error((await r.json()).error);
                    toast(`Stock successfully replenished (+${add} units) in PostgreSQL.`);
                    renderTab('overview', true);
                  } catch (e) {
                    toast(e.message || 'Could not update stock.');
                  }
                };
              });

              // Event Delegate: Save Order Status from Overview
              $$('.save-overview-status-btn').forEach(btn => {
                btn.onclick = async () => {
                  const oid = btn.dataset.orderId;
                  const select = $(`.overview-order-status-select[data-order-id="${oid}"]`);
                  if (!select) return;
                  const newStatus = select.value;
                  try {
                    const r = await fetchAuth(`/api/orders/${oid}/status`, {
                      method: 'PUT',
                      body: { status: newStatus }
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    toast(`Order #${oid} status updated to ${newStatus}.`);
                    renderTab('overview', true);
                  } catch (e) {
                    toast(e.message || 'Could not update order status.');
                  }
                };
              });

            } catch (err) {
              container.innerHTML = `<p class="muted">Could not load atelier analytics: ${esc(err.message)}</p>`;
            }
          }

          /* ==========================================================================
             ADMIN TAB 2: Live Customer Activity Feed (Dedicated Tab)
             ========================================================================== */
          else if (tabName === 'activity') {
            if (!isSilent) {
              container.innerHTML = '<p class="muted">Loading real-time patron activity stream...</p>';
            }

            try {
              const currentFilter = window._activityFilter || '';
              const url = currentFilter ? `/api/admin/activities?limit=60&type=${currentFilter}` : '/api/admin/activities?limit=60';
              const res = await fetchAuth(url);
              const activities = await res.json();
              const list = Array.isArray(activities) ? activities : [];

              const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              container.innerHTML = `
                <div class="admin-surface-card">
                  <div class="admin-live-header" style="margin-bottom:1.2rem">
                    <div>
                      <span class="admin-live-badge">
                        <span class="admin-live-dot"></span>
                        Live Patron Activity Feed (${list.length} events)
                      </span>
                      <p style="margin:0.2rem 0 0;font-size:0.83rem;color:var(--admin-charcoal-muted)">
                        Chronological audit log of customer registrations, views, bag additions, orders, cancellations, returns, and reviews.
                      </p>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.9rem">
                      <span style="font-size:0.82rem;color:var(--admin-charcoal-muted)">Updated: ${nowTime}</span>
                      <button class="btn ghost sm" id="activity-refresh-btn" style="padding:0.35rem 0.85rem;font-size:0.82rem">
                        🔄 Refresh
                      </button>
                    </div>
                  </div>

                  <!-- Filter Bar -->
                  <div class="admin-filter-bar">
                    <button class="admin-filter-chip ${currentFilter === '' ? 'active' : ''}" data-filter="">All Events</button>
                    <button class="admin-filter-chip ${currentFilter === 'order_placed' ? 'active' : ''}" data-filter="order_placed">Orders Placed</button>
                    <button class="admin-filter-chip ${currentFilter === 'register' ? 'active' : ''}" data-filter="register">Patron Registrations</button>
                    <button class="admin-filter-chip ${currentFilter === 'cart_addition' ? 'active' : ''}" data-filter="cart_addition">Bag Additions</button>
                    <button class="admin-filter-chip ${currentFilter === 'view' ? 'active' : ''}" data-filter="view">Garment Views</button>
                    <button class="admin-filter-chip ${currentFilter === 'cancellation' ? 'active' : ''}" data-filter="cancellation">Cancellations</button>
                    <button class="admin-filter-chip ${currentFilter === 'return_request' ? 'active' : ''}" data-filter="return_request">Return Requests</button>
                    <button class="admin-filter-chip ${currentFilter === 'review_submission' ? 'active' : ''}" data-filter="review_submission">Patron Reviews</button>
                  </div>

                  ${list.length ? `
                    <div class="admin-activity-stream">
                      ${list.map(act => {
                        const meta = getActivityMeta(act.activity_type);
                        return `
                          <div class="admin-activity-item">
                            <div class="admin-activity-icon ${meta.cls}">${meta.icon}</div>
                            <div class="admin-activity-body">
                              <div class="admin-activity-desc">${esc(act.description)}</div>
                              <div class="admin-activity-meta">
                                <span class="admin-activity-actor">${esc(act.user_name || 'Guest Patron')}</span>
                                <span>&bull;</span>
                                <span class="admin-pill sage" style="font-size:0.68rem;padding:0.1rem 0.45rem">${meta.label}</span>
                                <span>&bull;</span>
                                <span>${timeAgo(act.created_at)}</span>
                                <span class="muted" style="font-size:0.72rem">(${new Date(act.created_at).toLocaleString('en-IN')})</span>
                              </div>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : `
                    <p class="muted" style="padding:2rem 0;text-align:center">No activities found matching this filter.</p>
                  `}
                </div>
              `;

              // Event Delegate: Filter chips
              $$('.admin-filter-chip').forEach(chip => {
                chip.onclick = () => {
                  window._activityFilter = chip.dataset.filter;
                  renderTab('activity', true);
                };
              });

              // Event Delegate: Manual Refresh
              const actRefBtn = $('#activity-refresh-btn');
              if (actRefBtn) {
                actRefBtn.onclick = () => renderTab('activity', true);
              }

            } catch (err) {
              container.innerHTML = `<p class="muted">Could not load activity feed: ${esc(err.message)}</p>`;
            }
          }

          /* ==========================================================================
             ADMIN TAB 2: All Patron Orders & Fulfillment
             ========================================================================== */
          else if (tabName === 'admin-orders') {
            container.innerHTML = '<p class="muted">Loading all patron orders from database...</p>';
            try {
              const res = await fetchAuth('/api/admin/orders');
              const orders = await res.json();
              if (Array.isArray(orders) && orders.length) {
                container.innerHTML = `
                  <div class="admin-surface-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem;flex-wrap:wrap;gap:0.8rem">
                      <div>
                        <h2>All Patron Commissions &amp; Orders (${orders.length})</h2>
                        <p class="muted">Real-time order statuses, fulfillment tracking, and courier dispatch management.</p>
                      </div>
                    </div>

                    <div class="admin-table-wrap">
                      <table class="admin-table">
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Patron</th>
                            <th>Date</th>
                            <th>Total</th>
                            <th>Payment</th>
                            <th>Fulfillment Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${orders.map(o => `
                            <tr>
                              <td>
                                <strong style="color:var(--admin-forest)">#${esc(o.id)}</strong>
                                <div style="font-size:0.78rem;color:var(--admin-charcoal-muted)">${esc(o.tracking_number || 'TRK-SS-PENDING')}</div>
                              </td>
                              <td>
                                <div><strong>${esc(o.customer_name || 'VIP Patron')}</strong></div>
                                <div style="font-size:0.78rem;color:var(--admin-charcoal-muted)">${esc(o.customer_email || '')}</div>
                              </td>
                              <td>${new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                              <td><strong>${money(o.total)}</strong></td>
                              <td>
                                <span class="admin-pill sage">${(o.payment_method || 'COD').toUpperCase()}</span>
                                <span class="admin-pill ${o.payment_status === 'paid' ? 'forest' : 'warn'}" style="margin-left:0.3rem">
                                  ${(o.payment_status || 'Pending').toUpperCase()}
                                </span>
                                ${o.payment_status !== 'paid' ? `
                                  <div style="margin-top:0.35rem">
                                    <button class="btn ghost sm mark-paid-btn" data-order-id="${o.id}" style="font-size:0.74rem;padding:0.2rem 0.55rem">Mark Paid</button>
                                  </div>
                                ` : ''}
                              </td>
                              <td>
                                <select class="order-status-select" data-order-id="${o.id}" style="width:auto;padding:0.35rem 0.6rem;font-size:0.85rem">
                                  ${['Confirmed', 'In Atelier', 'Dispatched', 'Delivered', 'Cancelled'].map(st => `
                                    <option value="${st}" ${st === o.status ? 'selected' : ''}>${st}</option>
                                  `).join('')}
                                </select>
                              </td>
                              <td>
                                <button class="btn gold sm save-status-btn" data-order-id="${o.id}">Update</button>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `;

                $$('.save-status-btn').forEach(btn => {
                  btn.onclick = async () => {
                    const oid = btn.dataset.orderId;
                    const select = $(`.order-status-select[data-order-id="${oid}"]`);
                    if (!select) return;
                    const newStatus = select.value;
                    try {
                      const r = await fetchAuth(`/api/orders/${oid}/status`, {
                        method: 'PUT',
                        body: { status: newStatus }
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error);
                      toast(`Order #${oid} status updated to ${newStatus}.`);
                      renderTab('admin-orders');
                    } catch (e) {
                      toast(e.message || 'Could not update order status.');
                    }
                  };
                });

                $$('.mark-paid-btn').forEach(btn => {
                  btn.onclick = async () => {
                    const oid = btn.dataset.orderId;
                    try {
                      const r = await fetchAuth(`/api/orders/${oid}/payment`, {
                        method: 'PUT',
                        body: { paymentStatus: 'paid' }
                      });
                      const d = await r.json();
                      if (!r.ok) throw new Error(d.error);
                      toast(`Order #${oid} marked as Paid in PostgreSQL.`);
                      renderTab('admin-orders');
                    } catch (e) {
                      toast(e.message || 'Could not update payment status.');
                    }
                  };
                });
              } else {
                container.innerHTML = '<p class="muted">No orders found in database.</p>';
              }
            } catch (err) {
              container.innerHTML = '<p class="muted">Could not retrieve patron orders.</p>';
            }
          }

          /* ==========================================================================
             TAB 3: Garment Management (CRUD & Product Catalog Table)
             ========================================================================== */
          else if (tabName === 'crud') {
            container.innerHTML = '<p class="muted">Loading atelier catalog...</p>';
            try {
              const res = await fetch('/api/products');
              const products = await res.json();
              const productList = Array.isArray(products) ? products : [];

              container.innerHTML = `
                <!-- Garment Creation Form -->
                <div class="account-card" style="margin-bottom:2rem">
                  <h2 style="margin-bottom:0.4rem">Publish New Bespoke Garment</h2>
                  <p class="muted" style="margin-bottom:1.5rem">Create new handcrafted additions directly into the PostgreSQL catalog.</p>
                  
                  <form id="admin-product-form" style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem">
                    <div style="grid-column:1/-1">
                      <label>Garment Name</label>
                      <input name="name" required placeholder="e.g. Royal Organza Zari Saree">
                    </div>
                    <div>
                      <label>Category</label>
                      <select name="cat">
                        <option value="ethnic">Ethnic Couture</option>
                        <option value="western">Western Pret</option>
                      </select>
                    </div>
                    <div>
                      <label>Silhouette / Type</label>
                      <input name="type" required placeholder="e.g. Sarees, Suit sets, Blazers">
                    </div>
                    <div>
                      <label>Collection</label>
                      <select name="col">
                        <option value="wedding">Wedding Edit</option>
                        <option value="festive">Festive Wear</option>
                        <option value="everyday">Everyday Cotton</option>
                        <option value="work">Work Wardrobe</option>
                      </select>
                    </div>
                    <div>
                      <label>Selling Price (INR)</label>
                      <input name="price" type="number" required placeholder="6990">
                    </div>
                    <div>
                      <label>Original Price / MRP (Optional)</label>
                      <input name="old" type="number" placeholder="8490">
                    </div>
                    <div>
                      <label>Available Atelier Stock</label>
                      <input name="stock" type="number" value="8" required>
                    </div>
                    <div style="grid-column:1/-1">
                      <label>Fabric &amp; Craft Details</label>
                      <input name="fabric" placeholder="e.g. Pure Mulberry Silk with Antique Gold Zari Weave">
                    </div>
                    <div style="grid-column:1/-1">
                      <label>Garment Description</label>
                      <textarea name="desc" rows="3" placeholder="Artisanal description of the piece..."></textarea>
                    </div>

                    <!-- Image Upload Section -->
                    <div style="grid-column:1/-1">
                      <label>Product Photography Upload</label>
                      <div class="upload-dropzone" id="img-dropzone">
                        <p style="font-weight:500;color:var(--admin-charcoal)">Click or drag image file here to upload garment photography</p>
                        <p style="font-size:0.8rem;color:var(--admin-charcoal-muted);margin-top:0.3rem">JPEG, PNG, WebP up to 5MB</p>
                        <input type="file" id="image-file-input" accept="image/*" style="display:none">
                        <input type="hidden" name="image" id="uploaded-img-url" value="images/p1.jpg">
                      </div>
                      <img id="img-preview" class="preview-thumb" src="images/p1.jpg" alt="Preview" style="border:1px solid var(--admin-border)">
                    </div>

                    <div style="grid-column:1/-1;margin-top:1rem">
                      <button class="btn gold" type="submit">Publish to Atelier Catalog</button>
                    </div>
                  </form>
                </div>

                <!-- Atelier Catalog Table -->
                <div class="admin-surface-card">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem;flex-wrap:wrap;gap:0.8rem">
                    <div>
                      <h2>Atelier Garment Inventory Table (${productList.length} Creations)</h2>
                      <p class="muted">Live PostgreSQL catalog with instant stock adjustment and management.</p>
                    </div>
                  </div>

                  <div class="admin-table-wrap">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>Photo</th>
                          <th>Garment Name</th>
                          <th>Category &amp; Type</th>
                          <th>Price</th>
                          <th>Stock Level</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${productList.map(p => `
                          <tr>
                            <td>
                              <img src="${p.image || 'images/p1.jpg'}" alt="${esc(p.name)}" style="width:40px;height:52px;object-fit:cover;border-radius:4px;border:1px solid var(--admin-border)">
                            </td>
                            <td>
                              <strong>${esc(p.name)}</strong>
                              <div style="font-size:0.78rem;color:var(--admin-charcoal-muted)">${esc(p.fabric || 'Luxury weave')}</div>
                            </td>
                            <td>
                              <span class="admin-pill sage">${p.cat === 'ethnic' ? 'Ethnic' : 'Western'}</span>
                              <span style="font-size:0.82rem;color:var(--admin-charcoal-muted);margin-left:0.3rem">${esc(p.type || '')}</span>
                            </td>
                            <td>
                              <strong>${money(p.price)}</strong>
                              ${p.old ? `<span style="font-size:0.78rem;color:var(--admin-charcoal-muted);text-decoration:line-through;margin-left:0.3rem">${money(p.old)}</span>` : ''}
                            </td>
                            <td>
                              <div class="admin-stock-control">
                                <button class="admin-stock-btn dec-stock-btn" data-pid="${p.id}" data-current="${p.stock}">-</button>
                                <span class="admin-stock-num">${p.stock}</span>
                                <button class="admin-stock-btn inc-stock-btn" data-pid="${p.id}" data-current="${p.stock}">+</button>
                              </div>
                            </td>
                            <td>
                              <button class="link delete-product-btn" data-pid="${p.id}" style="color:#b91c1c;font-size:0.85rem;background:none;border:none;cursor:pointer">Remove</button>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;

              // Setup upload handler
              const dropzone = $('#img-dropzone');
              const fileInput = $('#image-file-input');
              const preview = $('#img-preview');
              const imgUrlInput = $('#uploaded-img-url');

              if (dropzone && fileInput) {
                dropzone.onclick = () => fileInput.click();
                fileInput.onchange = async () => {
                  if (!fileInput.files.length) return;
                  const file = fileInput.files[0];
                  const formData = new FormData();
                  formData.append('image', file);

                  try {
                    toast('Uploading garment photography...');
                    const res = await fetchAuth('/api/upload', {
                      method: 'POST',
                      body: formData
                    });
                    const d = await res.json();
                    if (!res.ok) throw new Error(d.error);
                    imgUrlInput.value = d.url;
                    preview.src = d.url;
                    toast('Image uploaded successfully.');
                  } catch (err) {
                    toast(err.message || 'Image upload failed.');
                  }
                };
              }

              // Create product submit
              $('#admin-product-form').onsubmit = async e => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.target));
                try {
                  const res = await fetchAuth('/api/products', {
                    method: 'POST',
                    body: d
                  });
                  const newP = await res.json();
                  if (!res.ok) throw new Error(newP.error);
                  PRODUCTS.push(newP);
                  toast(`New creation "${newP.name}" published to catalog!`);
                  renderTab('crud');
                } catch (err) {
                  toast(err.message || 'Could not create product.');
                }
              };

              // Quick Stock buttons
              $$('.inc-stock-btn').forEach(btn => {
                btn.onclick = async () => {
                  const pid = btn.dataset.pid;
                  const newStock = Number(btn.dataset.current) + 1;
                  try {
                    await fetchAuth(`/api/products/${pid}/stock`, { method: 'PUT', body: { stock: newStock } });
                    renderTab('crud');
                  } catch (err) { toast('Could not adjust stock'); }
                };
              });

              $$('.dec-stock-btn').forEach(btn => {
                btn.onclick = async () => {
                  const pid = btn.dataset.pid;
                  const newStock = Math.max(0, Number(btn.dataset.current) - 1);
                  try {
                    await fetchAuth(`/api/products/${pid}/stock`, { method: 'PUT', body: { stock: newStock } });
                    renderTab('crud');
                  } catch (err) { toast('Could not adjust stock'); }
                };
              });

              // Delete product handler
              $$('.delete-product-btn').forEach(btn => {
                btn.onclick = async () => {
                  if (!confirm('Are you sure you want to remove this garment from catalog?')) return;
                  const pid = btn.dataset.pid;
                  try {
                    const r = await fetchAuth(`/api/products/${pid}`, { method: 'DELETE' });
                    if (!r.ok) throw new Error((await r.json()).error);
                    toast('Garment removed from catalog.');
                    PRODUCTS = PRODUCTS.filter(p => Number(p.id) !== Number(pid));
                    renderTab('crud');
                  } catch (err) {
                    toast(err.message || 'Could not delete product.');
                  }
                };
              });

            } catch (err) {
              container.innerHTML = '<p class="muted">Could not load catalog.</p>';
            }
          }

          /* ==========================================================================
             ADMIN TAB 4: Promotional Coupons Management
             ========================================================================== */
          else if (tabName === 'coupons') {
            container.innerHTML = '<p class="muted">Loading promotional privileges...</p>';
            try {
              const res = await fetchAuth('/api/admin/coupons');
              const coupons = await res.json();
              const couponList = Array.isArray(coupons) ? coupons : [];

              container.innerHTML = `
                <!-- New Coupon Form -->
                <div class="admin-surface-card" style="margin-bottom:2rem">
                  <h2>Create Promotional Discount Privilege</h2>
                  <p class="muted" style="margin-bottom:1.4rem">Issue bespoke atelier promo discount codes for patrons.</p>
                  
                  <form id="create-coupon-form" style="display:grid;grid-template-columns:1fr 1fr;gap:1.2rem">
                    <div>
                      <label>Coupon Code (e.g. LUXURY25)</label>
                      <input name="code" required placeholder="ATELIER20" style="text-transform:uppercase">
                    </div>
                    <div>
                      <label>Discount Percentage (%)</label>
                      <input name="discountPercent" type="number" min="1" max="90" required placeholder="20">
                    </div>
                    <div>
                      <label>Minimum Order Threshold (INR)</label>
                      <input name="minOrderAmount" type="number" value="0" placeholder="5000">
                    </div>
                    <div>
                      <label>Description / Privilege Note</label>
                      <input name="description" placeholder="20% off bridal collections" required>
                    </div>
                    <div style="grid-column:1/-1;margin-top:0.4rem">
                      <button class="btn gold" type="submit">Issue Promo Privilege</button>
                    </div>
                  </form>
                </div>

                <!-- Coupons Table -->
                <div class="admin-surface-card">
                  <h2>Active Promotional Privileges (${couponList.length})</h2>
                  <div class="admin-table-wrap">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>Promo Code</th>
                          <th>Discount</th>
                          <th>Min Spend</th>
                          <th>Privilege Details</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${couponList.map(c => `
                          <tr>
                            <td><strong style="color:var(--admin-forest)">${esc(c.code)}</strong></td>
                            <td><strong>${c.discountPercent}% OFF</strong></td>
                            <td>${c.minOrderAmount > 0 ? money(c.minOrderAmount) : 'None'}</td>
                            <td>${esc(c.description || 'Promotional coupon')}</td>
                            <td>
                              <span class="admin-pill ${c.isActive ? 'forest' : 'warn'}">${c.isActive ? 'Active' : 'Disabled'}</span>
                            </td>
                            <td>
                              <button class="link delete-coupon-btn" data-cid="${c.id}" style="color:#b91c1c;font-size:0.85rem;background:none;border:none;cursor:pointer">Delete</button>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;

              $('#create-coupon-form').onsubmit = async e => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.target));
                d.code = d.code.toUpperCase().trim();
                try {
                  const r = await fetchAuth('/api/admin/coupons', { method: 'POST', body: d });
                  const data = await r.json();
                  if (!r.ok) throw new Error(data.error);
                  toast(`Coupon "${d.code}" successfully registered.`);
                  renderTab('coupons');
                } catch (err) {
                  toast(err.message || 'Could not create coupon.');
                }
              };

              $$('.delete-coupon-btn').forEach(btn => {
                btn.onclick = async () => {
                  if (!confirm('Are you sure you want to delete this promotional coupon?')) return;
                  try {
                    const r = await fetchAuth(`/api/admin/coupons/${btn.dataset.cid}`, { method: 'DELETE' });
                    if (!r.ok) throw new Error((await r.json()).error);
                    toast('Coupon deleted.');
                    renderTab('coupons');
                  } catch (err) {
                    toast(err.message || 'Could not delete coupon.');
                  }
                };
              });

            } catch (err) {
              container.innerHTML = '<p class="muted">Could not load promotional privileges.</p>';
            }
          }

          /* ==========================================================================
             ADMIN TAB 5: Patrons & Staff Roles Directory
             ========================================================================== */
          else if (tabName === 'users') {
            container.innerHTML = '<p class="muted">Loading patron & staff directory...</p>';
            try {
              const res = await fetchAuth('/api/admin/users');
              const users = await res.json();
              const userList = Array.isArray(users) ? users : [];

              container.innerHTML = `
                <div class="admin-surface-card">
                  <h2>Registered Patrons &amp; Staff Directory (${userList.length} Members)</h2>
                  <p class="muted" style="margin-bottom:1.4rem">Role-based access control and accounts registered in PostgreSQL.</p>

                  <div class="admin-table-wrap">
                    <table class="admin-table">
                      <thead>
                        <tr>
                          <th>User ID</th>
                          <th>Patron Name</th>
                          <th>Email Address</th>
                          <th>Phone</th>
                          <th>Access Role</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${userList.map(u => `
                          <tr>
                            <td>#${u.id}</td>
                            <td><strong>${esc(u.name)}</strong></td>
                            <td>${esc(u.email)}</td>
                            <td>${esc(u.phone || '—')}</td>
                            <td>
                              <select class="user-role-select" data-uid="${u.id}" style="width:auto;padding:0.35rem 0.6rem;font-size:0.85rem">
                                <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>Customer (Patron)</option>
                                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (Atelier Master)</option>
                              </select>
                            </td>
                            <td>
                              <button class="btn gold sm update-role-btn" data-uid="${u.id}">Apply Role</button>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;

              $$('.update-role-btn').forEach(btn => {
                btn.onclick = async () => {
                  const uid = btn.dataset.uid;
                  const sel = $(`.user-role-select[data-uid="${uid}"]`);
                  if (!sel) return;
                  const newRole = sel.value;
                  try {
                    const r = await fetchAuth(`/api/admin/users/${uid}/role`, {
                      method: 'PUT',
                      body: { role: newRole }
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    toast(`User #${uid} role updated to ${newRole}.`);
                    renderTab('users');
                  } catch (err) {
                    toast(err.message || 'Could not update role.');
                  }
                };
              });

            } catch (err) {
              container.innerHTML = '<p class="muted">Could not load users directory.</p>';
            }
          }

          /* ==========================================================================
             CUSTOMER / PERSONAL TAB: Orders & Tracking
             ========================================================================== */
          else if (tabName === 'orders') {
            container.innerHTML = '<p class="muted">Loading orders from atelier database...</p>';
            try {
              const res = await fetchAuth('/api/user/orders');
              const orders = await res.json();
              if (orders && orders.length) {
                container.innerHTML = orders.map(o => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const statusClass = (o.status || 'confirmed').toLowerCase().replace(/\s+/g, '-');
                  
                  // Tracking Steps Logic
                  const steps = ['Confirmed', 'In Atelier', 'Dispatched', 'Out for Delivery', 'Delivered'];
                  const currentIdx = steps.indexOf(o.status);

                  return `
                    <div class="account-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:1rem;margin-bottom:1.2rem;flex-wrap:wrap;gap:0.8rem">
                        <div>
                          <strong style="font-size:1.15rem;color:var(--wine)">Order #${o.id}</strong>
                          <span class="muted" style="margin-left:0.6rem;font-size:0.85rem">Placed on ${new Date(o.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:0.8rem">
                          <span class="order-badge ${statusClass}">${o.status}</span>
                          <strong style="color:var(--wine);font-size:1.1rem">${money(o.total)}</strong>
                        </div>
                      </div>

                      <!-- Visual Tracking Stepper -->
                      ${o.status !== 'Cancelled' ? `
                        <div class="tracking-stepper">
                          ${steps.map((s, idx) => {
                            const isDone = currentIdx >= idx;
                            const isCurrent = currentIdx === idx;
                            return `
                              <div class="tracking-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}">
                                <div class="tracking-dot">${isDone ? '✓' : idx + 1}</div>
                                <div class="tracking-label">${s}</div>
                              </div>
                            `;
                          }).join('')}
                        </div>
                      ` : `
                        <div style="background:#fee2e2;color:#991b1b;padding:0.8rem 1rem;border-radius:var(--radius-sm);margin:1rem 0;font-size:0.9rem">
                          Order Cancelled: ${esc(o.cancel_reason || 'Cancelled by request')}
                        </div>
                      `}

                      <div style="display:grid;gap:0.8rem;margin:1.4rem 0">
                        ${items.map(it => `
                          <div style="display:flex;align-items:center;gap:1rem;background:var(--ivory-soft);padding:0.8rem;border-radius:var(--radius-sm)">
                            <img src="${it.image || 'images/p1.jpg'}" alt="${esc(it.name)}" style="width:50px;height:65px;object-fit:cover;border-radius:4px">
                            <div style="flex:1">
                              <strong>${esc(it.name)}</strong>
                              <p class="muted" style="font-size:0.85rem">Size: ${it.size} · Shade: ${esc(it.color || 'Standard')} · Qty: ${it.quantity}</p>
                            </div>
                            <strong>${money(it.total || (it.price * it.quantity))}</strong>
                          </div>
                        `).join('')}
                      </div>

                      <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:1rem;flex-wrap:wrap;gap:0.8rem">
                        <span class="muted" style="font-size:0.85rem">
                          Tracking: <strong>${o.tracking_number || 'TRK-SS-PENDING'}</strong> · Payment: <strong>${(o.payment_method || 'COD').toUpperCase()}</strong> (${o.payment_status})
                        </span>
                        <div style="display:flex;gap:0.6rem">
                          ${['Confirmed', 'In Atelier'].includes(o.status) ? `
                            <button class="btn ghost sm cancel-order-btn" data-order-id="${o.id}" style="color:#b91c1c;border-color:#fca5a5">Cancel Order</button>
                          ` : ''}
                          ${o.status === 'Delivered' ? `
                            <button class="btn ghost sm return-order-btn" data-order-id="${o.id}" style="color:var(--wine)">Request Return</button>
                          ` : ''}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('');

                // Cancel Order Event Delegate
                $$('.cancel-order-btn').forEach(btn => {
                  btn.onclick = async () => {
                    const reason = prompt('Please specify reason for cancellation:', 'Changed my styling plans');
                    if (!reason) return;
                    try {
                      const res = await fetchAuth(`/api/orders/${btn.dataset.orderId}/cancel`, {
                        method: 'POST',
                        body: { reason }
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error);
                      toast(`Order #${btn.dataset.orderId} successfully cancelled.`);
                      renderTab('orders');
                    } catch (err) {
                      toast(err.message || 'Could not cancel order.');
                    }
                  };
                });

                // Return Order Event Delegate
                $$('.return-order-btn').forEach(btn => {
                  btn.onclick = async () => {
                    const reason = prompt('Please specify return reason (e.g. Size Exchange / Drape fit):', 'Size Exchange Needed');
                    if (!reason) return;
                    try {
                      const res = await fetchAuth(`/api/orders/${btn.dataset.orderId}/return`, {
                        method: 'POST',
                        body: { reason }
                      });
                      const d = await res.json();
                      if (!res.ok) throw new Error(d.error);
                      toast('Return request submitted. Our concierge will schedule courier pickup.');
                      renderTab('orders');
                    } catch (err) {
                      toast(err.message || 'Could not initiate return.');
                    }
                  };
                });
              } else {
                container.innerHTML = `
                  <div class="empty" style="text-align:center;padding:4rem 1rem">
                    <h3>No Atelier Orders Placed Yet</h3>
                    <p class="muted" style="margin:0.8rem 0 1.5rem">Your curated handcrafted garments and orders will appear here.</p>
                    <a class="btn gold" href="shop.html">Explore The Catalogue</a>
                  </div>
                `;
              }
            } catch {
              container.innerHTML = '<p class="muted">Could not retrieve order history at this time.</p>';
            }
          }

          /* ==========================================================================
             CUSTOMER / PERSONAL TAB: Saved Addresses
             ========================================================================== */
          else if (tabName === 'addresses') {
            container.innerHTML = '<p class="muted">Loading addresses from atelier database...</p>';
            try {
              const res = await fetchAuth('/api/user/addresses');
              const addresses = await res.json();

              container.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                  <h2>Delivery Addresses</h2>
                  <button class="btn gold sm" id="add-addr-modal-btn">+ Add New Address</button>
                </div>
                
                <div id="new-addr-form-box" style="display:none;background:#fff;border:1px solid var(--gold);padding:1.8rem;border-radius:var(--radius);margin-bottom:2rem">
                  <h3 style="margin-bottom:1rem">Add Bespoke Delivery Address</h3>
                  <form id="create-addr-form" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                    <div><label style="font-size:0.85rem;font-weight:600">Address Label</label><input name="label" placeholder="Home, Atelier, Work" value="Home" required></div>
                    <div><label style="font-size:0.85rem;font-weight:600">Recipient Name</label><input name="recipientName" placeholder="Full name" value="${esc(user.name)}" required></div>
                    <div><label style="font-size:0.85rem;font-weight:600">Contact Phone</label><input name="phone" placeholder="10-digit mobile" value="${esc(user.phone || '')}" required></div>
                    <div><label style="font-size:0.85rem;font-weight:600">PIN Code</label><input name="pincode" placeholder="400001" required></div>
                    <div style="grid-column:1/-1"><label style="font-size:0.85rem;font-weight:600">Address Line 1</label><input name="addressLine1" placeholder="Apartment, building, street" required></div>
                    <div><label style="font-size:0.85rem;font-weight:600">City</label><input name="city" placeholder="Mumbai" required></div>
                    <div><label style="font-size:0.85rem;font-weight:600">State</label><input name="state" placeholder="Maharashtra" required></div>
                    <div style="grid-column:1/-1;display:flex;gap:0.8rem;margin-top:0.6rem">
                      <button class="btn gold sm" type="submit">Save Address</button>
                      <button class="btn ghost sm" type="button" id="cancel-addr-btn">Cancel</button>
                    </div>
                  </form>
                </div>

                <div class="address-grid">
                  ${addresses && addresses.length ? addresses.map(a => `
                    <div class="address-box ${a.is_default ? 'is-default' : ''}">
                      <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
                        <strong style="color:var(--wine)">${esc(a.label)}</strong>
                        ${a.is_default ? '<span class="hero-pill" style="font-size:0.68rem;padding:0.15rem 0.5rem">Default</span>' : ''}
                      </div>
                      <p style="font-weight:600">${esc(a.recipient_name)}</p>
                      <p style="font-size:0.9rem;color:var(--esp-light);margin:0.3rem 0">${esc(a.address_line1)}</p>
                      <p style="font-size:0.9rem;color:var(--esp-light)">${esc(a.city)}, ${esc(a.state)} — ${a.pincode}</p>
                      <p style="font-size:0.85rem;color:var(--muted);margin-top:0.4rem">Phone: ${esc(a.phone)}</p>
                      <div style="margin-top:1rem;border-top:1px solid var(--line);padding-top:0.8rem">
                        <button class="link delete-addr-btn" data-addr-id="${a.id}" style="color:#b91c1c;font-size:0.82rem;background:none;border:none;cursor:pointer">Delete Address</button>
                      </div>
                    </div>
                  `).join('') : '<p class="muted">No saved addresses found. Add one for rapid one-click checkout.</p>'}
                </div>
              `;

              $('#add-addr-modal-btn').onclick = () => { $('#new-addr-form-box').style.display = 'block'; };
              $('#cancel-addr-btn').onclick = () => { $('#new-addr-form-box').style.display = 'none'; };

              $('#create-addr-form').onsubmit = async e => {
                e.preventDefault();
                const formData = Object.fromEntries(new FormData(e.target));
                try {
                  const r = await fetchAuth('/api/user/addresses', { method: 'POST', body: formData });
                  if (!r.ok) throw new Error((await r.json()).error);
                  toast('Delivery address saved successfully.');
                  renderTab('addresses');
                } catch (err) {
                  toast(err.message || 'Could not save address.');
                }
              };

              $$('.delete-addr-btn').forEach(b => {
                b.onclick = async () => {
                  if (!confirm('Are you sure you want to remove this address?')) return;
                  try {
                    await fetchAuth(`/api/user/addresses/${b.dataset.addrId}`, { method: 'DELETE' });
                    toast('Address removed.');
                    renderTab('addresses');
                  } catch {
                    toast('Could not delete address.');
                  }
                };
              });
            } catch {
              container.innerHTML = '<p class="muted">Failed to load addresses.</p>';
            }
          }

          /* ==========================================================================
             CUSTOMER / PERSONAL TAB: Curated Wishlist
             ========================================================================== */
          else if (tabName === 'wishlist') {
            container.innerHTML = '<div style="text-align:center;padding:3rem 1rem"><p class="muted">Loading your curated trousseau...</p></div>';
            try {
              const res = await fetchAuth('/api/user/wishlist');
              let items = [];
              if (res.ok) {
                items = await res.json();
                db.setWishlist(items.map(p => Number(p.id)));
              } else {
                items = db.getWishlist().map(byId).filter(Boolean);
              }

              if (items.length) {
                container.innerHTML = `
                  <div style="margin-bottom:1.5rem">
                    <h2>Saved Trousseau Pieces (${items.length})</h2>
                  </div>
                  <div class="grid">${items.map(card).join('')}</div>
                `;
              } else {
                container.innerHTML = `
                  <div class="empty" style="text-align:center;padding:4rem 1rem">
                    <h3>Your Wishlist is Empty</h3>
                    <p class="muted" style="margin:0.8rem 0 1.5rem">Curate your dream trousseau by tapping the heart icon on any piece.</p>
                    <a class="btn gold" href="shop.html">Explore The Catalogue</a>
                  </div>
                `;
              }
            } catch (err) {
              container.innerHTML = '<div class="empty" style="text-align:center;padding:3rem 1rem"><p class="muted">Could not load your wishlist.</p></div>';
            }
          }

          /* ==========================================================================
             CUSTOMER / PERSONAL TAB: Profile Details
             ========================================================================== */
          else if (tabName === 'profile') {
            container.innerHTML = `
              <div class="account-card" style="max-width:540px">
                <h2 style="margin-bottom:1.2rem">Patron Profile Specifications</h2>
                <form id="edit-profile-form" style="display:grid;gap:1.2rem">
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Full Name</label>
                    <input id="prof-name" value="${esc(user.name)}" required>
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Email Address (Read-only)</label>
                    <input value="${esc(user.email)}" disabled style="background:#f5f5f5">
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Contact Number</label>
                    <input id="prof-phone" value="${esc(user.phone || '')}" placeholder="+91 98765 43210">
                  </div>
                  <div>
                    <label style="font-size:0.85rem;font-weight:600">Account Tier</label>
                    <p style="color:${user.role === 'admin' ? 'var(--admin-forest)' : 'var(--gold-dark)'};font-weight:600">${user.role === 'admin' ? 'Atelier Master & Administrator' : 'VIP Patron Concierge'}</p>
                  </div>
                  <button class="btn gold" type="submit" style="margin-top:0.5rem">Update Profile</button>
                </form>
              </div>
            `;

            $('#edit-profile-form').onsubmit = async e => {
              e.preventDefault();
              const name = $('#prof-name').value;
              const phone = $('#prof-phone').value;
              try {
                const res = await fetchAuth('/api/auth/profile', {
                  method: 'PUT',
                  body: { name, phone }
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error);
                db.set('user', { ...user, name: d.name, phone: d.phone });
                toast('Profile updated successfully.');
                pages.login();
              } catch (err) {
                toast(err.message || 'Could not update profile.');
              }
            };
          }
        };

        $$('.account-tab-btn').forEach(b => {
          b.onclick = () => renderTab(b.dataset.tab);
        });

        renderTab(isAdmin ? 'overview' : 'orders');
        return;
      }
      // Guest / Unauthenticated: Tabbed Sign In / Register
      root.className = 'narrow';
      const renderAuth = (mode = 'in') => {
        root.innerHTML = `
          <div class="wrap" style="max-width:440px;margin:3.5rem auto;background:#fff;padding:2.5rem;border-radius:var(--radius);border:1px solid var(--line);box-shadow:var(--shadow-md)">
            <div class="tabs" style="display:flex;margin-bottom:1.5rem;border-bottom:1px solid var(--line)">
              <button style="flex:1;padding:0.75rem;background:none;border:none;border-bottom:2px solid ${mode === 'in' ? 'var(--gold)' : 'transparent'};font:600 1rem var(--sans);cursor:pointer;color:${mode === 'in' ? 'var(--wine)' : 'var(--muted)'}" data-m="in">Sign In</button>
              <button style="flex:1;padding:0.75rem;background:none;border:none;border-bottom:2px solid ${mode === 'up' ? 'var(--gold)' : 'transparent'};font:600 1rem var(--sans);cursor:pointer;color:${mode === 'up' ? 'var(--wine)' : 'var(--muted)'}" data-m="up">Create Account</button>
            </div>
            <form id="auth-form" style="display:grid;gap:1.2rem">
              ${mode === 'up' ? '<div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Full Name</label><input name="name" required placeholder="Meera Kapoor"></div>' : ''}
              <div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Email Address</label><input name="email" type="email" required placeholder="meera@example.com"></div>
              ${mode === 'up' ? '<div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Mobile Number (Optional)</label><input name="phone" placeholder="+91 98765 43210"></div>' : ''}
              <div><label style="display:block;margin-bottom:0.3rem;font-weight:500">Password</label><input name="password" type="password" required placeholder="••••••••"></div>
              <button class="btn gold block" type="submit" style="margin-top:0.5rem">${mode === 'in' ? 'Sign In to Atelier' : 'Join VIP Atelier'}</button>
            </form>
            <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--line);font-size:0.85rem;color:var(--muted);text-align:center">
              Demo Patron: <strong>meera@example.com</strong> / <strong>password123</strong>
            </div>
          </div>`;

        $$('[data-m]').forEach(b => b.onclick = () => renderAuth(b.dataset.m));

        $('#auth-form').onsubmit = async e => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target));
          const endpoint = mode === 'in' ? '/api/auth/login' : '/api/auth/register';

          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            db.setToken(data.token);
            db.set('user', data.user);
            await syncUserWishlist();
            const localCart = db.get('cart', []);
            if (localCart.length) {
              fetchAuth('/api/cart/sync', { method: 'POST', body: { items: localCart } }).catch(() => {});
            }
            toast(`Welcome, ${data.user.name}!`);
            mountChrome();
            pages.login();
          } catch (err) {
            toast(err.message || 'Authentication error. Please retry.');
          }
        };
      };

      renderAuth();
    },

    /* ---------- Dedicated Atelier Admin Dashboard ---------- */
    async admin() {
      const user = db.get('user', null);
      const token = db.token();
      if (!user || !token || user.role !== 'admin') {
        const root = $('#auth');
        if (!root) return;
        document.body.classList.add('admin-dashboard-theme');
        const siteHeader = $('#site-header');
        if (siteHeader) {
          siteHeader.innerHTML = '';
          siteHeader.style.display = 'none';
        }
        root.className = 'narrow';
        root.innerHTML = `
          <div class="wrap" style="max-width:440px;margin:3.5rem auto;background:var(--admin-sage);padding:2.5rem;border-radius:var(--radius);border:1px solid var(--admin-border);box-shadow:0 4px 16px rgba(55,59,56,0.1);color:var(--admin-charcoal)">
            <div style="text-align:center;margin-bottom:1.5rem">
              <span class="admin-role-badge">Atelier Management Portal</span>
              <h2 style="font-family:var(--serif);margin-top:0.4rem;color:var(--admin-charcoal)">Admin Sign In</h2>
              <p class="muted" style="font-size:0.88rem;color:var(--admin-charcoal-muted)">Restricted access for Atelier administrators and curators.</p>
            </div>
            <form id="admin-direct-login-form" style="display:grid;gap:1.2rem">
              <div>
                <label style="font-weight:600;font-size:0.85rem">Admin Email</label>
                <input name="email" type="email" value="admin@satinostitch.com" required>
              </div>
              <div>
                <label style="font-weight:600;font-size:0.85rem">Password</label>
                <input name="password" type="password" value="admin123" required>
              </div>
              <button class="btn gold block" type="submit" style="background-color:var(--admin-forest)!important;color:#fff!important;border-color:var(--admin-forest)!important">Sign In as Atelier Admin</button>
              <div style="text-align:center;margin-top:0.6rem">
                <a href="index.html" style="font-size:0.84rem;color:var(--admin-forest);text-decoration:none;font-weight:500">&larr; Return to SATINOSTITCH Store</a>
              </div>
            </form>
          </div>`;

        $('#admin-direct-login-form').onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target));
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (data.user.role !== 'admin') throw new Error('Account does not possess administrator privileges.');
            db.setToken(data.token);
            db.set('user', data.user);
            toast('Welcome, Atelier Master!');
            mountChrome();
            pages.admin();
          } catch (err) {
            toast(err.message || 'Authentication error.');
          }
        };
        return;
      }
      pages.login();
    },

    /* ---------- Module 5: Concierge Inquiries ---------- */
    contact() {
      const f = $('#contact-form');
      if (f) {
        f.onsubmit = async e => {
          e.preventDefault();
          try {
            const res = await fetch('/api/contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
            });
            if (!res.ok) throw new Error((await res.json()).error);
            f.reset();
            toast('Your inquiry has reached our senior couture concierge. Expect a response within 4 hours.');
          } catch (err) {
            toast(err.message || 'Message could not be sent. Please retry.');
          }
        };
      }
    }
  };

  /* ---------- System & Database Health Check ---------- */
  async function checkSystemHealth() {
    const badge = $('#system-health-badge');
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (badge) {
          badge.innerHTML = `<span class="health-dot health-ok"></span> Server &amp; DB: Online`;
          badge.title = `Database: ${data.database?.name || 'satinostitch'} (${data.database?.productsCount || 12} products, ${data.database?.categoriesCount || 2} categories)`;
        }
      } else {
        if (badge) {
          badge.innerHTML = `<span class="health-dot health-warn"></span> DB Degraded`;
          badge.title = data.database?.error || 'Database connection degraded';
        }
      }
      return data;
    } catch (err) {
      if (badge) {
        badge.innerHTML = `<span class="health-dot health-err"></span> Server Offline`;
        badge.title = err.message || 'Cannot connect to server';
      }
    }
  }
  window.checkSystemHealth = checkSystemHealth;

  /* ---------- Initialization & Boot ---------- */
  mountChrome();
  checkSystemHealth();
  const page = document.body.dataset.page;
  const needsData = ['home', 'collections', 'shop', 'product', 'wishlist', 'cart', 'checkout', 'login', 'admin'].includes(page);

  // Clean up legacy global ss_wish
  localStorage.removeItem('ss_wish');

  // If user is already logged in, sync their database wishlist on page load
  const initWishlistPromise = (db.token() && db.user())
    ? syncUserWishlist()
    : Promise.resolve().then(() => db.clearGuestWishlist());

  (needsData
    ? fetch('/api/products').then(r => r.json()).then(d => { PRODUCTS = d; })
    : Promise.resolve()
  )
    .then(() => initWishlistPromise)
    .then(() => pages[page]?.())
    .catch(() => {
      const m = $('main');
      if (m) m.innerHTML = '<div class="empty wrap" style="text-align:center;padding:5rem 1rem"><h2>Catalogue Temporarily Unavailable</h2><p class="muted">Please ensure the backend server is running on port 3000.</p></div>';
    });
})();
