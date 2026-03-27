# Release Checklist — @eslopemap/maplibre-gl

Run through this checklist **top to bottom** before every `npm publish`.

## 1. Decide the new version

Follow semver relative to upstream maplibre-gl-js:
- `5.x.y.z` patch → increment our `.z` suffix (e.g. `5.21.3` → `5.21.4`)
- Upstream minor bump → reset suffix to `5.x.y.0`

---

## 2. Bump the version in every file that contains it

Run this to find all hardcoded version strings (catches what grep misses):

```bash
grep -rn "5\.\d\+\.\d\+" package.json slope-builtin-published.html src/ \
  --include="*.ts" --include="*.html" --include="*.json" | grep -v node_modules | grep -v "\.g\.ts"
```

Files that **must** be updated:

- [ ] `package.json` → `"version": "X.Y.Z"`
- [ ] `slope-builtin-published.html` → both `<script src>` and `<link href>` unpkg URLs
- [ ] Any other demo HTML using the CDN URL (search: `unpkg.com/@eslopemap`)

---

## 3. Rebuild the production bundle

The version is baked into the JS bundle at build time. Skipping this publishes
the correct `package.json` but the wrong `maplibregl.getVersion()` string.

```bash
npm run build-prod       # mandatory: bakes version into dist/maplibre-gl.js
npm run build-csp        # recommended: CSP variant
# optional full rebuild:
# npm run build-dist
```

**Verify** after build:

```bash
grep -o "5\.[0-9]\+\.[0-9]\+" dist/maplibre-gl.js | head -3
# → should print the new version, not the old one
```

---

## 4. Commit

```bash
git add package.json slope-builtin-published.html dist/maplibre-gl.js dist/maplibre-gl.csp.js
git commit -m "chore: release X.Y.Z — <one-line summary of what's in this release>"
```

---

## 5. Tag

```bash
git tag vX.Y.Z
git push origin blend --tags   # or your working branch
```

---

## 6. Publish to npm

```bash
npm publish --access public
```

**Verify** the publish succeeded:

```bash
npm info @eslopemap/maplibre-gl dist-tags
# → latest: X.Y.Z
```

---

## 7. Smoke-test the CDN URL

unpkg takes a minute or two to propagate. Then:

```bash
curl -sI "https://unpkg.com/@eslopemap/maplibre-gl@X.Y.Z/dist/maplibre-gl.js" \
  | grep -E "HTTP|content-length"
# → HTTP/2 200, non-zero content-length
```

Open `slope-builtin-published.html` in a browser (it now references the CDN directly).

---

## 8. Update the published demo `slope-builtin-published.html`

Make sure the CDN URL already reflects `@X.Y.Z` before committing (step 4).
Do **not** leave a `@latest` or old version reference in that file.

---

## Common mistakes (and how to detect them)

| Mistake | Symptom | Detection |
|--------|---------|-----------|
| Forgot to `build-prod` after version bump | `maplibregl.getVersion()` returns old version | `grep -o "5\.[0-9]\+\.[0-9]\+" dist/maplibre-gl.js` |
| Demo HTML still on old CDN version | Published page loads old buggy code | `grep "unpkg.com" slope-builtin-published.html` |
| Published .tgz from wrong branch | Missing commits | `npm pack --dry-run` and inspect file list |
| Forgot `--access public` | Package published as private (fails for scoped) | `npm info @eslopemap/maplibre-gl` returns 404 |
