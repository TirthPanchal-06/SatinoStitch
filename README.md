# SATINOSTITCH

Ethnic and western wear storefront. Plain HTML, CSS and JavaScript on the front end, a small Express server behind it.

    npm install
    npm start        # http://localhost:3000

- `public/` pages, `css/style.css`, `js/app.js` (one script, one init per page)
- `data/products.json` catalogue, served by `GET /api/products`
- `server.js` also exposes `/api/products/:id`, `POST /api/orders`, `POST /api/contact`

Cart, wishlist and the demo login live in localStorage. Orders and messages are only logged in memory; swap in a database and a real `/api/auth` before going live. Promo code: `HERITAGE10`.
