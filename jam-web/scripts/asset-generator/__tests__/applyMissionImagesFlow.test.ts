/**
 * 기존 미션 대표 이미지 일괄 적용 — 계획 검증·미리보기 무쓰기·적용 순서와 중단·롤백 (티켓 20260926_2346)
 *
 * 실제 Supabase·렌더러에는 접근하지 않는다. 클라이언트는 호출을 순서대로 기록하는 스텁이고 렌더러·변환기도 스텁이다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APPLIED_FILE_NAME,
  CONTACT_SHEET_FILE_NAME,
  RESOLVED_FILE_NAME,
  checkPlanContrast,
  checkPlanValues,
  matchMissionsToPlan,
  parseApplyMissionImagesArgs,
  runApply,
  runPreview,
  runRollback,
  validatePlan,
} from '../applyMissionImagesFlow.mjs';
import { missionStoragePathsFor } from '../registerMissionFlow.mjs';

const PRESET_ID = '98562783-36c9-44aa-8fba-3c4793608f28';
const ID_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ID_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const ID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW_MS = Date.UTC(2026, 8, 26, 10, 0, 0);

type Row = { id: string; title: string; image_url: string | null; image_source: string | null };
const MISSIONS: Row[] = [
  { id: ID_A1, title: '가 미션', image_url: null, image_source: null },
  { id: ID_A2, title: '가 미션', image_url: null, image_source: null },
  { id: ID_B, title: '나 미션', image_url: null, image_source: null },
];
const PLAN = {
  preset: PRESET_ID,
  items: [
    { match: { title: '가 미션' }, values: { text01: '2주 330km', text02: '가 미션' }, bg: '#E8C39E', end: '#B98A5B', expectCount: 2 },
    { match: { title: '나 미션' }, values: { text01: '3일 연속', text02: '나 미션' }, bg: '#B8C9F0', end: '#8FA8D9', expectCount: 1 },
  ],
};
const DARK_TEXT_LAYERS = [
  { type: 'text', color: '#111111' },
  { type: 'text', color: '#111111' },
  { type: 'text', color: '#111111' },
];

type Update = { table: string; payload: Record<string, unknown>; id: unknown };
type StubOptions = {
  rows?: Row[];
  uploadError?: (filePath: string) => string | null;
  /** 저장소에 이미 있는 파일(경로 → 내용) */
  existingFiles?: Record<string, string>;
  downloadError?: string;
};

