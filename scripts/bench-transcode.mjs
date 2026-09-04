/**
 * Transcode benchmark for the FFmpeg engine behind src/lib/ffmpeg.ts.
 *
 * Serves reference media from public/, drives the real lib functions in
 * headless Chromium, and prints load + per-task timings. Re-run unchanged
 * to compare engine variants (single-thread vs multithreaded core).
 *
 * Usage:
 *   1. Place reference files in public/: ref-audio.mp3, ref-small.mp4,
 *      ref-720p.mp4 (see README section below for how they were generated)
 *   2. Ensure the dev server is running: pnpm dev
 *   3. pnpm exec node scripts/bench-transcode.mjs
 *   4. Delete the reference files from public/ afterwards.
 *
 * Reference media (generate with system ffmpeg):
 *   ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=10 \
 *     -f lavfi -i sine=frequency=440:duration=2 -pix_fmt yuv420p ref-small.mp4
 *   ffmpeg -f lavfi -i testsrc=duration=30:size=1280x720:rate=30 \
 *     -f lavfi -i sine=frequency=440:duration=30 -pix_fmt yuv420p ref-720p.mp4
 *   ref-audio.mp3 = e2e/fixtures/file_example_MP3_700KB.mp3
 *
 * Single-thread baseline (2026-09-03, headless Chromium, dev server):
 *   engine load: 0.3s
 *   audio mp3->wav (700KB): 0.1s
 *   video small mp4->mp4: 0.1s
 *   video small mp4->webm: 0.1s
 *   video 720p30s mp4->mp4: 21.1s   <-- the multithreading opportunity
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) =>
  console.log('PAGEERROR:', String(e).slice(0, 200)),
);
await page.goto('http://localhost:3000/');
const rows = await page.evaluate(async () => {
  const lib = await import('/src/lib/ffmpeg.ts');
  const out = [];
  const time = async (label, fn) => {
    const t0 = performance.now();
    try {
      const r = await fn();
      out.push(
        `${label}: OK ${((performance.now() - t0) / 1000).toFixed(1)}s ${r}`,
      );
    } catch (e) {
      out.push(
        `${label}: FAIL ${((performance.now() - t0) / 1000).toFixed(1)}s ${(e && e.message ? e.message : String(e)).slice(0, 120)}`,
      );
    }
  };
  const load = async (url, name) => {
    const ab = await fetch(url).then((r) => r.arrayBuffer());
    return new File([ab], name);
  };
  let t0 = performance.now();
  await lib.getFFmpeg();
  out.push(`engine load: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  const audio = await load('/ref-audio.mp3', 'a.mp3');
  const small = await load('/ref-small.mp4', 'small.mp4');
  const big = await load('/ref-720p.mp4', 'big.mp4');
  out.push(`files: audio=${audio.size} small=${small.size} big=${big.size}`);
  await time('audio mp3->wav (700KB)', async () => {
    const blob = await lib.convertAudio(audio, 'wav');
    return `bytes=${blob.size}`;
  });
  await time('video small mp4->mp4', async () => {
    const r = await lib.convertVideo(small, 'mp4', 'video/mp4');
    return `out=${r.name}`;
  });
  await time('video small mp4->webm', async () => {
    const r = await lib.convertVideo(small, 'webm', 'video/webm');
    return `out=${r.name}`;
  });
  await time('video 720p30s mp4->mp4', async () => {
    const r = await lib.convertVideo(big, 'mp4', 'video/mp4');
    return `out=${r.name}`;
  });
  return out;
});
console.log(rows.join('\n'));
await browser.close();
