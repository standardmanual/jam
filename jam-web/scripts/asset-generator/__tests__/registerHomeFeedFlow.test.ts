/**
 * 홈피드 카드 등록 — 등록 순서·실패 처리·중복 거절·dry-run 무쓰기·되돌림 안전장치 (티켓 20260925_1413)
 *
 * 실제 Supabase에는 접근하지 않는다. 클라이언트는 호출을 순서대로 기록하는 스텁이다. 배지와 공통인 부품
 * (인자 파싱·기록 파일 쓰기)은 다시 시험하지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertBadgeImageToWebp } from '../../../src/lib/admin/badgeImageWebp';
import { parseRegisterArgs } from '../registerArgs.mjs';
import { buildTodayCardInsertPayload, readBundleFile, validateHomeFeedBundle } from '../registerHomeFeedBundle.mjs';
import {
  UNDO_REFERENCE_TABLES,
  findHomeFeedRecordUndoError,
  homeFeedStoragePathsFor,
  registerHomeFeedCard,
  runHomeFeedDbChecks,
  runHomeFeedRegister,
  runHomeFeedUndo,
  undoHomeFeedRegistration,
} from '../registerHomeFeedFlow.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-home-feed-bundle');
const CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BADGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW_MS = Date.UTC(2026, 8, 25, 1, 31, 2); // 2026-09-25 10:31:02 KST

type Entry = {
  table: string;
  op: string;
  cols?: string;
  filters: unknown[][];
  payload?: Record<string, unknown>;
  opts?: { head?: boolean; count?: string };
};
type Result = { data?: unknown; error?: { message: string } | null; count?: number };

/** supabase-js 쿼리 빌더 중 이 스크립트가 쓰는 부분만 흉내 낸다(await하면 결과가 나온다). */
interface StubBuilder {
  select(cols?: string, o?: Entry['opts']): StubBuilder;
  insert(payload: Record<string, unknown>): StubBuilder;
  delete(): StubBuilder;
  eq(k: string, v: unknown): StubBuilder;
  is(k: string, v: unknown): StubBuilder;
  in(k: string, v: unknown): StubBuilder;
  limit(n?: number): StubBuilder;
  maybeSingle(): Promise<Result>;
  then<T>(res: (r: Result) => T, rej?: (e: unknown) => T): Promise<T>;
}

