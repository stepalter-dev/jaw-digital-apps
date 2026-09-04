# Molly's Field Journal — unlisted, not removed

This journal was made for one person. It is **still deployed and still works** at
`/jaw-digital-apps/rdr2/`, and any progress saved in a browser is untouched — the app
uses the same origin it always did, so bookmarks and `localStorage` both survive.

What changed is that it is no longer *advertised*: it's off the marketing lineup, off
the in-app home screen, out of the mobile bundle, and marked `noindex` so it won't turn
up in search results.

## What was taken out

| Where | What was removed |
|---|---|
| `index.html` | The RDR2 card from the journals grid |
| `www/index.html` | The RDR2 row from the in-app home screen |
| `www/rdr2` | The symlink that put it in the Capacitor build |
| `www/manifest.json` | "Red Dead Redemption 2" from the PWA description |
| `package.json` | "RDR2" from the app description |
| `APP-STORE-READINESS.md` | "RDR2" from the wrapped-journal list |
| `studio-nav.js` | Excluded from the `JOURNALS` array (the "More journals" strip) |
| `robots.txt` | Added `Disallow: /jaw-digital-apps/rdr2/` |
| `rdr2/index.html` | Added `<meta name="robots" content="noindex, nofollow" />` |

Nothing under `rdr2/` was deleted, and `screenshots/rdr2.jpg` was kept so the card below
can be pasted straight back in.

## Putting it back in the group

**1. The lineup card** — paste into the `.grid` in `index.html`, in whatever running
order you want it:

```html
        <div class="card">
          <a class="thumb-link" href="rdr2/" target="_blank" rel="noopener"><img src="screenshots/rdr2.jpg" alt="Molly's Field Journal screenshot" loading="lazy" /></a>
          <div class="card-body">
            <div class="name">🤠 Molly's Field Journal</div>
            <div class="desc">Red Dead Redemption 2 companion — compendium, challenges, 100% mission tips, treasure maps, and an Arthur/John toggle.</div>
            <div class="row"><a class="view" href="rdr2/" target="_blank" rel="noopener">Open journal →</a><span class="badge">Free + Pro sync</span></div>
          </div>
        </div>
```

**2. The in-app home screen** — paste into the card list in `www/index.html`:

```html
      <a class="card" href="rdr2/index.html"><img src="screenshots/rdr2.jpg" alt="" /><div class="card-text"><div class="name">🤠 Molly's Field Journal</div><div class="game">Red Dead Redemption 2</div></div></a>
```

**3. The studio strip** — add back to the `JOURNALS` array in `studio-nav.js`:

```js
    { slug: 'rdr2',      icon: '🤠', name: "Molly's Field Journal", game: 'Red Dead 2' },
```

**4. The mobile bundle** — recreate the symlink (on Linux/macOS, or Windows with
`core.symlinks=true`):

```bash
ln -s ../rdr2 www/rdr2 && git add www/rdr2
```

**5. Let it be indexed again** — drop the `Disallow` line from `robots.txt`, remove the
`robots` meta from `rdr2/index.html`, add the canonical and Open Graph tags to match the
other journals, and add its URL to `sitemap.xml`.

**6. Counts and copy** — the lineup heading, the hero stat block, and the pricing copy
all say **six**. If RDR2 rejoins, they go back to seven:

- `index.html` — "Six games, six journals" → "Seven games, seven journals"
- `index.html` — hero stat `6 / Journals live` → `7 / Journals live`
- `index.html` — "or $20 for all six" → "all seven", "All 6 journals" → "All 7 journals",
  "$20 / all 6 journals" → "all 7 journals"
- `www/manifest.json`, `package.json`, `APP-STORE-READINESS.md` — add RDR2 back to the
  game lists

## One thing worth knowing either way

The footer used to read `JAW + MNB 2024`. It now reads:

> A record kept for one outlaw of the Van der Linde gang by JAW Digital — for MNB

That keeps the dedication but drops the stale year and matches how every other journal
signs off. Change the wording freely — it's her journal.
