import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { deriveRibbonFromSeed } from '../../src/lib/asset-generator/random';
import { buildPath } from '../../src/lib/asset-generator/curve';
import { buildStamp, drawRibbonLayer, fillBackground } from '../../src/lib/asset-generator/render';
import { serverCanvasFactory, getServerContext, loadImageAsCanvas, cropToAlphaBounds } from './serverCanvas';
import { brandLetterSvgMarkup } from './brandLetters.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CARDS_CONFIG = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    name: '성수 가을 숲길 돔 에디션',
    width: 720,
    height: 900,
    bg: '#431407',
    startColor: '#9a3412',
    endColor: '#f59e0b',
    seed: 20261022,
    letter: 'J',
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    name: '주말 스페셜 리워드 티켓',
    width: 960,
    height: 540,
    bg: '#022c22',
    startColor: '#059669',
    endColor: '#34d399',
    seed: 777888,
    letter: 'A',
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    name: '새벽 안개 브리즈 런 박스',
    width: 720,
    height: 900,
    bg: '#0f172a',
    startColor: '#4338ca',
    endColor: '#38bdf8',
    seed: 555111,
    letter: 'M',
  },
];

async function generateCardVideo(card) {
  console.log(`\n========================================`);
  console.log(`[Asset Generator] Generating motion video for: ${card.name} (${card.id})`);
  console.log(`Dimensions: ${card.width}x${card.height}, BG: ${card.bg}, Start: ${card.startColor}, End: ${card.endColor}`);

  const tmpDir = path.join('/tmp', `asset-gen-card-${card.id}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const random = deriveRibbonFromSeed(card.seed);
  const rawBase = await loadImageAsCanvas(Buffer.from(brandLetterSvgMarkup(card.letter)));
  const base = cropToAlphaBounds(rawBase);
  if (!base) throw new Error('Failed to crop base letter');

  const stamp = buildStamp(serverCanvasFactory, {
    base,
    blurPct: random.blurPct,
    direction: random.direction,
    startColor: card.startColor,
    endColor: card.endColor,
  });

  const curvePath = buildPath(random.seed, random.irregularityPct, card.width, card.height);
  const FPS = 30;
  const DURATION_SEC = 3;
  const TOTAL_FRAMES = FPS * DURATION_SEC; // 90 frames

  console.log(`Rendering ${TOTAL_FRAMES} frames...`);
  const t0 = Date.now();

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const fraction = f / TOTAL_FRAMES;
    const head = (fraction * curvePath.total) % curvePath.total;

    const canvas = serverCanvasFactory(card.width, card.height);
    const ctx = getServerContext(canvas);

    fillBackground(ctx, card.width, card.height, card.bg);
    drawRibbonLayer(ctx, {
      stamp,
      baseWidth: base.width,
      baseHeight: base.height,
      sizePct: random.sizePct,
      rotationDeg: random.rotationDeg,
      followPath: random.followPath,
      path: curvePath,
      head,
      gap: random.gap,
      count: random.count,
      stageWidth: card.width,
      stageHeight: card.height,
    });

    const frameBuffer = canvas.toBuffer('image/png');
    const framePath = path.join(tmpDir, `frame_${String(f).padStart(4, '0')}.png`);
    writeFileSync(framePath, frameBuffer);
  }

  const renderElapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`Rendered ${TOTAL_FRAMES} frames in ${renderElapsed}s`);

  const outputMp4 = path.join(tmpDir, 'output.mp4');
  console.log(`Encoding MP4 with ffmpeg...`);
  execSync(
    `/opt/homebrew/bin/ffmpeg -y -framerate ${FPS} -i "${tmpDir}/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p -b:v 2000k -movflags +faststart "${outputMp4}"`,
    { stdio: 'pipe' }
  );

  const videoBuffer = await (await import('node:fs/promises')).readFile(outputMp4);
  console.log(`MP4 encoded! Size: ${(videoBuffer.length / 1024).toFixed(1)} KB`);

  // Upload to Supabase Storage: images / today_cards/asset-generator/{id}.mp4
  const storagePath = `today_cards/asset-generator/${card.id}.mp4`;
  console.log(`Uploading to storage bucket 'images': ${storagePath}`);

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(storagePath);
  const mediaUrl = `${publicUrl}?v=${Date.now()}`;

  console.log(`Uploaded! Public URL: ${mediaUrl}`);

  // Update today_cards table
  console.log(`Updating today_cards row...`);
  const { error: updateError } = await supabase
    .from('today_cards')
    .update({
      cover_image_url: mediaUrl,
      image_source: 'admin-generator',
    })
    .eq('id', card.id);

  if (updateError) {
    throw new Error(`Database update failed: ${updateError.message}`);
  }

  console.log(`[Success] Card ${card.name} updated with Asset Generator video!`);
  rmSync(tmpDir, { recursive: true, force: true });

  return { id: card.id, name: card.name, mediaUrl, sizeBytes: videoBuffer.length };
}

async function main() {
  const results = [];
  for (const card of CARDS_CONFIG) {
    try {
      const res = await generateCardVideo(card);
      results.push(res);
    } catch (err) {
      console.error(`Error processing ${card.name}:`, err);
      process.exit(1);
    }
  }

  console.log('\n========================================');
  console.log('ALL VIDEOS GENERATED & REGISTERED SUCCESSFULLY!');
  console.log(JSON.stringify(results, null, 2));
}

main();