/** 호출 순서를 `events`에 남기는 supabase 스텁. resolver가 테이블 조회·쓰기 결과를 정한다. */
function createStub(
  opts: {
    resolve?: (entry: Entry) => Result;
    uploadError?: (filePath: string) => string | null;
    removeError?: string | null;
  } = {}
) {
  const events: string[] = [];
  const uploads: { path: string; contentType: string }[] = [];
  const removes: string[][] = [];
  const entries: Entry[] = [];

  const resolve = opts.resolve ?? (() => ({ data: [], error: null }));

  function builder(table: string) {
    const entry: Entry = { table, op: 'select', filters: [] };
    const b: StubBuilder = {
      select(cols, o) {
        entry.cols = cols;
        entry.opts = o;
        return b;
      },
      insert(payload) {
        entry.op = 'insert';
        entry.payload = payload;
        return b;
      },
      delete() {
        entry.op = 'delete';
        return b;
      },
      eq(k, v) {
        entry.filters.push(['eq', k, v]);
        return b;
      },
      is(k, v) {
        entry.filters.push(['is', k, v]);
        return b;
      },
      in(k, v) {
        entry.filters.push(['in', k, v]);
        return b;
      },
      limit() {
        return b;
      },
      maybeSingle: () => finish(),
      then: (res, rej) => finish().then(res, rej),
    };
    function finish(): Promise<Result> {
      entries.push(entry);
      events.push(`${entry.op}:${table}`);
      return Promise.resolve(resolve(entry));
    }
    return b;
  }

  const supabase = {
    from: (table: string) => builder(table),
    storage: {
      from: (bucket: string) => ({
        upload: async (filePath: string, _buf: Buffer, o: { contentType: string }) => {
          events.push(`upload:${path.extname(filePath).slice(1)}`);
          uploads.push({ path: `${bucket}/${filePath}`, contentType: o.contentType });
          const message = opts.uploadError?.(filePath);
          return message ? { data: null, error: { message } } : { data: { path: filePath }, error: null };
        },
        remove: async (paths: string[]) => {
          events.push('remove');
          removes.push(paths);
          return opts.removeError ? { data: null, error: { message: opts.removeError } } : { data: [], error: null };
        },
        getPublicUrl: (filePath: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${filePath}` } }),
      }),
    },
  };

  const count = (op: string, table?: string) => entries.filter((e) => e.op === op && (!table || e.table === table)).length;
  return { supabase, events, uploads, removes, entries, count };
}

function createOut() {
  const logs: string[] = [];
  const errors: string[] = [];
  return { out: { log: (s: string) => logs.push(s), error: (s: string) => errors.push(s) }, logs, errors };
}

const fakeWebp = async () => Buffer.from('webp-bytes');
const fixedUuid = () => CARD_ID;
const fixedNow = () => NOW_MS;

let workDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-home-feed-flow-test-'));
  fs.cpSync(FIXTURE_DIR, workDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function bundleOf(dir = workDir) {
  const bundleFile = path.join(dir, 'bundle.json');
  const { errors, bundle } = validateHomeFeedBundle(readBundleFile(bundleFile), { bundleFile });
  expect(errors).toEqual([]);
  return bundle;
}

function registerArgs(extra: string[] = []) {
  return parseRegisterArgs(['--bundle', path.join(workDir, 'bundle.json'), ...extra]);
}

function editBundle(mutate: (raw: Record<string, Record<string, unknown>>) => void) {
  const file = path.join(workDir, 'bundle.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(raw);
  fs.writeFileSync(file, JSON.stringify(raw));
}

describe('homeFeedStoragePathsFor', () => {
  it('적용 탭과 같은 규칙 today_cards/asset-generator/{id}.png|webp다', () => {
    expect(homeFeedStoragePathsFor(CARD_ID)).toEqual({
      pngPath: `today_cards/asset-generator/${CARD_ID}.png`,
      webpPath: `today_cards/asset-generator/${CARD_ID}.webp`,
    });
  });
});

describe('registerHomeFeedCard — 순서와 실패 처리', () => {
  it('원본 PNG 업로드 → WebP 업로드 → 카드 행 insert 순서로 등록하고 cover_image_url은 ?v= 붙은 WebP, image_source는 agent-generator다', async () => {
    const stub = createStub();
    const result = await registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow });

    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'insert:today_cards']);
    expect(stub.uploads).toEqual([
      { path: `images/today_cards/asset-generator/${CARD_ID}.png`, contentType: 'image/png' },
      { path: `images/today_cards/asset-generator/${CARD_ID}.webp`, contentType: 'image/webp' },
    ]);
    const insert = stub.entries.find((e) => e.op === 'insert')!;
    expect(insert.payload).toEqual(result.payload);
    expect(insert.payload).toMatchObject({
      id: CARD_ID,
      cover_image_url: `https://cdn.test/images/today_cards/asset-generator/${CARD_ID}.webp?v=${NOW_MS}`,
      image_source: 'agent-generator',
      title: '[TEST] 예시 주간 홈피드 카드',
      is_active: false,
    });
    expect(insert.payload).not.toHaveProperty('image_url');
    expect(result).toMatchObject({
      cardId: CARD_ID,
      bucket: 'images',
      pngPath: `today_cards/asset-generator/${CARD_ID}.png`,
      webpPath: `today_cards/asset-generator/${CARD_ID}.webp`,
      originalUrl: `https://cdn.test/images/today_cards/asset-generator/${CARD_ID}.png`,
      webpBytes: 'webp-bytes'.length,
    });
    expect(result.registeredAt.getTime()).toBe(NOW_MS);
  });

  it('insert가 실패하면 올라간 파일 2개를 지우고 실패로 끝낸다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'check violation' } } : { data: [] }) });
    await expect(registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })).rejects.toThrow(
      '카드 행 등록에 실패했어요: check violation 올라간 이미지 파일 2개는 지웠어요.'
    );
    expect(stub.removes).toEqual([[`today_cards/asset-generator/${CARD_ID}.png`, `today_cards/asset-generator/${CARD_ID}.webp`]]);
  });

  it('insert 실패 뒤 파일 삭제도 실패하면 직접 지울 경로를 알린다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'boom' } } : { data: [] }), removeError: 'storage down' });
    await expect(registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })).rejects.toThrow(
      `직접 지워 주세요(today_cards/asset-generator/${CARD_ID}.png, today_cards/asset-generator/${CARD_ID}.webp): storage down`
    );
  });

  it('WebP 업로드가 실패하면 올라간 PNG를 지우고 insert는 하지 않는다', async () => {
    const stub = createStub({ uploadError: (p) => (p.endsWith('.webp') ? 'quota' : null) });
    await expect(registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })).rejects.toThrow(
      'WebP 이미지 업로드에 실패했어요: quota 올라간 파일은 지웠고, 카드 행은 만들지 않았어요.'
    );
    expect(stub.removes).toEqual([[`today_cards/asset-generator/${CARD_ID}.png`]]);
    expect(stub.count('insert')).toBe(0);
  });

  it('원본 업로드가 실패하면 지울 파일이 없고 insert도 하지 않는다', async () => {
    const stub = createStub({ uploadError: () => 'denied' });
    await expect(registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })).rejects.toThrow(
      '원본 이미지 업로드에 실패했어요: denied 저장소에는 아무것도 남지 않았고, 카드 행은 만들지 않았어요.'
    );
    expect(stub.removes).toEqual([]);
    expect(stub.count('insert')).toBe(0);
  });

  it('WebP 변환이 실패하면 업로드 전에 멈춘다', async () => {
    const stub = createStub();
    const failing = async () => {
      throw new Error('bad image');
    };
    await expect(registerHomeFeedCard({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: failing, randomUUID: fixedUuid, now: fixedNow })).rejects.toThrow(
      '이미지를 WebP로 변환하지 못했어요: bad image'
    );
    expect(stub.events).toEqual([]);
  });
});

