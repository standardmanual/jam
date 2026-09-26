/**
 * 홈피드 카드 원샷 — 인자 파싱·묶음 작성·dry-run 검증 결과 요약 (티켓 20260926_1544)
 *
 * 렌더러만 예시 폴더의 작은 image.png를 돌려주는 스텁이고, dry-run은 실제 등록 흐름(`runHomeFeedRegister`,
 * supabase 없이)이다 — 요약 형식이 바뀌면 `extractDryRunFacts` 시험이 실패해 알려 준다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertBadgeImageToWebp } from '../../../src/lib/admin/badgeImageWebp';
import { parseRegisterArgs } from '../registerArgs.mjs';
import { runHomeFeedRegister } from '../registerHomeFeedFlow.mjs';
import { parseMakeCardArgs, seedFromBundleId, toKstIsoString } from '../makeHomeFeedCardArgs.mjs';
import { extractDryRunFacts, makeHomeFeedCard } from '../makeHomeFeedCardFlow.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-home-feed-bundle');
const FIXTURE_BUNDLE = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'bundle.json'), 'utf8'));
const FIXTURE_PNG = fs.readFileSync(path.join(FIXTURE_DIR, 'image.png'));
const PRESET_ID = '11111111-1111-4111-8111-111111111111';
const NOW_MS = Date.UTC(2026, 8, 26, 6, 30, 5); // 2026-09-26 15:30:05 KST

const CARD_JSON = JSON.stringify(FIXTURE_BUNDLE.card);
const META = {
  color_rationale_link: FIXTURE_BUNDLE.color_rationale_link,
  world_review: FIXTURE_BUNDLE.world_review,
};

function baseArgv(outDir: string, extra: string[] = []) {
  return [
    '--preset', PRESET_ID, '--bg', '#8a5a2e', '--end', '#3d2812', '--text01', '예시 카드', '--text02', '짧은 설명',
    '--card', CARD_JSON, '--meta', JSON.stringify(META), '--out-dir', outDir, ...extra,
  ];
}

/** 실제 등록 흐름의 --dry-run을 supabase 없이 돌려 `{ exitCode, log, error }`로 돌려준다. */
async function realDryRun(bundleFile: string) {
  const log: string[] = [];
  const error: string[] = [];
  const exitCode = await runHomeFeedRegister({
    args: parseRegisterArgs(['--bundle', bundleFile, '--dry-run']),
    supabase: null,
    convertToWebp: convertBadgeImageToWebp,
    randomUUID: () => 'unused',
    now: () => NOW_MS,
    out: { log: (t: string) => log.push(t), error: (t: string) => error.push(t) },
  });
  return { exitCode, log: log.join('\n'), error: error.join('\n') };
}

