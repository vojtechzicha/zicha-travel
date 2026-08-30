// Renders the PWA icon set into public/icons/ from the brand mark (the
// amber map pin from public/favicon.svg) on a dark slate ground — the same
// palette the site itself uses. Run `pnpm icons:pwa` after changing the
// artwork; the generated PNGs are committed, the script only exists so the
// set stays reproducible.
//
// Sizes: 192 + 512 for the manifest (purpose "any"), 192 + 512 maskable
// (pin shrunk into the ~80% safe zone so launcher masks never clip it),
// 180 apple-touch-icon (iOS ignores the manifest icons and rounds the
// corners itself, so it gets the full-bleed square).
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

// The favicon's pin path lives in a 24x24 viewBox; scale is applied around
// the box center so "any" icons fill more of the tile than maskable ones.
function iconSvg({ size, pinScale }) {
  const translate = (24 - 24 * pinScale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e293b"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="24" height="24" fill="url(#bg)"/>
  <g transform="translate(${translate} ${translate}) scale(${pinScale})">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#d97706"/>
    <circle cx="12" cy="9" r="2.5" fill="#fff"/>
  </g>
</svg>`
}

async function render(name, size, pinScale) {
  const svg = iconSvg({ size, pinScale })
  const png = await sharp(Buffer.from(svg), { density: (72 * size) / 24 })
    .resize(size, size)
    .png()
    .toBuffer()
  await writeFile(path.join(outDir, name), png)
  console.log(`wrote public/icons/${name} (${png.length} B)`)
}

await mkdir(outDir, { recursive: true })
await render('icon-192.png', 192, 0.82)
await render('icon-512.png', 512, 0.82)
await render('icon-maskable-192.png', 192, 0.62)
await render('icon-maskable-512.png', 512, 0.62)
await render('apple-touch-icon.png', 180, 0.72)