describe('runHomeFeedDbChecks', () => {
  function payloadWith(extra: Record<string, unknown> = {}) {
    const bundle = bundleOf();
    return buildTodayCardInsertPayload({ ...bundle.card, ...extra }, { id: 'x', coverImageUrl: 'y' });
  }

  it('supabase가 없으면 읽기 검사를 건너뜀으로 표시하고 실패로 보지 않는다', async () => {
    const { checks, errors } = await runHomeFeedDbChecks({
      supabase: null,
      payload: payloadWith({ template_type: 'progress_nudge', mission_id: MISSION_ID, badge_ids: [BADGE_ID] }),
    });
    expect(errors).toEqual([]);
    expect(checks.find((c) => c.label === '제목·시작 일시 중복')!.status).toBe('건너뜀');
    expect(checks.find((c) => c.label === '미션 존재')!.status).toBe('건너뜀');
    expect(checks.find((c) => c.label === '배지 존재')!.status).toBe('건너뜀');
    expect(checks.find((c) => c.label === '컬렉션 존재')!.status).toBe('해당 없음');
  });

  it('제목과 시작 일시가 같은 카드가 있으면 중복으로 거절하고, 제목만 같은 카드는 막지 않는다', async () => {
    const payload = payloadWith();
    const dup = createStub({ resolve: () => ({ data: [{ id: 'existing-id' }] }) });
    const result = await runHomeFeedDbChecks({ supabase: dup.supabase, payload });
    expect(result.errors).toEqual([
      '제목·시작 일시 중복: 같은 제목·같은 시작 일시의 카드가 이미 있어요(id: existing-id). 기존 카드 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.',
    ]);
    // 제목과 «시작 일시» 둘 다로 조회한다 — 제목만으로 조회하면 날짜만 다른 정상 카드를 막는다.
    expect(dup.entries[0].table).toBe('today_cards');
    expect(dup.entries[0].filters).toEqual([
      ['eq', 'title', '[TEST] 예시 주간 홈피드 카드'],
      ['eq', 'starts_at', '2098-12-31T15:00:00.000Z'],
    ]);

    const none = createStub({ resolve: () => ({ data: [] }) });
    expect((await runHomeFeedDbChecks({ supabase: none.supabase, payload })).errors).toEqual([]);
  });

  it('참조한 미션·컬렉션·랭킹 모드가 없으면 그 id를 알린다', async () => {
    const payload = payloadWith({
      template_type: 'editorial_article',
      mission_id: MISSION_ID,
      item_book_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ranking_mode_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });
    const stub = createStub({ resolve: (e) => (e.table === 'today_cards' ? { data: [] } : { data: null, error: null }) });
    const { errors } = await runHomeFeedDbChecks({ supabase: stub.supabase, payload });
    expect(errors).toEqual([
      `미션 존재: mission_id에 해당하는 미션이 없어요: ${MISSION_ID}`,
      '컬렉션 존재: item_book_id에 해당하는 컬렉션이 없어요: dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '랭킹 모드 존재: ranking_mode_id에 해당하는 랭킹 모드가 없어요: eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ]);
  });

  it('배지는 삭제되지 않은 것만 인정하고, 없는 배지 id를 모두 알린다', async () => {
    const other = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const payload = payloadWith({ template_type: 'badge_spotlight', badge_ids: [BADGE_ID, other] });
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [{ id: BADGE_ID }] } : { data: [] }) });
    const { errors } = await runHomeFeedDbChecks({ supabase: stub.supabase, payload });
    expect(errors).toEqual([`배지 존재: badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${other}`]);
    const badgeRead = stub.entries.find((e) => e.table === 'badges')!;
    expect(badgeRead.filters).toEqual([
      ['in', 'id', [BADGE_ID, other]],
      ['is', 'deleted_at', null],
    ]);
  });

  it('DB 읽기 오류는 실패로 알린다(확인하지 못한 채 통과시키지 않는다)', async () => {
    const stub = createStub({ resolve: () => ({ error: { message: 'permission denied' } }) });
    const { errors, checks } = await runHomeFeedDbChecks({ supabase: stub.supabase, payload: payloadWith() });
    expect(errors).toEqual(['제목·시작 일시 중복: DB 조회에 실패했어요: permission denied']);
    expect(checks[0].status).toBe('실패');
  });

  it('읽기 검사는 select만 한다', async () => {
    const stub = createStub();
    await runHomeFeedDbChecks({
      supabase: stub.supabase,
      payload: payloadWith({ template_type: 'progress_nudge', mission_id: MISSION_ID, badge_ids: [BADGE_ID] }),
    });
    expect(stub.entries.length).toBeGreaterThan(0);
    expect(stub.entries.every((e) => e.op === 'select')).toBe(true);
  });
});