function stubDeps(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    deps: {
      renderPng: async (renderArgs: Record<string, unknown>) => {
        calls.push(renderArgs);
        return { buffer: FIXTURE_PNG, seed: renderArgs.seed, stage: { w: 1280, h: 1280 }, presetSource: 'admin-api' };
      },
      runDryRun: realDryRun,
      now: () => NOW_MS,
      ...overrides,
    },
  };
}

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'make-home-feed-card-'));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('parseMakeCardArgs', () => {
  const OUT = '/tmp/2026-10-05-weekly-card';

  it('필수 인자를 주면 파싱하고 값 맵·시드는 비워 둔다(텍스트 값은 필수가 아니다)', () => {
    const result = parseMakeCardArgs([
      '--preset', 'p1', '--bg', '#8a5a2e', '--end', '#3d2812', '--card', '{"title":"t"}', '--out-dir', OUT,
    ]);
    expect(result).toEqual({
      preset: 'p1', bg: '#8a5a2e', end: '#3d2812', values: {},
      card: { title: 't' }, meta: {}, outDir: OUT, seed: undefined,
    });
  });

  it('--text01·--text02·--img01을 값 맵으로 파싱한다', () => {
    const result = parseMakeCardArgs([
      '--preset', 'p1', '--bg', '#8a5a2e', '--end', '#3d2812', '--text01', '제목', '--img01', '/abs/a.png', '--text02', '설명',
      '--card', '{}', '--out-dir', OUT,
    ]);
    expect(result.values).toEqual({ text01: '제목', text02: '설명', img01: '/abs/a.png' });
  });

  it('--seed 정수, --meta 인라인 JSON, 리터럴 \\n을 개행으로 바꾼다', () => {
    const result = parseMakeCardArgs([
      '--preset', 'p1', '--bg', '#8a5a2e', '--end', '#3d2812', '--text01', '1줄\\n2줄', '--text02', '설\\n명',
      '--card', '{}', '--meta', '{"author":"채원"}', '--out-dir', OUT, '--seed', '-7',
    ]);
    expect(result).toMatchObject({ values: { text01: '1줄\n2줄', text02: '설\n명' }, meta: { author: '채원' }, seed: -7 });
  });

  it('--card를 JSON 파일 경로로도 받는다', () => {
    const file = path.join(tmpRoot, 'card.json');
    fs.writeFileSync(file, '{"title":"파일 카드"}');
    const result = parseMakeCardArgs([
      '--preset', 'p1', '--bg', '#8a5a2e', '--end', '#3d2812', '--text01', '제목', '--card', file, '--out-dir', OUT,
    ]);
    expect(result.card).toEqual({ title: '파일 카드' });
  });

  it('필수 인자가 빠지면 어떤 인자인지 알려 준다', () => {
    expect(() => parseMakeCardArgs(['--preset', 'p1', '--bg', '#8a5a2e'])).toThrow('다음 인자가 필요해요: --end, --card, --out-dir');
  });

  const REQUIRED = ['--preset', 'p1', '--bg', '#8a5a2e', '--end', '#3d2812', '--text01', '제목', '--card', '{}', '--out-dir', OUT];
  const swap = (flag: string, value: string) => {
    const copy = [...REQUIRED];
    copy[copy.indexOf(flag) + 1] = value;
    return copy;
  };

  it('색 형식·상대 경로·시드·JSON 오류·없는 파일·알 수 없는 인자·meta 오타를 거절한다', () => {
    expect(() => parseMakeCardArgs(swap('--bg', 'red'))).toThrow('#rrggbb 형식');
    expect(() => parseMakeCardArgs(swap('--out-dir', 'relative/dir'))).toThrow('--out-dir은 절대 경로');
    expect(() => parseMakeCardArgs([...REQUIRED, '--seed', '1.5'])).toThrow('--seed는 정수');
    expect(() => parseMakeCardArgs(swap('--card', '{broken'))).toThrow('--card가 올바른 JSON이 아니에요');
    expect(() => parseMakeCardArgs(swap('--card', '/없는/카드.json'))).toThrow('--card 파일을 찾을 수 없어요');
    expect(() => parseMakeCardArgs(swap('--card', 'card.json'))).toThrow('절대 경로');
    expect(() => parseMakeCardArgs([...REQUIRED, '--foo', '1'])).toThrow('알 수 없는 인자예요: --foo');
    expect(() => parseMakeCardArgs([...REQUIRED, '--meta', '{"autor":"x"}'])).toThrow('알 수 없는 필드');
  });

  it('옛 인자 --text·--subtext는 새 인자 이름을 안내하는 오류다', () => {
    expect(() => parseMakeCardArgs([...REQUIRED, '--text', '제목'])).toThrow('--text·--subtext는 없어졌어요. 레이어 번호로 지정해 주세요: --text01, --text02');
    expect(() => parseMakeCardArgs([...REQUIRED, '--subtext', '설명'])).toThrow('없어졌어요');
  });

  it('형식이 틀린 번호와 같은 번호 중복 지정은 오류다', () => {
    expect(() => parseMakeCardArgs([...REQUIRED, '--text1', 'x'])).toThrow('번호 형식이 올바르지 않아요(예: text01)');
    expect(() => parseMakeCardArgs([...REQUIRED, '--text01', '또']))
      .toThrow('같은 번호를 두 번 지정했어요: text01');
  });
});

