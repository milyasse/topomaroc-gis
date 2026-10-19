// Rendu image par image de tools/video/stage.html → MP4 (ffmpeg), ou captures de contrôle.
// Usage : node tools/video/render.mjs --fmt=16x9 [--base=http://127.0.0.1:8080/] [--fps=30] [--out=build/16x9/video.mp4]
//         node tools/video/render.mjs --fmt=16x9 --preview=2,15,30 --dir=apercu
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

let pw;
try { pw = await import('playwright'); } catch {
  pw = (await import('/home/claude/.npm-global/lib/node_modules/playwright/index.js')).default;
}
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d ?? ''}`).split('=').slice(1).join('=');
const FMT = arg('fmt', '16x9');
const BASE = arg('base', 'http://127.0.0.1:8080/').replace(/\/?$/, '/');
const FPS = Number(arg('fps', '30'));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BUILD = path.join(ROOT, 'tools/video/build', FMT);
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/video/scenes.json'), 'utf8'));
const { width: W, height: H } = data.formats[FMT];
const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;

const browser = await pw.chromium.launch({ executablePath: exe, args: ['--force-color-profile=srgb', '--disable-lcd-text'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`${BASE}tools/video/stage.html?fmt=${FMT}&render=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const total = await page.evaluate(() => window.__duration);
const events = await page.evaluate(() => window.__events);
fs.mkdirSync(BUILD, { recursive: true });
fs.writeFileSync(path.join(BUILD, 'events.json'), JSON.stringify({ total, events }, null, 1));

const preview = arg('preview', '');
if (preview) {
  const dir = path.join(BUILD, arg('dir', 'apercu')); fs.mkdirSync(dir, { recursive: true });
  for (const t of preview.split(',').map(Number)) {
    await page.evaluate((t) => window.__seek(t), t);
    await page.screenshot({ path: path.join(dir, `t${t.toFixed(1).padStart(6, '0')}.png`) });
  }
  console.log(`aperçus : ${dir} (durée ${total.toFixed(1)} s)`);
  await browser.close(); process.exit(0);
}

const out = arg('out', path.join(BUILD, 'video-muet.mp4'));
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const n = Math.ceil(total * FPS);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__seek(t), i / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * 10) === 0) console.log(`${(i / FPS).toFixed(0)} s / ${total.toFixed(0)} s — ${((Date.now() - t0) / 1000).toFixed(0)} s écoulées`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`vidéo muette : ${out} (${n} images, ${total.toFixed(2)} s)`);