/** supabase-js 중 이 스크립트가 쓰는 부분만 흉내 낸다. 호출 순서는 `events`에 남는다. */
function createStub(opts: StubOptions = {}) {
  const rows = opts.rows ?? MISSIONS;
  const events: string[] = [];
  const updates: Update[] = [];
  const uploads: { path: string; contentType: string; upsert: boolean }[] = [];
  const writeCount = { insert: 0, update: 0, delete: 0, upload: 0, remove: 0 };

  const from = (table: string) => {
    let op = 'select';
    let payload: Record<string, unknown> = {};
    let inIds: string[] | null = null;
    let eqId: unknown;
    const finish = () => {
      events.push(`${op}:${table}`);
      if (op === 'update') {
        writeCount.update++;
        updates.push({ table, payload, id: eqId });
        return Promise.resolve({ data: null, error: null });
      }
      const data = inIds ? rows.filter((row) => inIds!.includes(row.id)) : rows;
      return Promise.resolve({ data, error: null });
    };
    const b = {
      select: () => b,
      update: (p: Record<string, unknown>) => {
        op = 'update';
        payload = p;
        return b;
      },
      in: (_k: string, ids: string[]) => {
        inIds = ids;
        return b;
      },
      eq: (_k: string, v: unknown) => {
        eqId = v;
        return b;
      },
      then: (res: (r: unknown) => unknown, rej?: (e: unknown) => unknown) => finish().then(res, rej),
    };
    return b;
  };

  const storage = {
    from: (bucket: string) => ({
      upload: async (filePath: string, _buf: Buffer, o: { contentType: string; upsert: boolean }) => {
        events.push(`upload:${path.extname(filePath).slice(1)}`);
        writeCount.upload++;
        uploads.push({ path: `${bucket}/${filePath}`, contentType: o.contentType, upsert: o.upsert });
        const message = opts.uploadError?.(filePath);
        return message ? { data: null, error: { message } } : { data: { path: filePath }, error: null };
      },
      download: async (filePath: string) => {
        events.push(`download:${path.extname(filePath).slice(1)}`);
        if (opts.downloadError) return { data: null, error: { message: opts.downloadError } };
        const content = opts.existingFiles?.[filePath];
        if (content === undefined) return { data: null, error: { message: 'Object not found' } };
        return { data: { arrayBuffer: async () => Buffer.from(content) }, error: null };
      },
      remove: async () => {
        writeCount.remove++;
        return { data: [], error: null };
      },
      getPublicUrl: (filePath: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${filePath}` } }),
    }),
  };
  return { supabase: { from, storage }, events, updates, uploads, writeCount };
}

function createOut() {
  const logs: string[] = [];
  const errors: string[] = [];
  return { out: { log: (s: string) => logs.push(s), error: (s: string) => errors.push(s) }, logs, errors };
}

let workDir: string;
let planFile: string;
let outDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apply-mission-images-test-'));
  planFile = path.join(workDir, 'plan.json');
  outDir = path.join(workDir, 'out');
  fs.writeFileSync(planFile, JSON.stringify(PLAN));
});
afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function previewDeps(over: Record<string, unknown> = {}) {
  let seedCounter = 100;
  const renderCalls: Record<string, unknown>[] = [];
  const deps = {
    loadPreset: async () => ({ layers: DARK_TEXT_LAYERS }),
    renderPng: async (renderArgs: Record<string, unknown>) => {
      renderCalls.push(renderArgs);
      return { buffer: Buffer.from(`png-${renderArgs.seed}`), seed: renderArgs.seed, stage: { w: 1280, h: 1280 } };
    },
    randomSeed: () => seedCounter++,
    detectTextOverflow: async () => false,
    makeContactSheet: async () => Buffer.from('contact-sheet'),
    now: () => NOW_MS,
    ...over,
  };
  return { deps, renderCalls };
}

const previewArgs = () => parseApplyMissionImagesArgs(['--plan', planFile, '--out-dir', outDir]);
const applyArgs = () => parseApplyMissionImagesArgs(['--out-dir', outDir, '--apply']);
const fakeWebp = async (png: Buffer) => Buffer.from(`webp-of-${png.toString()}`);
const applyDeps = (over: Record<string, unknown> = {}) => ({ convertToWebp: fakeWebp, now: () => NOW_MS, ...over });

async function makePreview() {
  const { supabase } = createStub();
  const { deps } = previewDeps();
  const { out } = createOut();
  expect(await runPreview({ args: previewArgs(), supabase, out, deps })).toBe(0);
}

describe('parseApplyMissionImagesArgs', () => {
  it('모드 표시가 없으면 미리보기이고 --plan·--out-dir이 필요하다', () => {
    expect(parseApplyMissionImagesArgs(['--plan', '/a/p.json', '--out-dir', '/a/o'])).toMatchObject({ mode: 'preview', plan: '/a/p.json', outDir: '/a/o' });
    expect(() => parseApplyMissionImagesArgs(['--out-dir', '/a/o'])).toThrow('--plan과 --out-dir');
  });

  it('--apply는 --out-dir만 받고 --plan은 거절한다', () => {
    expect(parseApplyMissionImagesArgs(['--out-dir', '/a/o', '--apply'])).toMatchObject({ mode: 'apply', outDir: '/a/o' });
    expect(() => parseApplyMissionImagesArgs(['--out-dir', '/a/o', '--plan', '/a/p.json', '--apply'])).toThrow('--plan을 받지 않아요');
  });

  it('--rollback은 다른 모드와 함께 쓸 수 없고 절대 경로여야 한다', () => {
    expect(parseApplyMissionImagesArgs(['--rollback', '/a/o/applied.json'])).toMatchObject({ mode: 'rollback', rollbackFile: '/a/o/applied.json' });
    expect(() => parseApplyMissionImagesArgs(['--rollback', '/a/o/applied.json', '--apply', '--out-dir', '/a/o'])).toThrow('하나만');
    expect(() => parseApplyMissionImagesArgs(['--rollback', 'applied.json'])).toThrow('절대 경로');
  });

  it('알 수 없는 인자와 값 없는 인자는 오류다', () => {
    expect(() => parseApplyMissionImagesArgs(['--nope'])).toThrow('알 수 없는 인자');
    expect(() => parseApplyMissionImagesArgs(['--plan'])).toThrow('--plan 값이 필요해요');
  });
});

describe('validatePlan', () => {
  it('올바른 계획은 오류 없이 통과한다', () => {
    const { errors, plan } = validatePlan(PLAN);
    expect(errors).toEqual([]);
    expect(plan?.items).toHaveLength(2);
    expect(plan?.items[0]).toEqual({ title: '가 미션', values: { text01: '2주 330km', text02: '가 미션' }, bg: '#E8C39E', end: '#B98A5B', expectCount: 2 });
  });

  it('프리셋 id 형식·색 형식·빈 문구·expectCount·제목 중복을 모두 잡는다', () => {
    const { errors, plan } = validatePlan({
      preset: 'not-a-uuid',
      items: [
        { match: { title: '가' }, values: { text01: '  ' }, bg: 'red', end: '#12345', expectCount: 0 },
        { match: { title: '가' }, values: { text01: '문구' }, bg: '#FFFFFF', end: '#000000', expectCount: 1 },
      ],
    });
    expect(plan).toBeNull();
    const text = errors.join('\n');
    expect(text).toContain('preset은 프리셋 id');
    expect(text).toContain('values.text01가 비어 있어요');
    expect(text).toContain('bg는 #RRGGBB 형식');
    expect(text).toContain('end는 #RRGGBB 형식');
    expect(text).toContain('expectCount는 1 이상의 정수');
    expect(text).toContain('같은 제목이 계획에 두 번');
  });

  it('match.title 누락·values 누락·형식이 틀린 번호·이미지 값 형식을 잡는다', () => {
    const base = { bg: '#FFFFFF', end: '#000000', expectCount: 1 };
    const { errors, plan } = validatePlan({
      preset: PRESET_ID,
      items: [
        { ...base, values: { text01: '가' } },
        { ...base, match: { title: '나' }, values: {} },
        { ...base, match: { title: '다' }, values: { text1: '값', Text02: '값', img00: '/a.png' } },
        { ...base, match: { title: '라' }, values: { img01: 'relative/a.png' } },
      ],
    });
    expect(plan).toBeNull();
    const text = errors.join('\n');
    expect(text).toContain('items[0]: match.title이 비어 있어요');
    expect(text).toContain('items[1](나): values가 비어 있어요');
    expect(text).toContain('번호 형식이 올바르지 않아요(예: text01): text1');
    expect(text).toContain('번호 형식이 올바르지 않아요(예: text01): Text02');
    expect(text).toContain('번호 형식이 올바르지 않아요(예: text01): img00');
    expect(text).toContain('values.img01는 이미지 파일의 절대 경로 또는 http(s) URL');
  });

  it('옛 형식(title·condition)은 match.title 누락으로 잡힌다', () => {
    const { errors } = validatePlan({ preset: PRESET_ID, items: [{ title: '가', condition: '문구', bg: '#FFFFFF', end: '#000000', expectCount: 1 }] });
    expect(errors.join('\n')).toContain('match.title이 비어 있어요');
  });

  it('items가 없거나 객체가 아니면 오류다', () => {
    expect(validatePlan({ preset: PRESET_ID, items: [] }).errors.join('')).toContain('items');
    expect(validatePlan([]).errors.join('')).toContain('객체');
  });

  it('저장소의 실제 계획 파일은 제목 42종·미션 55건이고 검증을 통과한다', () => {
    const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../jam-doc/assets/mission-images/20260926_mission-image-plan.json'), 'utf8'));
    const { errors, plan } = validatePlan(real);
    expect(errors).toEqual([]);
    expect(plan?.items).toHaveLength(42);
    expect(plan?.items.reduce((sum: number, item: { expectCount: number }) => sum + item.expectCount, 0)).toBe(55);
  });
});

describe('checkPlanContrast', () => {
  const items = [{ title: '가', values: { text01: '문구' }, bg: '#E8C39E', end: '#B98A5B', expectCount: 1 }];

  it('어두운 글자가 밝은 배경 위에서 4.5:1 이상이면 통과한다', () => {
    expect(checkPlanContrast(DARK_TEXT_LAYERS, items)).toEqual([]);
  });

  it('대비가 4.5:1 미만이면 제목과 색을 넣어 오류를 낸다', () => {
    const errors = checkPlanContrast([{ type: 'text', color: '#ffffff' }, { type: 'text', color: '#ffffff' }], items);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('가: bg #E8C39E');
    expect(errors[0]).toContain('4.5:1 미만');
  });

  it('텍스트 레이어가 하나도 없으면 오류다', () => {
    expect(checkPlanContrast([{ type: 'image' }], items)[0]).toContain('텍스트 레이어가 없어요');
  });

  it('텍스트 색이 #rrggbb가 아니면 읽지 못한다는 오류다', () => {
    expect(checkPlanContrast([{ type: 'text', color: 'white' }, { type: 'text', color: 'white' }], items)[0]).toContain('텍스트 색을 읽지 못했어요');
  });
});

describe('checkPlanValues', () => {
  const layers = [
    { id: 'a', type: 'text', color: '#111111' },
    { id: 'b', type: 'image', assetUrl: 'https://x.test/saved.png' },
    { id: 'c', type: 'text', color: '#111111' },
    { id: 'd', type: 'text', color: '#111111' },
  ];
  const item = (values: Record<string, string>) => ({ title: '가 미션', values, bg: '#E8C39E', end: '#B98A5B', expectCount: 1 });

  it('프리셋에 있는 번호만 쓰면 오류가 없다(안 준 번호는 저장된 값)', () => {
    expect(checkPlanValues(layers, [item({ text01: '조건', text02: '가 미션' })])).toEqual([]);
  });

  it('프리셋에 없는 번호는 제목과 프리셋의 번호 목록을 담은 오류다', () => {
    const errors = checkPlanValues(layers, [item({ text01: '조건', text05: '없음' })]);
    expect(errors).toEqual(['가 미션: 이 프리셋에 없는 번호예요: text05. 있는 번호: img01, text01, text02, text03']);
  });

  it('이미지 번호의 원본 파일이 없으면 오류이고, URL은 존재 확인을 건너뛴다', () => {
    const missing = path.join(workDir, 'none.png');
    expect(checkPlanValues(layers, [item({ img01: missing })])[0]).toContain(`img01의 이미지 파일을 찾을 수 없어요: ${missing}`);
    expect(checkPlanValues(layers, [item({ img01: 'https://cdn.test/a.png' })])).toEqual([]);
    const present = path.join(workDir, 'a.png');
    fs.writeFileSync(present, 'x');
    expect(checkPlanValues(layers, [item({ img01: present })])).toEqual([]);
  });
});

describe('matchMissionsToPlan', () => {
  // 검증을 통과한 계획 항목(`{ title, values, … }`)으로 맞춘다.
  const planItems = validatePlan(PLAN).plan!.items;

  it('제목별 미션 수가 expectCount와 같으면 계획 순서대로 대상을 돌려준다', () => {
    const { errors, warnings, targets } = matchMissionsToPlan(planItems, MISSIONS);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(targets.map((t: { mission: Row }) => t.mission.id)).toEqual([ID_A1, ID_A2, ID_B]);
  });

  it('수가 다르면 오류, 계획에 없는 미션은 알림만 낸다', () => {
    const extra: Row = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: '계획 밖', image_url: null, image_source: null };
    const { errors, warnings } = matchMissionsToPlan(planItems, [MISSIONS[0], MISSIONS[2], extra]);
    expect(errors.join('')).toContain('가 미션: DB의 미션이 1건이에요(계획의 expectCount: 2)');
    expect(warnings.join('')).toContain('계획 밖');
  });
});

describe('runPreview', () => {
  it('미션마다 PNG를 저장하고 resolved.json·모아보기를 만들며 DB·저장소에는 쓰지 않는다', async () => {
    const stub = createStub();
    const { deps, renderCalls } = previewDeps();
    const { out, logs, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(0);
    expect(errors).toEqual([]);

    expect(stub.writeCount).toEqual({ insert: 0, update: 0, delete: 0, upload: 0, remove: 0 });
    expect(stub.events).toEqual(['select:missions']);

    for (const id of [ID_A1, ID_A2, ID_B]) expect(fs.existsSync(path.join(outDir, `${id}.png`))).toBe(true);
    expect(fs.readFileSync(path.join(outDir, CONTACT_SHEET_FILE_NAME), 'utf8')).toBe('contact-sheet');

    // 계획의 레이어 번호 값이 그대로 렌더러로 간다. 시드는 미션마다 따로 뽑는다(같은 제목이어도 다르다).
    expect(renderCalls.map((c) => [c.values, c.seed])).toEqual([
      [{ text01: '2주 330km', text02: '가 미션' }, 100],
      [{ text01: '2주 330km', text02: '가 미션' }, 101],
      [{ text01: '3일 연속', text02: '나 미션' }, 102],
    ]);

    const resolved = JSON.parse(fs.readFileSync(path.join(outDir, RESOLVED_FILE_NAME), 'utf8'));
    expect(resolved.preset).toBe(PRESET_ID);
    expect(resolved.items.map((i: { id: string; seed: number; file: string; textOverflow: boolean }) => [i.id, i.seed, i.file, i.textOverflow])).toEqual([
      [ID_A1, 100, `${ID_A1}.png`, false],
      [ID_A2, 101, `${ID_A2}.png`, false],
      [ID_B, 102, `${ID_B}.png`, false],
    ]);
    expect(resolved.items[0]).toMatchObject({ title: '가 미션', values: { text01: '2주 330km', text02: '가 미션' }, bg: '#E8C39E', end: '#B98A5B', bytes: 7, stage: { w: 1280, h: 1280 } });
    expect(logs.join('\n')).toContain('이미지 3장');
  });

  it('문구가 오른쪽 여백을 넘는 이미지는 경고 목록에 올린다', async () => {
    const stub = createStub();
    const { deps } = previewDeps({ detectTextOverflow: async ({ values }: { values: Record<string, string> }) => values.text02 === '나 미션' });
    const { out, logs } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(0);
    const text = logs.join('\n');
    expect(text).toContain('문구가 오른쪽 여백(가로 3%)을 넘어요: 나 미션 / 3일 연속 / 나 미션');
    expect(text).not.toContain('넘어요: 가 미션');
    const resolved = JSON.parse(fs.readFileSync(path.join(outDir, RESOLVED_FILE_NAME), 'utf8'));
    expect(resolved.items.map((i: { textOverflow: boolean }) => i.textOverflow)).toEqual([false, false, true]);
  });

  it('DB 미션 수가 expectCount와 다르면 아무것도 만들지 않고 실패한다', async () => {
    const stub = createStub({ rows: [MISSIONS[0], MISSIONS[2]] });
    const { deps, renderCalls } = previewDeps();
    const { out, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('\n')).toContain('가 미션: DB의 미션이 1건이에요(계획의 expectCount: 2)');
    expect(renderCalls).toHaveLength(0);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('프리셋에 없는 번호를 계획이 쓰면 렌더 전에 프리셋의 번호 목록과 함께 실패한다', async () => {
    fs.writeFileSync(planFile, JSON.stringify({ ...PLAN, items: [{ ...PLAN.items[0], values: { text01: '조건', text07: '없음' } }, PLAN.items[1]] }));
    const stub = createStub();
    const { deps, renderCalls } = previewDeps();
    const { out, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('\n')).toContain('가 미션: 이 프리셋에 없는 번호예요: text07. 있는 번호: text01, text02, text03');
    expect(renderCalls).toHaveLength(0);
    expect(fs.existsSync(outDir)).toBe(false);
  });

  it('대비가 모자라면 렌더 전에 실패한다', async () => {
    const stub = createStub();
    const { deps, renderCalls } = previewDeps({ loadPreset: async () => ({ layers: [{ type: 'text', color: '#ffffff' }, { type: 'text', color: '#ffffff' }] }) });
    const { out, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('\n')).toContain('4.5:1 미만');
    expect(renderCalls).toHaveLength(0);
  });

  it('계획 형식 오류(빈 값)는 DB를 읽기 전에 실패한다', async () => {
    fs.writeFileSync(planFile, JSON.stringify({ ...PLAN, items: [{ ...PLAN.items[0], values: { text01: '' } }] }));
    const stub = createStub();
    const { deps } = previewDeps();
    const { out, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('\n')).toContain('values.text01가 비어 있어요');
    expect(stub.events).toEqual([]);
  });

  it('이미 적용한 폴더(applied.json이 있음)에는 미리보기를 덮어쓰지 않는다', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, APPLIED_FILE_NAME), '{}');
    const stub = createStub();
    const { deps, renderCalls } = previewDeps();
    const { out, errors } = createOut();

    expect(await runPreview({ args: previewArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('')).toContain('이미 적용한 폴더');
    expect(renderCalls).toHaveLength(0);
  });
});

describe('runApply', () => {
  it('미션마다 백업 → PNG → WebP → 갱신 순서로 적용하고 이전 값을 applied.json에 남긴다', async () => {
    await makePreview();
    const rows: Row[] = [
      { ...MISSIONS[0], image_url: 'https://old.test/a1.webp?v=1', image_source: 'admin-generator' },
      MISSIONS[1],
      MISSIONS[2],
    ];
    const paths = missionStoragePathsFor(ID_A1);
    const stub = createStub({ rows, existingFiles: { [paths.pngPath]: 'old-png', [paths.webpPath]: 'old-webp' } });
    const { out, logs, errors } = createOut();

    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(0);
    expect(errors).toEqual([]);

    // 첫 미션(기존 이미지 있음)만 백업을 내려받고, 나머지는 다운로드 없이 업로드부터 한다. 앞의 select는 사전 확인이다.
    expect(stub.events).toEqual([
      'select:missions',
      'download:png',
      'download:webp',
      'upload:png',
      'upload:webp',
      'update:missions',
      'upload:png',
      'upload:webp',
      'update:missions',
      'upload:png',
      'upload:webp',
      'update:missions',
    ]);

    expect(stub.uploads[0]).toEqual({ path: `images/${paths.pngPath}`, contentType: 'image/png', upsert: true });
    expect(stub.uploads[1]).toEqual({ path: `images/${paths.webpPath}`, contentType: 'image/webp', upsert: true });
    expect(stub.updates[0]).toEqual({
      table: 'missions',
      id: ID_A1,
      payload: { image_url: `https://cdn.test/images/${paths.webpPath}?v=${NOW_MS}`, image_source: 'agent-generator' },
    });

    expect(fs.readFileSync(path.join(outDir, 'backup', `${ID_A1}.png`), 'utf8')).toBe('old-png');
    expect(fs.readFileSync(path.join(outDir, 'backup', `${ID_A1}.webp`), 'utf8')).toBe('old-webp');

    const applied = JSON.parse(fs.readFileSync(path.join(outDir, APPLIED_FILE_NAME), 'utf8'));
    expect(applied.entries.map((e: { id: string; status: string }) => [e.id, e.status])).toEqual([
      [ID_A1, 'applied'],
      [ID_A2, 'applied'],
      [ID_B, 'applied'],
    ]);
    expect(applied.entries[0].previous).toEqual({ image_url: 'https://old.test/a1.webp?v=1', image_source: 'admin-generator' });
    expect(applied.entries[0].backup).toEqual({ png: `backup/${ID_A1}.png`, webp: `backup/${ID_A1}.webp` });
    // 기존 이미지가 없던 미션은 이전 값이 null이고 백업이 없다.
    expect(applied.entries[1].previous).toEqual({ image_url: null, image_source: null });
    expect(applied.entries[1].backup).toEqual({ png: null, webp: null });
    expect(logs.join('\n')).toContain('미션 3건');
  });

  it('기존 이미지가 있어도 저장소에 그 경로 파일이 없으면 백업 없이 계속한다', async () => {
    await makePreview();
    const rows: Row[] = [{ ...MISSIONS[0], image_url: 'https://old.test/elsewhere.webp', image_source: null }, MISSIONS[1], MISSIONS[2]];
    const stub = createStub({ rows });
    const { out } = createOut();

    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(0);
    const applied = JSON.parse(fs.readFileSync(path.join(outDir, APPLIED_FILE_NAME), 'utf8'));
    expect(applied.entries[0].backup).toEqual({ png: null, webp: null });
    expect(fs.existsSync(path.join(outDir, 'backup'))).toBe(false);
  });

  it('백업 내려받기가 «없음» 외의 이유로 실패하면 덮어쓰지 않고 멈춘다', async () => {
    await makePreview();
    const rows: Row[] = [{ ...MISSIONS[0], image_url: 'https://old.test/a1.webp', image_source: null }, MISSIONS[1], MISSIONS[2]];
    const stub = createStub({ rows, downloadError: 'network down' });
    const { out, errors } = createOut();

    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    expect(errors.join('\n')).toContain('백업을 내려받지 못했어요');
    expect(stub.writeCount.upload).toBe(0);
    expect(stub.writeCount.update).toBe(0);
  });

  it('업로드가 한 건 실패하면 그 자리에서 멈추고 나머지는 건드리지 않는다', async () => {
    await makePreview();
    const stub = createStub({ uploadError: (filePath) => (filePath.includes(ID_A2) && filePath.endsWith('.webp') ? '저장소 오류' : null) });
    const { out, errors } = createOut();

    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    const message = errors.join('\n');
    expect(message).toContain('적용을 멈췄어요(1/3건 완료)');
    expect(message).toContain(ID_A2);
    expect(message).toContain('WebP 이미지 업로드에 실패했어요: 저장소 오류');

    // 미션 A1은 갱신까지 끝났고, A2는 PNG·WebP 시도에서 멈췄으며, B는 손대지 않았다.
    expect(stub.updates.map((u) => u.id)).toEqual([ID_A1]);
    expect(stub.uploads.map((u) => u.path).some((p) => p.includes(ID_B))).toBe(false);

    const applied = JSON.parse(fs.readFileSync(path.join(outDir, APPLIED_FILE_NAME), 'utf8'));
    expect(applied.entries.map((e: { status: string }) => e.status)).toEqual(['applied', 'backed-up', 'pending']);
  });

  it('쓰기 전 확인에서 PNG 누락·5MB 초과·미션 누락을 잡으면 아무것도 쓰지 않는다', async () => {
    await makePreview();
    fs.rmSync(path.join(outDir, `${ID_A1}.png`));
    fs.writeFileSync(path.join(outDir, `${ID_A2}.png`), Buffer.alloc(5 * 1024 * 1024 + 1));
    const stub = createStub({ rows: [MISSIONS[0], MISSIONS[1]] });
    const { out, errors } = createOut();

    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    const message = errors.join('\n');
    expect(message).toContain(`${ID_A1}: 이미지 파일이 없어요`);
    expect(message).toContain(`${ID_A2}: 이미지가 너무 커요`);
    expect(message).toContain(`${ID_B}: 미션이 DB에 없어요`);
    expect(stub.writeCount).toEqual({ insert: 0, update: 0, delete: 0, upload: 0, remove: 0 });
    expect(fs.existsSync(path.join(outDir, APPLIED_FILE_NAME))).toBe(false);
  });

  it('WebP 변환이 실패하면 쓰기 전에 멈춘다', async () => {
    await makePreview();
    const stub = createStub();
    const { out, errors } = createOut();

    const deps = applyDeps({ convertToWebp: async () => { throw new Error('변환 오류'); } });
    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps })).toBe(1);
    expect(errors.join('\n')).toContain('WebP로 변환하지 못했어요: 변환 오류');
    expect(stub.writeCount.upload + stub.writeCount.update).toBe(0);
  });

  it('미리보기 결과가 없으면 미리보기부터 하라고 알린다', async () => {
    const stub = createStub();
    const { out, errors } = createOut();
    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    expect(errors.join('')).toContain('미리보기 결과 파일을 찾을 수 없어요');
  });

  it('이미 적용 기록이 있는 폴더에는 다시 적용하지 않는다', async () => {
    await makePreview();
    fs.writeFileSync(path.join(outDir, APPLIED_FILE_NAME), '{}');
    const stub = createStub();
    const { out, errors } = createOut();
    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    expect(errors.join('')).toContain('이미 적용 기록이 있어요');
    expect(stub.writeCount.upload).toBe(0);
  });

  it('미리보기 이후 미션 제목이 바뀌었으면 멈춘다', async () => {
    await makePreview();
    const stub = createStub({ rows: [{ ...MISSIONS[0], title: '바뀐 제목' }, MISSIONS[1], MISSIONS[2]] });
    const { out, errors } = createOut();
    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    expect(errors.join('')).toContain('제목이 바뀌었어요');
    expect(stub.writeCount.upload).toBe(0);
  });

  it('resolved.json의 파일 이름이 규칙과 다르면 폴더 밖 파일을 읽지 않고 거절한다', async () => {
    await makePreview();
    const file = path.join(outDir, RESOLVED_FILE_NAME);
    const resolved = JSON.parse(fs.readFileSync(file, 'utf8'));
    resolved.items[0].file = '../secret.png';
    fs.writeFileSync(file, JSON.stringify(resolved));
    const stub = createStub();
    const { out, errors } = createOut();
    expect(await runApply({ args: applyArgs(), supabase: stub.supabase, out, deps: applyDeps() })).toBe(1);
    expect(errors.join('')).toContain('이미지 파일 이름이 규칙');
    expect(stub.writeCount.upload).toBe(0);
  });
});