describe('seedFromBundleId·toKstIsoString', () => {
  it('같은 묶음 ID는 항상 같은 0 이상 정수 시드를, 다른 ID는 다른 시드를 준다', () => {
    const a = seedFromBundleId('2026-10-05-weekly-card');
    expect(a).toBe(seedFromBundleId('2026-10-05-weekly-card'));
    expect(Number.isSafeInteger(a) && a >= 0).toBe(true);
    expect(a).not.toBe(seedFromBundleId('2026-10-06-weekly-card'));
  });

  it('KST ISO 문자열로 바꾼다', () => {
    expect(toKstIsoString(NOW_MS)).toBe('2026-09-26T15:30:05+09:00');
  });
});

describe('extractDryRunFacts', () => {
  it('통과 요약에서 결과·건너뜀 검사·WebP를 뽑는다', async () => {
    const dir = path.join(tmpRoot, 'ok');
    const { deps } = stubDeps();
    const { output } = await makeHomeFeedCard({ args: parseMakeCardArgs(baseArgv(dir)), deps });
    expect(output.dryRun.result).toBe('통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)');
    expect(output.dryRun.skipped).toContain('제목·시작 일시 중복');
    expect(output.dryRun.webp).toMatch(/^통과/);
    expect(output.dryRun.errors).toEqual([]);
  });

  it('검증 실패 요약에서 사유를 모두 뽑는다', () => {
    const log = ['== 홈피드 카드 등록 묶음 검증 (--dry-run) ==', '결과: 실패 (2건)', '', '[고쳐야 할 점]', '- card.title: 필수 항목이 없어요.', '- image.seed: 정수여야 해요.', '', '[묶음]'].join('\n');
    expect(extractDryRunFacts(log)).toEqual({
      result: '실패 (2건)', errors: ['card.title: 필수 항목이 없어요.', 'image.seed: 정수여야 해요.'], skipped: [], webp: null,
    });
  });

  it('요약 없이 오류 문장만 나오면 그 문장을 사유로 돌려준다', () => {
    expect(extractDryRunFacts('', '묶음 파일을 읽을 수 없어요').errors).toEqual(['묶음 파일을 읽을 수 없어요']);
  });
});