describe('runHomeFeedRegister — --dry-run', () => {
  it('스텁 supabase가 있어도 업로드·insert·삭제를 한 번도 호출하지 않고 기록 파일도 만들지 않는다(읽기만 한다)', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });

    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.uploads).toHaveLength(0);
    expect(stub.removes).toHaveLength(0);
    expect(stub.entries.every((e) => e.op === 'select')).toBe(true);
    expect(logs.join('\n')).toContain('결과: 통과');
    expect(logs.join('\n')).toContain('DB·저장소에는 아무것도 쓰지 않았어요.');
    expect(fs.readdirSync(workDir).sort()).toEqual(['bundle.json', 'image.png']);
  });

  it('서비스 키가 없으면(supabase null) DB 검사를 건너뜀으로 표시하고 로컬 검증만으로 통과한다', async () => {
    const { out, logs } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('- 제목·시작 일시 중복: 건너뜀');
  });

  it('DB 검사가 실패하면 종료 코드 1이고 사유가 요약에 나온다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: 'existing-id' }] }) });
    const { out, logs } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('결과: 실패 (1건)');
    expect(logs.join('\n')).toContain('같은 제목·같은 시작 일시의 카드가 이미 있어요(id: existing-id)');
  });

  it('필수 필드·허용값을 어긴 묶음은 종료 코드 1이고 사유를 모두 보여 주며 DB는 읽지 않는다', async () => {
    editBundle((raw) => {
      raw.card.template_type = 'weekly_recap';
      raw.card.exposure_tags = [];
      delete raw.card.title;
    });
    const stub = createStub();
    const { out, logs } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    const text = logs.join('\n');
    expect(code).toBe(1);
    expect(text).toContain('card.title: 필수 항목이 없어요.');
    expect(text).toContain('card.template_type:');
    expect(text).toContain('card.exposure_tags: 노출 조건 태그를 1개 이상');
    expect(text).not.toContain('[홈피드 카드]');
    expect(stub.events).toEqual([]);
  });

  it('묶음 파일이 없으면 종료 코드 1이다', async () => {
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({
      args: parseRegisterArgs(['--bundle', path.join(workDir, 'none.json'), '--dry-run']),
      supabase: null,
      convertToWebp: fakeWebp,
      randomUUID: fixedUuid,
      now: fixedNow,
      out,
    });
    expect(code).toBe(1);
    expect(errors[0]).toContain('묶음 파일을 찾을 수 없어요');
  });

  it('WebP 변환이 실패하는 이미지는 dry-run에서 미리 잡는다', async () => {
    const failing = async () => {
      throw new Error('unsupported image');
    };
    const { out, logs } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: failing, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('WebP 변환 미리 확인: 실패 — unsupported image');
  });

  it('이미 등록한 묶음(기록 파일 있음)은 dry-run에서도 실패로 알린다', async () => {
    fs.writeFileSync(path.join(workDir, 'registration-record.json'), '{}');
    const { out, logs } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('이미 등록한 묶음으로 보여요');
  });
});