describe('runRollback', () => {
  it('이전 image_url·image_source(null 포함)를 되돌리고 백업 파일을 다시 올린다', async () => {
    await makePreview();
    const rows: Row[] = [
      { ...MISSIONS[0], image_url: 'https://old.test/a1.webp?v=1', image_source: 'admin-generator' },
      MISSIONS[1],
      MISSIONS[2],
    ];
    const paths = missionStoragePathsFor(ID_A1);
    const applyStub = createStub({ rows, existingFiles: { [paths.pngPath]: 'old-png', [paths.webpPath]: 'old-webp' } });
    const applyOut = createOut();
    expect(await runApply({ args: applyArgs(), supabase: applyStub.supabase, out: applyOut.out, deps: applyDeps() })).toBe(0);

    const stub = createStub();
    const { out, logs, errors } = createOut();
    const args = parseApplyMissionImagesArgs(['--rollback', path.join(outDir, APPLIED_FILE_NAME)]);
    expect(await runRollback({ args, supabase: stub.supabase, out })).toBe(0);
    expect(errors).toEqual([]);

    // 백업이 있는 첫 미션은 저장소 파일을 다시 올린 뒤 행을 되돌리고, 나머지는 행만 이전 값(null)으로 되돌린다.
    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'update:missions', 'update:missions', 'update:missions']);
    expect(stub.uploads.map((u) => [u.path, u.contentType])).toEqual([
      [`images/${paths.pngPath}`, 'image/png'],
      [`images/${paths.webpPath}`, 'image/webp'],
    ]);
    expect(stub.updates.map((u) => [u.id, u.payload])).toEqual([
      [ID_A1, { image_url: 'https://old.test/a1.webp?v=1', image_source: 'admin-generator' }],
      [ID_A2, { image_url: null, image_source: null }],
      [ID_B, { image_url: null, image_source: null }],
    ]);
    expect(logs.join('\n')).toContain('미션 3건');
  });

  it('적용을 시작하지 않은 미션(pending)은 건드리지 않는다', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, APPLIED_FILE_NAME);
    fs.writeFileSync(
      file,
      JSON.stringify({
        entries: [
          { id: ID_A1, title: '가', previous: { image_url: null, image_source: null }, backup: { png: null, webp: null }, status: 'applied' },
          { id: ID_B, title: '나', previous: { image_url: null, image_source: null }, backup: { png: null, webp: null }, status: 'pending' },
        ],
      })
    );
    const stub = createStub();
    const { out } = createOut();
    expect(await runRollback({ args: parseApplyMissionImagesArgs(['--rollback', file]), supabase: stub.supabase, out })).toBe(0);
    expect(stub.updates.map((u) => u.id)).toEqual([ID_A1]);
  });

  it('백업 경로가 규칙과 다르면 그 미션은 되돌리지 않고 실패로 알린다', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, APPLIED_FILE_NAME);
    fs.writeFileSync(
      file,
      JSON.stringify({ entries: [{ id: ID_A1, title: '가', previous: { image_url: null, image_source: null }, backup: { png: '../x.png', webp: null }, status: 'applied' }] })
    );
    const stub = createStub();
    const { out, errors } = createOut();
    expect(await runRollback({ args: parseApplyMissionImagesArgs(['--rollback', file]), supabase: stub.supabase, out })).toBe(1);
    expect(errors.join('')).toContain('백업 경로가 규칙과 달라요');
    expect(stub.writeCount.update).toBe(0);
  });

  it('적용 기록 파일이 없으면 오류다', async () => {
    const stub = createStub();
    const { out, errors } = createOut();
    const args = parseApplyMissionImagesArgs(['--rollback', path.join(workDir, 'none', APPLIED_FILE_NAME)]);
    expect(await runRollback({ args, supabase: stub.supabase, out })).toBe(1);
    expect(errors.join('')).toContain('적용 기록 파일을 찾을 수 없어요');
  });
});