describe('makeHomeFeedCard', () => {
  it('정상 경로: image.png·bundle.json을 만들고 dry-run 통과를 알린다', async () => {
    const dir = path.join(tmpRoot, '2026-10-05-weekly-card');
    const { deps, calls } = stubDeps();
    const { exitCode, output } = await makeHomeFeedCard({ args: parseMakeCardArgs(baseArgv(dir)), deps });

    expect(exitCode).toBe(0);
    expect(output).toMatchObject({
      ok: true, imagePath: path.join(dir, 'image.png'), bundlePath: path.join(dir, 'bundle.json'),
      imageBytes: FIXTURE_PNG.length, presetSource: 'admin-api', stage: { w: 1280, h: 1280 },
    });
    expect(output.dryRun.note).toContain('DB 읽기 검사는 건너뜀');
    expect(fs.readFileSync(path.join(dir, 'image.png')).equals(FIXTURE_PNG)).toBe(true);

    const bundle = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    expect(bundle).toMatchObject({
      bundle_id: '2026-10-05-weekly-card', author: '윤진', created_at: '2026-09-26T15:30:05+09:00',
      image: { path: 'image.png', preset_id: PRESET_ID, bg_color: '#8a5a2e', end_color: '#3d2812', text: '예시 카드', subtext: '짧은 설명' },
    });
    // 시드는 묶음 ID에서 정해지고 렌더러와 bundle.json에 같은 값이 들어간다.
    expect(bundle.image.seed).toBe(seedFromBundleId('2026-10-05-weekly-card'));
    expect(calls[0]).toMatchObject({ preset: PRESET_ID, bg: '#8a5a2e', end: '#3d2812', values: { text01: '예시 카드', text02: '짧은 설명' }, seed: bundle.image.seed });
  });

  it('text02를 안 주면 image.subtext를 기록하지 않고, 렌더 결과의 layers를 출력에 싣는다', async () => {
    const dir = path.join(tmpRoot, 'only-text01');
    const layers = { applied: ['text01'], saved: ['text02'] };
    const { deps } = stubDeps({
      renderPng: async (renderArgs: Record<string, unknown>) => ({ buffer: FIXTURE_PNG, seed: renderArgs.seed, stage: { w: 1280, h: 1280 }, presetSource: 'admin-api', layers }),
    });
    const argv = baseArgv(dir);
    argv.splice(argv.indexOf('--text02'), 2);
    const { output } = await makeHomeFeedCard({ args: parseMakeCardArgs(argv), deps });
    expect(output.layers).toEqual(layers);
    const bundle = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    expect(bundle.image.text).toBe('예시 카드');
    expect(bundle.image).not.toHaveProperty('subtext');
  });

  it('--seed와 --meta의 bundle_id·author를 우선한다', async () => {
    const dir = path.join(tmpRoot, 'folder-name');
    const { deps } = stubDeps();
    const args = parseMakeCardArgs(baseArgv(dir, ['--seed', '42']));
    args.meta = { ...args.meta, bundle_id: 'custom-id', author: '채원' };
    const { output } = await makeHomeFeedCard({ args, deps });
    expect(output.seed).toBe(42);
    const bundle = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
    expect(bundle).toMatchObject({ bundle_id: 'custom-id', author: '채원' });
  });

  it('검증 실패: 종료 코드 1, 사유를 출력하고 고쳐 다시 돌릴 수 있게 파일은 남긴다', async () => {
    const dir = path.join(tmpRoot, 'bad');
    const { deps } = stubDeps();
    const args = parseMakeCardArgs(baseArgv(dir));
    args.card = { ...args.card, template_type: 'weekly_recap' };
    args.meta = { ...args.meta, world_review: undefined };
    const { exitCode, output } = await makeHomeFeedCard({ args, deps });

    expect(exitCode).toBe(1);
    expect(output.ok).toBe(false);
    expect(output.dryRun.exitCode).toBe(1);
    expect(output.dryRun.result).toMatch(/^실패/);
    expect(output.dryRun.errors.join('\n')).toContain('card.template_type');
    expect(output.dryRun.errors.join('\n')).toContain('world_review: 필수 항목이 없어요.');
    expect(fs.existsSync(path.join(dir, 'bundle.json'))).toBe(true);
  });

  it('이미 등록한 묶음 폴더는 렌더 전에 거절한다', async () => {
    const dir = path.join(tmpRoot, 'registered');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'registration-record.json'), '{}');
    const { deps, calls } = stubDeps();
    await expect(makeHomeFeedCard({ args: parseMakeCardArgs(baseArgv(dir)), deps })).rejects.toThrow('이미 등록한 묶음 폴더');
    expect(calls).toHaveLength(0);
  });

  it('렌더가 실패하면 그 오류를 던지고 파일을 만들지 않는다', async () => {
    const dir = path.join(tmpRoot, 'render-fail');
    const { deps } = stubDeps({ renderPng: async () => { throw new Error('프리셋을 찾을 수 없어요: x'); } });
    await expect(makeHomeFeedCard({ args: parseMakeCardArgs(baseArgv(dir)), deps })).rejects.toThrow('프리셋을 찾을 수 없어요');
    expect(fs.existsSync(dir)).toBe(false);
  });
});