describe('runHomeFeedRegister — 예시 묶음 dry-run(실제 파일·실제 WebP 변환)', () => {
  it('예시 묶음을 로컬 검증만으로 통과시키고 컨펌 자료를 내며 예시 폴더에 아무것도 쓰지 않는다', async () => {
    const { out, logs, errors } = createOut();
    const before = fs.readdirSync(FIXTURE_DIR).sort();
    const code = await runHomeFeedRegister({
      args: parseRegisterArgs(['--bundle', path.join(FIXTURE_DIR, 'bundle.json'), '--dry-run']),
      supabase: null,
      convertToWebp: convertBadgeImageToWebp,
      randomUUID: fixedUuid,
      now: fixedNow,
      out,
    });
    const text = logs.join('\n');
    expect(errors).toEqual([]);
    expect(code).toBe(0);
    expect(text).toContain('결과: 통과');
    expect(text).toContain('- 제목: [TEST] 예시 주간 홈피드 카드');
    expect(text).toContain('- 상태: 비활성(어디에도 노출하지 않음)');
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- WebP 변환 미리 확인: 통과');
    expect(text).toContain('[등록 예정 내용]');
    expect(text).toContain('image_source = agent-generator');
    expect(text).toContain('[되돌림 SQL 미리보기]');
    expect(fs.readdirSync(FIXTURE_DIR).sort()).toEqual(before);
    expect(before).toEqual(['bundle.json', 'image.png']);
  });
});

