// Regenerates the Perf Clinic's images from the original PNGs in ./source.
//
//   cd tools/optimize-images && npm install && npm run optimize
//
// Hero: AVIF and WebP at four widths for <picture srcset>, plus a JPEG fallback, so each
// screen downloads roughly the pixels it shows instead of one 4.27 MB, 1700 px PNG.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, 'source')
const assets = join(here, '..', '..', 'perf-clinic', 'assets')

const HERO_WIDTHS = [640, 1024, 1440, 1700]
for (const width of HERO_WIDTHS) {
  const hero = sharp(join(source, 'hero.png')).resize({ width })
  await hero.clone().avif({ quality: 50, effort: 6 }).toFile(join(assets, `hero-${width}.avif`))
  await hero.clone().webp({ quality: 72, effort: 6 }).toFile(join(assets, `hero-${width}.webp`))
}
await sharp(join(source, 'hero.png'))
  .resize({ width: 1440 })
  .jpeg({ quality: 76, mozjpeg: true })
  .toFile(join(assets, 'hero-1440.jpg'))

console.log('Images written to perf-clinic/assets/')
