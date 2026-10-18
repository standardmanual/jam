/**
 * 배지 등록 — 등록 순서·실패 처리·중복 거절·dry-run 무쓰기·되돌림 안전장치 (티켓 20260924_2202)
 *
 * 실제 Supabase에는 접근하지 않는다. 클라이언트는 호출을 순서대로 기록하는 스텁이다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertBadgeImageToWebp } from '../../../src/lib/admin/badgeImageWebp';
import { parseRegisterArgs } from '../registerArgs.mjs';
import { registerBadge, runDbChecks, runRegister, runUndo, storagePathsFor, undoRegistration, UNDO_ARRAY_REFERENCE_COLUMNS, UNDO_REFERENCE_TABLES } from '../registerFlow.mjs';
import { validateBundle, readBundleFile } from '../registerBundle.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-bundle');
const BADGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW_MS = Date.UTC(2026, 8, 25, 1, 31, 2); // 2026-09-25 10:31:02 KST

type Entry = {
  table: string;
  op: string;
  filters: unknown[][];
  payload?: Record<string, unknown>;
  opts?: { head?: boolean; count?: string };
  cols?: string;
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
  contains(k: string, v: unknown): StubBuilder;
  limit(n?: number): StubBuilder;
  maybeSingle(): Promise<Result>;
  single(): Promise<Result>;
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
      contains(k, v) {
        entry.filters.push(['contains', k, v]);
        return b;
      },
      limit() {
        return b;
      },
      maybeSingle: () => finish(),
      single: () => finish(),
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
const fixedUuid = () => BADGE_ID;
const fixedNow = () => NOW_MS;

let workDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-flow-test-'));
  fs.cpSync(FIXTURE_DIR, workDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function bundleOf(dir = workDir) {
  const bundleFile = path.join(dir, 'bundle.json');
  const { errors, bundle } = validateBundle(readBundleFile(bundleFile), { bundleFile });
  expect(errors).toEqual([]);
  return bundle;
}

function registerArgs(extra: string[] = []) {
  return parseRegisterArgs(['--bundle', path.join(workDir, 'bundle.json'), ...extra]);
}

describe('registerBadge — 순서와 실패 처리', () => {
  it('원본 PNG 업로드 → WebP 업로드 → 배지 행 insert 순서로 등록하고 이미지 URL은 ?v= 붙은 WebP다', async () => {
    const stub = createStub();
    const result = await registerBadge({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow });

    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'insert:badges']);
    expect(stub.uploads).toEqual([
      { path: `images/badges/asset-generator/${BADGE_ID}.png`, contentType: 'image/png' },
      { path: `images/badges/asset-generator/${BADGE_ID}.webp`, contentType: 'image/webp' },
    ]);
    const payload = stub.entries.find((e) => e.op === 'insert')!.payload!;
    expect(payload.id).toBe(BADGE_ID);
    expect(payload.image_source).toBe('agent-generator');
    expect(payload.image_url).toBe(`https://cdn.test/images/badges/asset-generator/${BADGE_ID}.webp?v=${NOW_MS}`);
    expect(result.badgeId).toBe(BADGE_ID);
    expect(result.originalUrl).toBe(`https://cdn.test/images/badges/asset-generator/${BADGE_ID}.png`);
    expect(result.registeredAt.getTime()).toBe(NOW_MS);
    expect(stub.removes).toEqual([]);
  });

  it('insert가 실패하면 올라간 파일 2개를 지우고 실패로 끝낸다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'duplicate key' } } : { data: [] }) });
    await expect(
      registerBadge({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('배지 행 등록에 실패했어요: duplicate key 올라간 이미지 파일 2개는 지웠어요.');
    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'insert:badges', 'remove']);
    expect(stub.removes).toEqual([[`badges/asset-generator/${BADGE_ID}.png`, `badges/asset-generator/${BADGE_ID}.webp`]]);
  });

  it('insert 실패 뒤 파일 삭제도 실패하면 직접 지울 경로를 알린다', async () => {
    const stub = createStub({
      resolve: (e) => (e.op === 'insert' ? { error: { message: 'boom' } } : { data: [] }),
      removeError: 'storage down',
    });
    await expect(
      registerBadge({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow(`직접 지워 주세요(badges/asset-generator/${BADGE_ID}.png, badges/asset-generator/${BADGE_ID}.webp): storage down`);
  });

  it('WebP 업로드가 실패하면 올라간 PNG를 지우고 insert는 하지 않는다', async () => {
    const stub = createStub({ uploadError: (p) => (p.endsWith('.webp') ? 'quota exceeded' : null) });
    await expect(
      registerBadge({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('WebP 이미지 업로드에 실패했어요: quota exceeded 올라간 파일은 지웠고, 배지 행은 만들지 않았어요.');
    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'remove']);
    expect(stub.removes).toEqual([[`badges/asset-generator/${BADGE_ID}.png`]]);
    expect(stub.count('insert')).toBe(0);
  });

  it('원본 업로드가 실패하면 지울 파일이 없고 insert도 하지 않는다', async () => {
    const stub = createStub({ uploadError: () => 'no space' });
    await expect(
      registerBadge({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('원본 이미지 업로드에 실패했어요: no space 저장소에는 아무것도 남지 않았고');
    expect(stub.events).toEqual(['upload:png']);
    expect(stub.removes).toEqual([]);
  });

  it('WebP 변환이 실패하면 업로드 전에 멈춘다', async () => {
    const stub = createStub();
    await expect(
      registerBadge({
        supabase: stub.supabase,
        bundle: bundleOf(),
        convertToWebp: async () => {
          throw new Error('corrupt');
        },
        randomUUID: fixedUuid,
        now: fixedNow,
      })
    ).rejects.toThrow('이미지를 WebP로 변환하지 못했어요: corrupt');
    expect(stub.events).toEqual([]);
  });
});

describe('runDbChecks', () => {
  const badge = { name: '이름', tribe_id: '22222222-2222-4222-8222-222222222222', item_book_id: '33333333-3333-4333-8333-333333333333' };

  it('supabase가 없으면 읽기 검사를 건너뜀으로 표시하고 실패로 보지 않는다', async () => {
    const { checks, errors } = await runDbChecks({ supabase: null, badge });
    expect(errors).toEqual([]);
    expect(checks.map((c) => [c.label, c.status])).toEqual([
      ['이름 중복', '건너뜀'],
      ['트라이브 존재', '건너뜀'],
      ['컬렉션 존재', '건너뜀'],
      ['체크인 배지 이름 목록', '해당 없음'],
    ]);
  });

  it('같은 이름의 삭제되지 않은 배지가 있으면 중복으로 거절한다', async () => {
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [{ id: 'existing-id' }] } : { data: { id: 'x' } }) });
    const { errors } = await runDbChecks({ supabase: stub.supabase, badge });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('이름 중복: 같은 이름의 배지가 이미 있어요(id: existing-id)');
    // 삭제된 배지는 중복으로 보지 않는다 — 조회에 deleted_at IS NULL 조건이 붙는다.
    expect(stub.entries[0].filters).toContainEqual(['is', 'deleted_at', null]);
    expect(stub.entries[0].filters).toContainEqual(['eq', 'name', '이름']);
  });

  it('트라이브·컬렉션이 없으면 각각 알린다', async () => {
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [] } : { data: null }) });
    const { errors } = await runDbChecks({ supabase: stub.supabase, badge });
    expect(errors).toEqual([
      `트라이브 존재: tribe_id에 해당하는 트라이브가 없어요: ${badge.tribe_id}`,
      `컬렉션 존재: item_book_id에 해당하는 컬렉션이 없어요: ${badge.item_book_id}`,
    ]);
  });

  it('DB 읽기 오류는 실패로 알린다(확인하지 못한 채 통과시키지 않는다)', async () => {
    const stub = createStub({ resolve: () => ({ error: { message: 'timeout' } }) });
    const { errors } = await runDbChecks({ supabase: stub.supabase, badge: { name: '이름' } });
    expect(errors).toEqual(['이름 중복: DB 조회에 실패했어요: timeout']);
  });

  it('읽기 검사는 select만 한다', async () => {
    const stub = createStub({ resolve: () => ({ data: [] }) });
    await runDbChecks({ supabase: stub.supabase, badge });
    expect(stub.entries.every((e) => e.op === 'select')).toBe(true);
  });
});

describe('runRegister — --dry-run', () => {
  it('스텁 supabase가 있어도 업로드·insert·삭제를 한 번도 호출하지 않는다(읽기만 한다)', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const code = await runRegister({
      args: registerArgs(['--dry-run']),
      supabase: stub.supabase,
      convertToWebp: fakeWebp,
      randomUUID: fixedUuid,
      now: fixedNow,
      out,
    });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.uploads).toHaveLength(0);
    expect(stub.removes).toHaveLength(0);
    expect(stub.count('insert')).toBe(0);
    expect(stub.count('delete')).toBe(0);
    expect(stub.count('select', 'badges')).toBe(1); // 이름 중복 조회 하나
    expect(logs.join('\n')).toContain('- 이름 중복: 통과');
    // 등록 기록 파일도 만들지 않는다.
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
    expect(fs.existsSync(path.join(workDir, 'registration.sql'))).toBe(false);
  });

  it('서비스 키가 없으면(supabase null) DB 검사를 건너뜀으로 표시하고 로컬 검증만으로 통과한다', async () => {
    const { out, logs } = createOut();
    const code = await runRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('- 이름 중복: 건너뜀');
  });

  it('DB 검사가 실패하면 종료 코드 1이고 사유가 요약에 나온다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: 'dup' }] }) });
    const { out, logs } = createOut();
    const code = await runRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('결과: 실패 (1건)');
    expect(stub.uploads).toHaveLength(0);
  });

  it('묶음이 틀리면 종료 코드 1이고 사유를 모두 보여 준다', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(workDir, 'bundle.json'), 'utf8'));
    raw.image.bg_color = 'red';
    delete raw.author;
    fs.writeFileSync(path.join(workDir, 'bundle.json'), JSON.stringify(raw));
    const { out, logs } = createOut();
    const code = await runRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    const text = logs.join('\n');
    expect(text).toContain('결과: 실패 (2건)');
    expect(text).toContain('author: 필수 항목이 없어요.');
    expect(text).toContain('image.bg_color: #rrggbb 형식이어야 해요');
  });

  it('묶음 파일이 없거나 JSON이 깨졌으면 종료 코드 1이다', async () => {
    const { out, errors } = createOut();
    const missing = parseRegisterArgs(['--bundle', path.join(workDir, 'nope.json'), '--dry-run']);
    expect(await runRegister({ args: missing, supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out })).toBe(1);
    expect(errors[0]).toContain('묶음 파일을 찾을 수 없어요');
  });

  it('WebP 변환이 실패하는 이미지는 dry-run에서 미리 잡는다', async () => {
    const { out, logs } = createOut();
    const code = await runRegister({
      args: registerArgs(['--dry-run']),
      supabase: null,
      convertToWebp: async () => {
        throw new Error('Input buffer contains unsupported image format');
      },
      randomUUID: fixedUuid,
      now: fixedNow,
      out,
    });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('이미지를 WebP로 변환하지 못했어요');
  });

  it('이미 등록한 묶음(기록 파일 있음)은 dry-run에서도 실패로 알린다', async () => {
    fs.writeFileSync(path.join(workDir, 'registration-record.json'), '{}');
    const { out, logs } = createOut();
    const code = await runRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('이미 등록한 묶음으로 보여요');
  });
});

describe('runRegister — 예시 묶음 dry-run(실제 파일·실제 WebP 변환)', () => {
  it('예시 묶음을 로컬 검증만으로 통과시키고 등록 예정 내용·되돌림 SQL 미리보기를 낸다', async () => {
    const { out, logs, errors } = createOut();
    const before = fs.readdirSync(FIXTURE_DIR).sort();
    const code = await runRegister({
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
    expect(text).toContain('- 이름: [TEST] 예시 산책 배지');
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- 배경색 → 끝색: #ff1a00 → #ff4dff');
    expect(text).toContain('- WebP 변환 미리 확인: 통과');
    expect(text).toContain('[등록 예정 내용]');
    expect(text).toContain('[되돌림 SQL 미리보기]');
    // 예시 폴더에 아무것도 쓰지 않았다.
    expect(fs.readdirSync(FIXTURE_DIR).sort()).toEqual(before);
    expect(before).toEqual(['bundle.json', 'image.png']);
  });
});

describe('runRegister — 실제 등록', () => {
  it('등록하면 업로드 → insert 뒤 기록 파일 2개를 쓰고, 같은 묶음은 다시 등록하지 않는다', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const run = () => runRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });

    expect(await run()).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.events).toEqual(['select:badges', 'upload:png', 'upload:webp', 'insert:badges']);

    const recordPath = path.join(workDir, 'registration-record.json');
    const sqlPath = path.join(workDir, 'registration.sql');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    expect(record.badge.id).toBe(BADGE_ID);
    expect(record.registered_at).toBe('2026-09-25T10:31:02+09:00');
    expect(record.storage.png_path).toBe(`badges/asset-generator/${BADGE_ID}.png`);
    expect(record.image.seed).toBe(20260925);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    expect(sql).toContain('INSERT INTO public.badges (');
    expect(sql).toContain(`-- delete from public.badges where id = '${BADGE_ID}';`);
    expect(logs.join('\n')).toContain('seed_agent_badge_example_badge.sql');

    // 두 번째 실행은 기록 파일이 있어 아무것도 쓰기 전에 거절한다.
    const uploadsBefore = stub.uploads.length;
    const second = createOut();
    const secondCode = await runRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out: second.out });
    expect(secondCode).toBe(1);
    expect(second.errors.join('\n')).toContain('이미 등록한 묶음으로 보여요');
    expect(stub.uploads).toHaveLength(uploadsBefore);
  });

  it('--record-dir을 주면 기록을 그 폴더에 쓴다', async () => {
    const stub = createStub();
    const { out } = createOut();
    const recordDir = path.join(workDir, 'records');
    const code = await runRegister({ args: registerArgs(['--record-dir', recordDir]), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(recordDir, 'registration-record.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('같은 이름의 배지가 있으면 중복으로 거절하고 아무것도 쓰지 않는다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: 'existing-id' }] }) });
    const { out, errors } = createOut();
    const code = await runRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('같은 이름의 배지가 이미 있어요(id: existing-id)');
    expect(stub.uploads).toHaveLength(0);
    expect(stub.count('insert')).toBe(0);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('insert가 실패하면 파일을 지우고 종료 코드 1이며 기록 파일은 만들지 않는다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'check violation' } } : { data: [] }) });
    const { out, errors } = createOut();
    const code = await runRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('배지 행 등록에 실패했어요: check violation');
    expect(stub.removes).toHaveLength(1);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('서비스 키가 없으면(supabase null) 등록하지 않는다', async () => {
    const { out, errors } = createOut();
    const code = await runRegister({ args: registerArgs(), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors[0]).toContain('.env.local에 없어서 등록할 수 없어요');
  });

  it('묶음 검증이 실패하면 DB를 읽기 전에 멈춘다', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(workDir, 'bundle.json'), 'utf8'));
    raw.badge.type = 'checkin';
    fs.writeFileSync(path.join(workDir, 'bundle.json'), JSON.stringify(raw));
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('checkin 배지는 POI 연결이 필요해서');
    expect(stub.events).toEqual([]);
  });
});

const ALL_REFERENCES = [...UNDO_REFERENCE_TABLES, ...UNDO_ARRAY_REFERENCE_COLUMNS];

describe('UNDO_ARRAY_REFERENCE_COLUMNS', () => {
  it('어드민 배지 삭제 참조 목록의 배열 컬럼과 같고, 생성 타입에서 배열(string[]) 컬럼이다', () => {
    const declared = UNDO_ARRAY_REFERENCE_COLUMNS.map((r: { table: string; column: string }) => `${r.table}.${r.column}`).sort();
    expect(declared).toEqual(['combination_recipe_slots.allowed_badge_ids', 'combination_recipes.reward_badge_ids', 'missions.reward_badge_ids', 'today_cards.badge_ids']);
    // 어드민 참조 목록에도 같은 위치가 있어야 한다(위치 문자열에 컬럼이 들어 있다).
    const adminSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'lib', 'admin', 'badge-references.ts'), 'utf8');
    for (const name of declared) expect(adminSource).toContain(name);
    const types = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'types', 'database.generated.ts'), 'utf8');
    for (const { table, column } of UNDO_ARRAY_REFERENCE_COLUMNS as { table: string; column: string }[]) {
      const start = types.indexOf(`      ${table}: {\n        Row: {`);
      expect(start).toBeGreaterThan(-1);
      const row = types.slice(start, types.indexOf('        Insert: {', start));
      expect(row).toMatch(new RegExp(`\\b${column}: string\\[\\]`));
    }
  });
});

describe('UNDO_REFERENCE_TABLES', () => {
  it('badges를 참조하는 외래 키 14곳과 같다(생성 타입 대조 — 스키마가 바뀌면 여기서 알아챈다)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'types', 'database.generated.ts'), 'utf8');
    // 표별로 잘라서 referencedRelation: "badges"인 FK의 표·컬럼을 뽑는다.
    const found: string[] = [];
    const tablePattern = /^      (\w+): \{\n        Row: \{/gm;
    const starts = [...source.matchAll(tablePattern)].map((m) => ({ name: m[1], index: m.index! }));
    starts.forEach((start, i) => {
      const block = source.slice(start.index, starts[i + 1]?.index ?? source.length);
      for (const fk of block.matchAll(/columns: \["(\w+)"\]\n\s+isOneToOne: \w+\n\s+referencedRelation: "badges"/g)) {
        found.push(`${start.name}.${fk[1]}`);
      }
    });
    const declared = UNDO_REFERENCE_TABLES.map((r: { table: string; column: string }) => `${r.table}.${r.column}`);
    expect(declared.sort()).toEqual(found.sort());
    expect(found).toHaveLength(14);
  });

  it('효과 분류는 연쇄 삭제 3곳·연결 해제 6곳·삭제 차단 5곳이다', () => {
    const tally: Record<string, number> = {};
    for (const r of UNDO_REFERENCE_TABLES as { effect: string }[]) tally[r.effect] = (tally[r.effect] ?? 0) + 1;
    expect(tally).toEqual({ '삭제 차단': 5, '연쇄 삭제': 3, '연결 해제': 6 });
  });
});

describe('되돌림 — undoRegistration·runUndo', () => {
  function recordFor(id = BADGE_ID) {
    const paths = storagePathsFor(id);
    return { record_version: 1, badge: { id, name: '[TEST] 예시 산책 배지' }, storage: { bucket: 'images', png_path: paths.pngPath, webp_path: paths.webpPath } };
  }

  /** 배지 행이 있고 참조 카운트는 `counts`로 정하는 스텁 */
  function undoStub(counts: Record<string, number> = {}, row: unknown = { id: BADGE_ID, name: 'n', image_source: 'agent-generator' }, extra: Parameters<typeof createStub>[0] = {}) {
    return createStub({
      ...extra,
      resolve: (e) => {
        if (e.table === 'badges' && e.op === 'select') return { data: row, error: null };
        if (e.op === 'delete') return { error: null };
        // `counts` 키는 `표.컬럼`(같은 표를 두 컬럼으로 읽는 item_books 구분) 또는 표 이름(그 표의 모든 컬럼)이다.
        if (e.opts?.head) return { count: counts[`${e.table}.${e.cols}`] ?? counts[e.table] ?? 0, error: null };
        return { data: [] };
      },
    });
  }

  it('참조가 없으면 배지 행을 먼저 지우고 저장소 파일 2개를 지운다', async () => {
    const stub = undoStub();
    const result = await undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ badgeId: BADGE_ID, rowFound: true, rowDeleted: true, filesRemoved: true, references: [], warnings: [] });
    expect(stub.events).toEqual(['select:badges', ...ALL_REFERENCES.map((r: { table: string }) => `select:${r.table}`), 'delete:badges', 'remove']);
    const del = stub.entries.find((e) => e.op === 'delete')!;
    expect(del.filters).toEqual([
      ['eq', 'id', BADGE_ID],
      ['eq', 'image_source', 'agent-generator'],
    ]);
    expect(stub.removes).toEqual([[`badges/asset-generator/${BADGE_ID}.png`, `badges/asset-generator/${BADGE_ID}.webp`]]);
  });

  it('각 관계는 그 표의 배지 id 컬럼으로 센다(표마다 id 컬럼 유무가 달라서)', async () => {
    const stub = undoStub();
    await undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    const reads = stub.entries.filter((e) => e.opts?.head);
    expect(reads.map((e) => [e.table, e.cols, e.filters[0]])).toEqual([
      ...UNDO_REFERENCE_TABLES.map((r: { table: string; column: string }) => [r.table, r.column, ['eq', r.column, BADGE_ID]]),
      // 배열 컬럼은 «배열에 배지 id가 들어 있는 행»으로 센다(티켓 20260926_0200).
      ...UNDO_ARRAY_REFERENCE_COLUMNS.map((r: { table: string; column: string }) => [r.table, r.column, ['contains', r.column, [BADGE_ID]]]),
    ]);
  });

  // 연쇄 삭제 2곳·연결 해제 3곳(티켓 20260925_0540)을 포함한 10개 관계 전부가 하나라도 붙어 있으면 지우기 전에 중단한다.
  for (const { table, column, effect } of UNDO_REFERENCE_TABLES as { table: string; column: string; effect: string }[]) {
    it(`${table}.${column}(${effect})에 참조가 하나라도 있으면 아무것도 지우지 않고 관계와 건수를 알리며 중단한다`, async () => {
      const stub = undoStub({ [`${table}.${column}`]: 3 });
      await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
        `${table}.${column} 3건(${effect})`
      );
      expect(stub.count('delete')).toBe(0);
      expect(stub.removes).toHaveLength(0);
    });
  }

  // 배열 컬럼 4곳(티켓 20260926_0200): 외래 키가 아니라 DB가 막지 않으므로 --undo가 삭제 전에 직접 읽어 중단해야 한다.
  for (const { table, column, effect } of UNDO_ARRAY_REFERENCE_COLUMNS as { table: string; column: string; effect: string }[]) {
    it(`${table}.${column}(배열 컬럼)에 배지 id가 들어 있으면 아무것도 지우지 않고 위치와 건수를 알리며 중단한다`, async () => {
      const stub = undoStub({ [`${table}.${column}`]: 2 });
      await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
        `${table}.${column} 2건(${effect})`
      );
      expect(stub.count('delete')).toBe(0);
      expect(stub.removes).toHaveLength(0);
    });
  }

  it('배열 컬럼 참조도 dry-run에서 같은 검사를 하고, 읽지 못하면 확인 없이 지우지 않고 중단한다', async () => {
    const dry = undoStub({ 'missions.reward_badge_ids': 1 });
    await expect(undoRegistration({ supabase: dry.supabase, record: recordFor(), dryRun: true })).rejects.toThrow('missions.reward_badge_ids 1건');
    const failing = createStub({
      resolve: (e) => {
        if (e.table === 'badges') return { data: { id: BADGE_ID, image_source: 'agent-generator' }, error: null };
        if (e.filters[0]?.[0] === 'contains') return { error: { message: 'operator does not exist' } };
        return { count: 0, error: null };
      },
    });
    await expect(undoRegistration({ supabase: failing.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      'missions.reward_badge_ids 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): operator does not exist'
    );
    expect(failing.count('delete')).toBe(0);
  });

  it('여러 관계에 붙어 있으면 관계별 건수를 모두 알린다', async () => {
    const stub = undoStub({ 'user_checkin_badge_earns.badge_id': 2, 'item_books.reward_badge_id': 1, 'item_books.required_activity_badge_id': 0 });
    await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      '이미 사용자 데이터나 다른 항목의 연결이 붙어서 되돌리지 않고 중단했어요 — user_checkin_badge_earns.badge_id 2건(연쇄 삭제), item_books.reward_badge_id 1건(연결 해제).'
    );
    expect(stub.count('delete')).toBe(0);
  });

  it('dry-run도 같은 검사를 하고, 참조가 있으면 중단한다', async () => {
    const stub = undoStub({ 'missions.gated_badge_id': 1 });
    await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true })).rejects.toThrow('missions.gated_badge_id 1건(연결 해제)');
    expect(stub.count('delete')).toBe(0);
  });

  it('참조를 읽지 못하면 확인 없이 지우지 않고 중단한다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.table === 'badges') return { data: { id: BADGE_ID, image_source: 'agent-generator' }, error: null };
        return { error: { message: 'permission denied' } };
      },
    });
    await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      'user_activity_badges.badge_id 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): permission denied'
    );
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toHaveLength(0);
  });

  it('에이전트가 등록한 배지(image_source)가 아니면 지우지 않는다', async () => {
    const stub = undoStub({}, { id: BADGE_ID, name: 'n', image_source: 'admin-generator' });
    await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      '에이전트 등록(image_source=agent-generator)이 아니라서 지우지 않아요(현재 값: admin-generator)'
    );
    expect(stub.count('delete')).toBe(0);
  });

  it('배지 행 삭제가 실패하면 이미지 파일은 그대로 둔다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.op === 'delete') return { error: { message: 'violates foreign key' } };
        if (e.table === 'badges') return { data: { id: BADGE_ID, image_source: 'agent-generator' }, error: null };
        return { count: 0, error: null };
      },
    });
    await expect(undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      '배지 행을 지우지 못해서 중단했어요(이미지 파일은 그대로 뒀어요): violates foreign key'
    );
    expect(stub.removes).toHaveLength(0);
  });

  it('배지 행이 이미 없으면 저장소 파일만 정리하고 알린다', async () => {
    const stub = undoStub({}, null);
    const result = await undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ rowFound: false, rowDeleted: false, filesRemoved: true });
    expect(result.warnings).toEqual(['배지 행이 이미 없어서 저장소 파일만 정리해요.']);
    expect(stub.count('delete')).toBe(0);
  });

  it('행은 지웠는데 파일 삭제가 실패하면 직접 지울 경로를 알린다', async () => {
    const stub = undoStub({}, undefined, { removeError: 'storage down' });
    const result = await undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result.rowDeleted).toBe(true);
    expect(result.filesRemoved).toBe(false);
    expect(result.warnings[0]).toContain('직접 지워 주세요');
  });

  it('dry-run이면 참조까지만 읽고 삭제·파일 삭제는 하지 않는다', async () => {
    const stub = undoStub();
    const result = await undoRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    expect(result).toMatchObject({ rowFound: true, rowDeleted: false, filesRemoved: false });
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toHaveLength(0);
  });

  it('기록의 저장소 경로가 규칙과 다르면(다른 파일을 지울 수 있으면) 시작도 하지 않는다', async () => {
    const stub = undoStub();
    const record = recordFor();
    record.storage.png_path = 'badges/other-badge.png';
    await expect(undoRegistration({ supabase: stub.supabase, record, dryRun: false })).rejects.toThrow('저장소 경로가 규칙');
    expect(stub.events).toEqual([]);

    await expect(undoRegistration({ supabase: stub.supabase, record: { badge: { id: 'x' } }, dryRun: false })).rejects.toThrow('UUID 형식이 아니에요');
  });

  it('runUndo: 기록 파일을 읽어 되돌리고 종료 코드 0을 낸다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const stub = undoStub();
    const { out, logs } = createOut();
    const code = await runUndo({ args: parseRegisterArgs(['--undo', recordPath]), supabase: stub.supabase, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('되돌렸어요');
    expect(stub.count('delete', 'badges')).toBe(1);
  });

  it('runUndo: 참조가 있으면 종료 코드 1과 이유를 낸다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const stub = undoStub({ 'inventory_items.badge_id': 2 });
    const { out, errors } = createOut();
    const code = await runUndo({ args: parseRegisterArgs(['--undo', recordPath]), supabase: stub.supabase, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('inventory_items.badge_id 2건(삭제 차단)');
    expect(stub.count('delete')).toBe(0);
  });

  it('runUndo --dry-run: 아무것도 쓰지 않는다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const stub = undoStub();
    const { out, logs } = createOut();
    const code = await runUndo({ args: parseRegisterArgs(['--undo', recordPath, '--dry-run']), supabase: stub.supabase, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('되돌림 검증 (--dry-run)');
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toHaveLength(0);
  });

  it('runUndo: 기록 파일이 없거나 서비스 키가 없으면 종료 코드 1이다', async () => {
    const missing = createOut();
    expect(await runUndo({ args: parseRegisterArgs(['--undo', path.join(workDir, 'nope.json')]), supabase: null, out: missing.out })).toBe(1);
    expect(missing.errors[0]).toContain('등록 기록 파일을 찾을 수 없어요');

    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const noKey = createOut();
    expect(await runUndo({ args: parseRegisterArgs(['--undo', recordPath]), supabase: null, out: noKey.out })).toBe(1);
    expect(noKey.errors[0]).toContain('.env.local에 없어서 되돌릴 수 없어요');
  });
});