describe('runHomeFeedRegister — 실제 등록', () => {
  it('등록하면 중복 조회 → 업로드 → insert 뒤 기록 파일 2개를 쓰고, 같은 묶음은 다시 등록하지 않는다', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const run = () => runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });

    expect(await run()).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.events).toEqual(['select:today_cards', 'upload:png', 'upload:webp', 'insert:today_cards']);

    const record = JSON.parse(fs.readFileSync(path.join(workDir, 'registration-record.json'), 'utf8'));
    expect(record.card.id).toBe(CARD_ID);
    expect(record.card.image_source).toBe('agent-generator');
    expect(record.registered_at).toBe('2026-09-25T10:31:02+09:00');
    expect(record.storage.png_path).toBe(`today_cards/asset-generator/${CARD_ID}.png`);
    expect(record.urls.cover_image_url).toContain('?v=');
    expect(record.world_review.world_related).toBe(false);
    const sql = fs.readFileSync(path.join(workDir, 'registration.sql'), 'utf8');
    expect(sql).toContain('INSERT INTO public.today_cards (');
    expect(sql).toContain("'agent-generator'");
    expect(sql).toContain(`-- delete from public.today_cards where id = '${CARD_ID}';`);
    for (const { table } of UNDO_REFERENCE_TABLES) expect(sql).toContain(table);
    expect(logs.join('\n')).toContain('seed_agent_home_feed_example_home_feed_card.sql');
    expect(logs.join('\n')).toContain('register-home-feed-card.mjs --undo');

    const uploadsBefore = stub.uploads.length;
    const second = createOut();
    const secondCode = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out: second.out });
    expect(secondCode).toBe(1);
    expect(second.errors.join('\n')).toContain('이미 등록한 묶음으로 보여요');
    expect(stub.uploads).toHaveLength(uploadsBefore);
  });

  it('--record-dir을 주면 기록을 그 폴더에 쓴다', async () => {
    const stub = createStub();
    const { out } = createOut();
    const recordDir = path.join(workDir, 'records');
    const code = await runHomeFeedRegister({ args: registerArgs(['--record-dir', recordDir]), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(recordDir, 'registration-record.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('같은 제목·시작 일시의 카드가 있으면 중복으로 거절하고 아무것도 쓰지 않는다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: 'existing-id' }] }) });
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('같은 제목·같은 시작 일시의 카드가 이미 있어요(id: existing-id)');
    expect(stub.uploads).toHaveLength(0);
    expect(stub.count('insert')).toBe(0);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('같은 제목이라도 시작 일시가 다르면(날짜만 다른 카드) 등록한다', async () => {
    // 조회 조건에 시작 일시가 들어가므로 DB는 «없음»을 돌려준다.
    const stub = createStub({ resolve: (e) => ({ data: e.filters.some((f) => f[1] === 'starts_at') ? [] : [{ id: 'other-week' }] }) });
    const { out } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(stub.count('insert', 'today_cards')).toBe(1);
  });

  it('insert가 실패하면 파일을 지우고 종료 코드 1이며 기록 파일은 만들지 않는다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'check violation' } } : { data: [] }) });
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('카드 행 등록에 실패했어요: check violation');
    expect(stub.removes).toHaveLength(1);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('서비스 키가 없으면(supabase null) 등록하지 않는다', async () => {
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors[0]).toContain('.env.local에 없어서 등록할 수 없어요');
  });

  it('허용값을 어긴 묶음은 DB를 읽기 전에 멈추고 등록되지 않는다', async () => {
    editBundle((raw) => {
      raw.card.layout_type = 'giant';
    });
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('card.layout_type:');
    expect(stub.events).toEqual([]);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('제목에 줄바꿈이 섞인 묶음은 등록되지 않는다(기록 SQL 주석 방어)', async () => {
    editBundle((raw) => {
      raw.card.title = '카드\n; drop table today_cards; --';
    });
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runHomeFeedRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('card.title: 줄바꿈이나 제어 문자를 쓸 수 없어요');
    expect(stub.events).toEqual([]);
  });
});

describe('UNDO_REFERENCE_TABLES', () => {
  it('today_cards를 참조하는 외래 키와 같다(생성 타입 대조)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'types', 'database.generated.ts'), 'utf8');
    // 표별로 잘라서 referencedRelation: "today_cards"인 FK의 표·컬럼을 뽑는다.
    const found: string[] = [];
    const tablePattern = /^      (\w+): \{\n        Row: \{/gm;
    const starts = [...source.matchAll(tablePattern)].map((m) => ({ name: m[1], index: m.index! }));
    starts.forEach((start, i) => {
      const block = source.slice(start.index, starts[i + 1]?.index ?? source.length);
      for (const fk of block.matchAll(/columns: \["(\w+)"\]\n\s+isOneToOne: \w+\n\s+referencedRelation: "today_cards"/g)) {
        found.push(`${start.name}.${fk[1]}`);
      }
    });
    const declared = UNDO_REFERENCE_TABLES.map((r: { table: string; column: string }) => `${r.table}.${r.column}`);
    expect(declared.sort()).toEqual(found.sort());
    expect(found).toEqual(['today_card_events.card_id']);
  });

  it('마이그레이션 183의 삭제 규칙은 ON DELETE SET NULL이다(이 규칙이 바뀌면 되돌림 안전장치를 다시 봐야 한다)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'supabase', 'migrations', '183_today_card_type_and_events.sql'), 'utf8');
    expect(sql).toContain('card_id           UUID REFERENCES public.today_cards(id) ON DELETE SET NULL');
  });
});

