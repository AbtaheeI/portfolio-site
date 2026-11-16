# abtaheeislam.com

My portfolio. Static HTML, CSS and a little JavaScript, hosted on Vercel.

- `index.html`, `work/`, `status/`: the pages
- `src/map3d.js`: the 3D liveability map, bundled with esbuild into `assets/map3d.js`
- `data/sa2.json`: 66 SA2 regions exported from my liveability index (simplified polygons, scores)
- `scripts/`: build, copy check, uptime check, build recorder
- `.github/workflows/checks.yml`: build, copy rules, HTML validation, link check, Lighthouse (3 runs, median against budget) on every push
- `.github/workflows/uptime.yml`: checks the live site on a schedule (GitHub decides the exact timing, often every few hours on a free account) and writes to the `status-data` branch, which the status page reads

## Local

```
npm install
npm run build
npx http-server _site
```

## Regenerating the map poster

Open `tools/poster.html` from a local server and screenshot the 1200 x 1200 canvas to `assets/map-poster.webp` and `assets/map-poster-640.webp`.