describe('되돌림 — undoHomeFeedRegistration·runHomeFeedUndo', () => {
  function recordFor(id = CARD_ID) {
    const paths = homeFeedStoragePathsFor(id);
    return { record_version: 1, card: { id, title: '[TEST] 예시 주간 홈피드 카드' }, storage: { bucket: 'images', png_path: paths.pngPath, webp_path: paths.webpPath } };
  }

  /** 카드 행이 있고 참조 카운트는 `counts`(표 이름 → 건수)로 정하는 스텁 */
  function undoStub(counts: Record<string, number> = {}, row: unknown = { id: CARD_ID, title: 't', image_source: 'agent-generator' }, extra: Parameters<typeof createStub>[0] = {}) {
    return createStub({
      ...extra,
      resolve: (e) => {
        if (e.table === 'today_cards' && e.op === 'select') return { data: row, error: null };
        if (e.op === 'delete') return { error: null };
        if (e.opts?.head) return { count: counts[e.table] ?? 0, error: null };
        return { data: [] };
      },
    });
  }

  it('참조가 없으면 카드 행을 먼저 지우고 파일 2개를 지운다', async () => {
    const stub = undoStub();
    const result = await undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ cardId: CARD_ID, rowFound: true, rowDeleted: true, filesRemoved: true, warnings: [] });
    expect(stub.events).toEqual(['select:today_cards', 'select:today_card_events', 'delete:today_cards', 'remove']);
    expect(stub.removes).toEqual([[`today_cards/asset-generator/${CARD_ID}.png`, `today_cards/asset-generator/${CARD_ID}.webp`]]);
    // image_source가 agent-generator인 행만 지우도록 조건이 붙는다.
    expect(stub.entries.find((e) => e.op === 'delete')!.filters).toEqual([
      ['eq', 'id', CARD_ID],
      ['eq', 'image_source', 'agent-generator'],
    ]);
  });

  it('노출·열람 기록은 today_card_events.card_id로 센다', async () => {
    const stub = undoStub();
    await undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    const reads = stub.entries.filter((e) => e.opts?.head);
    expect(reads.map((e) => [e.table, e.cols, e.filters[0]])).toEqual([['today_card_events', 'card_id', ['eq', 'card_id', CARD_ID]]]);
  });

  it('today_card_events에 기록이 붙어 있으면 아무것도 지우지 않고 중단한다', async () => {
    const stub = undoStub({ today_card_events: 3 });
    await expect(undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      '이미 노출·열람 기록이 붙어서 되돌리지 않고 중단했어요 — today_card_events 3건. 지우면 그 기록의 card_id가 비게 돼요. 삭제 대신 어드민에서 카드를 비활성으로 바꿔 주세요.'
    );
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('참조를 읽지 못하면 확인 없이 지우지 않고 중단한다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.table === 'today_cards') return { data: { id: CARD_ID, image_source: 'agent-generator' }, error: null };
        return { error: { message: 'permission denied' } };
      },
    });
    await expect(undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      'today_card_events 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): permission denied'
    );
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('agent-generator가 아닌 카드(seed SQL 등록 카드는 NULL)는 지우지 않는다', async () => {
    const admin = undoStub({}, { id: CARD_ID, title: 't', image_source: 'admin-generator' });
    await expect(undoHomeFeedRegistration({ supabase: admin.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      '에이전트 등록(image_source=agent-generator)이 아니라서 지우지 않아요(현재 값: admin-generator)'
    );
    const seeded = undoStub({}, { id: CARD_ID, title: 't', image_source: null });
    await expect(undoHomeFeedRegistration({ supabase: seeded.supabase, record: recordFor(), dryRun: false })).rejects.toThrow('(현재 값: 없음)');
    expect(admin.count('delete') + seeded.count('delete')).toBe(0);
  });

  it('카드 행 삭제가 실패하면 이미지 파일은 그대로 두고 중단한다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.table === 'today_cards' && e.op === 'select') return { data: { id: CARD_ID, image_source: 'agent-generator' }, error: null };
        if (e.op === 'delete') return { error: { message: 'fk violation' } };
        return { count: 0, error: null };
      },
    });
    await expect(undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow('카드 행을 지우지 못해서 중단했어요(이미지 파일은 그대로 뒀어요): fk violation');
    expect(stub.removes).toEqual([]);
  });

  it('카드 행이 이미 없으면 저장소 파일만 정리하고 알린다', async () => {
    const stub = undoStub({}, null);
    const result = await undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ rowFound: false, rowDeleted: false, filesRemoved: true });
    expect(result.warnings).toEqual(['카드 행이 이미 없어서 저장소 파일만 정리해요.']);
    expect(stub.events).toEqual(['select:today_cards', 'remove']);
  });

  it('파일 삭제가 실패하면 직접 지울 경로를 경고로 남긴다', async () => {
    const stub = undoStub({}, undefined, { removeError: 'storage down' });
    const result = await undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result.rowDeleted).toBe(true);
    expect(result.filesRemoved).toBe(false);
    expect(result.warnings[0]).toContain('직접 지워 주세요');
  });

  it('dryRun이면 참조 확인까지만 하고 아무것도 지우지 않는다', async () => {
    const stub = undoStub();
    const result = await undoHomeFeedRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    expect(result).toMatchObject({ rowFound: true, rowDeleted: false, filesRemoved: false });
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('기록이 망가졌거나 저장소 경로가 규칙과 다르면 시작하지 않는다', async () => {
    expect(findHomeFeedRecordUndoError(null)).toContain('최상위는 객체');
    expect(findHomeFeedRecordUndoError({ card: { id: 'x' } })).toContain('UUID 형식이 아니에요');
    const tampered = recordFor();
    tampered.storage.png_path = 'missions/asset-generator/other.png';
    expect(findHomeFeedRecordUndoError(tampered)).toContain('저장소 경로가 규칙');
    const stub = undoStub();
    await expect(undoHomeFeedRegistration({ supabase: stub.supabase, record: tampered, dryRun: false })).rejects.toThrow('저장소 경로가 규칙');
    expect(stub.events).toEqual([]);
  });

  it('runHomeFeedUndo: 성공하면 0, 기록이 붙어 있으면 1이며 사유를 알린다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const args = parseRegisterArgs(['--undo', recordPath]);

    const ok = createOut();
    expect(await runHomeFeedUndo({ args, supabase: undoStub().supabase, out: ok.out })).toBe(0);
    expect(ok.logs.join('\n')).toContain('- 카드 행: 삭제했어요');

    const blocked = createOut();
    expect(await runHomeFeedUndo({ args, supabase: undoStub({ today_card_events: 1 }).supabase, out: blocked.out })).toBe(1);
    expect(blocked.errors.join('\n')).toContain('today_card_events 1건');
  });

  it('runHomeFeedUndo --dry-run: 삭제 대상만 보여 주고 쓰지 않는다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const stub = undoStub();
    const { out, logs } = createOut();
    const code = await runHomeFeedUndo({ args: parseRegisterArgs(['--undo', recordPath, '--dry-run']), supabase: stub.supabase, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('== 되돌림 검증 (--dry-run) ==');
    expect(logs.join('\n')).toContain('지울 대상: today_cards 행 1건(있을 때), 저장소 파일 2개');
    expect(stub.count('delete')).toBe(0);
  });

  it('runHomeFeedUndo: 기록 파일이 없거나 서비스 키가 없으면 1이다', async () => {
    const missing = createOut();
    expect(await runHomeFeedUndo({ args: parseRegisterArgs(['--undo', path.join(workDir, 'nope.json')]), supabase: undoStub().supabase, out: missing.out })).toBe(1);
    expect(missing.errors[0]).toContain('등록 기록 파일을 찾을 수 없어요');

    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const noKey = createOut();
    expect(await runHomeFeedUndo({ args: parseRegisterArgs(['--undo', recordPath]), supabase: null, out: noKey.out })).toBe(1);
    expect(noKey.errors[0]).toContain('.env.local에 없어서 되돌릴 수 없어요');
  });
});
