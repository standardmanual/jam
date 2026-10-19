/**
 * 미션 등록 — 등록 순서·실패 처리·중복 거절·dry-run 무쓰기·되돌림 안전장치 (티켓 20260925_1412)
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
import { readBundleFile, validateMissionBundle } from '../registerMissionBundle.mjs';
import {
  UNDO_REFERENCE_TABLES,
  findMissionRecordUndoError,
  missionStoragePathsFor,
  registerMission,
  runMissionDbChecks,
  runMissionRegister,
  runMissionUndo,
  undoMissionRegistration,
} from '../registerMissionFlow.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-mission-bundle');
const MISSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
const fixedUuid = () => MISSION_ID;
const fixedNow = () => NOW_MS;

let workDir: string;
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-mission-flow-test-'));
  fs.cpSync(FIXTURE_DIR, workDir, { recursive: true });
});
afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function bundleOf(dir = workDir) {
  const bundleFile = path.join(dir, 'bundle.json');
  const { errors, bundle } = validateMissionBundle(readBundleFile(bundleFile), { bundleFile });
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

describe('missionStoragePathsFor', () => {
  it('적용 탭과 같은 규칙 missions/asset-generator/{id}.png|webp다', () => {
    expect(missionStoragePathsFor(MISSION_ID)).toEqual({
      pngPath: `missions/asset-generator/${MISSION_ID}.png`,
      webpPath: `missions/asset-generator/${MISSION_ID}.webp`,
    });
  });
});

describe('registerMission — 순서와 실패 처리', () => {
  it('원본 PNG 업로드 → WebP 업로드 → 미션 행 insert 순서로 등록하고 image_url은 ?v= 붙은 WebP, image_source는 agent-generator다', async () => {
    const stub = createStub();
    const result = await registerMission({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow });

    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'insert:missions']);
    expect(stub.uploads).toEqual([
      { path: `images/missions/asset-generator/${MISSION_ID}.png`, contentType: 'image/png' },
      { path: `images/missions/asset-generator/${MISSION_ID}.webp`, contentType: 'image/webp' },
    ]);
    const payload = stub.entries.find((e) => e.op === 'insert')!.payload!;
    expect(payload.id).toBe(MISSION_ID);
    expect(payload.image_source).toBe('agent-generator');
    expect(payload.image_url).toBe(`https://cdn.test/images/missions/asset-generator/${MISSION_ID}.webp?v=${NOW_MS}`);
    expect(payload.title).toBe('[TEST] 예시 주말 러닝 미션');
    expect(result.missionId).toBe(MISSION_ID);
    expect(result.originalUrl).toBe(`https://cdn.test/images/missions/asset-generator/${MISSION_ID}.png`);
    expect(result.registeredAt.getTime()).toBe(NOW_MS);
    expect(stub.removes).toEqual([]);
  });

  it('insert가 실패하면 올라간 파일 2개를 지우고 실패로 끝낸다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'check violation' } } : { data: [] }) });
    await expect(
      registerMission({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('미션 행 등록에 실패했어요: check violation 올라간 이미지 파일 2개는 지웠어요.');
    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'insert:missions', 'remove']);
    expect(stub.removes).toEqual([[`missions/asset-generator/${MISSION_ID}.png`, `missions/asset-generator/${MISSION_ID}.webp`]]);
  });

  it('insert 실패 뒤 파일 삭제도 실패하면 직접 지울 경로를 알린다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'boom' } } : { data: [] }), removeError: 'storage down' });
    await expect(
      registerMission({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow(`직접 지워 주세요(missions/asset-generator/${MISSION_ID}.png, missions/asset-generator/${MISSION_ID}.webp): storage down`);
  });

  it('WebP 업로드가 실패하면 올라간 PNG를 지우고 insert는 하지 않는다', async () => {
    const stub = createStub({ uploadError: (p) => (p.endsWith('.webp') ? 'quota exceeded' : null) });
    await expect(
      registerMission({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('WebP 이미지 업로드에 실패했어요: quota exceeded 올라간 파일은 지웠고, 미션 행은 만들지 않았어요.');
    expect(stub.events).toEqual(['upload:png', 'upload:webp', 'remove']);
    expect(stub.count('insert')).toBe(0);
  });

  it('원본 업로드가 실패하면 지울 파일이 없고 insert도 하지 않는다', async () => {
    const stub = createStub({ uploadError: () => 'no space' });
    await expect(
      registerMission({ supabase: stub.supabase, bundle: bundleOf(), convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow })
    ).rejects.toThrow('원본 이미지 업로드에 실패했어요: no space 저장소에는 아무것도 남지 않았고');
    expect(stub.events).toEqual(['upload:png']);
  });

  it('WebP 변환이 실패하면 업로드 전에 멈춘다', async () => {
    const stub = createStub();
    await expect(
      registerMission({
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

describe('runMissionDbChecks', () => {
  const badgeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const otherBadgeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const poiId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const mission = { title: '제목', mission_type: 'distance', condition_json: { distance_km: 30 }, reward_badge_ids: [badgeId] };

  it('supabase가 없으면 읽기 검사를 건너뜀으로 표시하고 실패로 보지 않는다', async () => {
    const { checks, errors } = await runMissionDbChecks({ supabase: null, mission });
    expect(errors).toEqual([]);
    expect(checks.map((c) => [c.label, c.status])).toEqual([
      ['제목 중복', '건너뜀'],
      ['보상 배지 존재', '건너뜀'],
      ['보상 배지 종류', '해당 없음'],
      ['조건 배지 존재', '해당 없음'],
      ['조건 장소 존재', '해당 없음'],
    ]);
  });

  // 제목 중복은 운영툴과 같은 규칙이다 — 같은 제목의 기존 미션과 기간 [공개, 종료)이 겹칠 때만 막는다(티켓 20261002_2024).
  const T1 = '2026-10-10T00:00:00.000Z';
  const T2 = '2026-10-20T00:00:00.000Z';
  const T3 = '2026-10-30T00:00:00.000Z';
  const withExisting = (existing: { id: string; starts_at: string | null; ends_at: string | null }) =>
    createStub({ resolve: (e) => (e.table === 'missions' ? { data: [existing] } : { data: [{ id: badgeId, name: '보상', type: 'activity', is_hidden: false }] }) });

  it('같은 제목의 미션과 기간이 겹치면 중복으로 거절한다', async () => {
    const stub = withExisting({ id: 'existing-id', starts_at: T1, ends_at: T3 });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission: { ...mission, starts_at: T2, ends_at: null } });
    expect(errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: existing-id).']);
    expect(stub.entries[0].cols).toBe('id, starts_at, ends_at');
    expect(stub.entries[0].filters).toContainEqual(['eq', 'title', '제목']);
  });

  it('같은 제목이어도 기간이 겹치지 않으면 통과한다(기존 미션이 끝난 시각에 이어 여는 미션)', async () => {
    const stub = withExisting({ id: 'existing-id', starts_at: T1, ends_at: T2 });
    const { errors, checks } = await runMissionDbChecks({ supabase: stub.supabase, mission: { ...mission, starts_at: T2, ends_at: T3 } });
    expect(errors).toEqual([]);
    expect(checks[0]).toEqual({ label: '제목 중복', status: '통과', detail: '' });
  });

  it('공개 시각을 읽을 수 없으면 같은 제목이 있는 것만으로 거절한다', async () => {
    const stub = withExisting({ id: 'existing-id', starts_at: T1, ends_at: T2 });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission });
    expect(errors).toEqual(['제목 중복: 같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: existing-id).']);
  });

  it('보상 배지가 하나라도 없거나 삭제됐으면 그 id를 알린다', async () => {
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [{ id: badgeId }] } : { data: [] }) });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission: { ...mission, reward_badge_ids: [badgeId, otherBadgeId] } });
    expect(errors).toEqual([`보상 배지 존재: reward_badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${otherBadgeId}`]);
    const badgeQuery = stub.entries.find((e) => e.table === 'badges')!;
    expect(badgeQuery.filters).toContainEqual(['is', 'deleted_at', null]);
    expect(badgeQuery.filters).toContainEqual(['in', 'id', [badgeId, otherBadgeId]]);
  });

  // 숨김 배지와 체크인 배지는 미션 보상으로 쓸 수 없다(티켓 20261019_1313 2회). 운영툴 예약 등록과 같은 판정(`reward-badges.ts`)이다.
  it('보상 배지가 숨김이면 등록 전 검사에서 거절한다', async () => {
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [{ id: badgeId, name: '비밀 배지', type: 'activity', is_hidden: true }] } : { data: [] }) });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission });
    expect(errors).toEqual([expect.stringContaining('보상 배지 종류: 저장할 수 없습니다. 미션 보상으로 쓸 수 없는 숨김 배지가 있어요(「비밀 배지」)')]);
  });

  it('보상 배지가 체크인 배지면 등록 전 검사에서 거절한다', async () => {
    const stub = createStub({ resolve: (e) => (e.table === 'badges' ? { data: [{ id: badgeId, name: '카페 체크인', type: 'checkin', is_hidden: false }] } : { data: [] }) });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission });
    expect(errors).toEqual([expect.stringContaining('보상 배지 종류: 저장할 수 없습니다. 미션 보상으로 쓸 수 없는 배지가 있어요(체크인 배지: 「카페 체크인」)')]);
  });

  it('item_collect의 조건 배지와 checkin의 조건 장소가 실제로 있는지 읽는다', async () => {
    const itemStub = createStub({ resolve: () => ({ data: null }) });
    const item = await runMissionDbChecks({ supabase: itemStub.supabase, mission: { title: 't', mission_type: 'item_collect', condition_json: { badge_id: badgeId } } });
    expect(item.errors).toEqual([expect.stringContaining(`조건 배지 존재: condition_json.badge_id에 해당하는 배지가 없거나 삭제됐어요: ${badgeId}`)]);

    const poiStub = createStub({ resolve: (e) => (e.table === 'poi' ? { data: null } : { data: [] }) });
    const poi = await runMissionDbChecks({ supabase: poiStub.supabase, mission: { title: 't', mission_type: 'checkin', condition_json: { poi_id: poiId } } });
    expect(poi.errors).toEqual([`조건 장소 존재: condition_json.poi_id에 해당하는 장소가 없어요: ${poiId}`]);
  });

  it('DB 읽기 오류는 실패로 알린다(확인하지 못한 채 통과시키지 않는다)', async () => {
    const stub = createStub({ resolve: () => ({ error: { message: 'timeout' } }) });
    const { errors } = await runMissionDbChecks({ supabase: stub.supabase, mission: { title: '제목' } });
    expect(errors).toEqual(['제목 중복: DB 조회에 실패했어요: timeout']);
  });

  it('읽기 검사는 select만 한다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: badgeId }] }) });
    await runMissionDbChecks({ supabase: stub.supabase, mission: { ...mission, mission_type: 'item_collect', condition_json: { badge_id: badgeId } } });
    expect(stub.entries.length).toBeGreaterThan(0);
    expect(stub.entries.every((e) => e.op === 'select')).toBe(true);
  });
});

describe('runMissionRegister — --dry-run', () => {
  it('스텁 supabase가 있어도 업로드·insert·삭제를 한 번도 호출하지 않고 기록 파일도 만들지 않는다(읽기만 한다)', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.uploads).toHaveLength(0);
    expect(stub.removes).toHaveLength(0);
    expect(stub.count('insert')).toBe(0);
    expect(stub.count('delete')).toBe(0);
    expect(stub.count('select', 'missions')).toBe(1); // 제목 중복 조회 하나
    expect(logs.join('\n')).toContain('- 제목 중복: 통과');
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
    expect(fs.existsSync(path.join(workDir, 'registration.sql'))).toBe(false);
  });

  it('서비스 키가 없으면(supabase null) DB 검사를 건너뜀으로 표시하고 로컬 검증만으로 통과한다', async () => {
    const { out, logs } = createOut();
    const code = await runMissionRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('- 제목 중복: 건너뜀');
  });

  it('DB 검사가 실패하면 종료 코드 1이고 사유가 요약에 나온다', async () => {
    const stub = createStub({ resolve: () => ({ data: [{ id: 'dup' }] }) });
    const { out, logs } = createOut();
    const code = await runMissionRegister({ args: registerArgs(['--dry-run']), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('결과: 실패 (1건)');
    expect(stub.uploads).toHaveLength(0);
  });

  it('묶음이 틀리면 종료 코드 1이고 사유를 모두 보여 준다', async () => {
    editBundle((raw) => {
      raw.image.bg_color = 'red';
      delete raw.mission.title;
    });
    const { out, logs } = createOut();
    const code = await runMissionRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    const text = logs.join('\n');
    expect(text).toContain('결과: 실패 (2건)');
    expect(text).toContain('mission.title: 필수 항목이 없어요.');
    expect(text).toContain('image.bg_color: #rrggbb 형식이어야 해요');
  });

  it('묶음 파일이 없으면 종료 코드 1이다', async () => {
    const { out, errors } = createOut();
    const missing = parseRegisterArgs(['--bundle', path.join(workDir, 'nope.json'), '--dry-run']);
    expect(await runMissionRegister({ args: missing, supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out })).toBe(1);
    expect(errors[0]).toContain('묶음 파일을 찾을 수 없어요');
  });

  it('WebP 변환이 실패하는 이미지는 dry-run에서 미리 잡는다', async () => {
    const { out, logs } = createOut();
    const code = await runMissionRegister({
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
    const code = await runMissionRegister({ args: registerArgs(['--dry-run']), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(logs.join('\n')).toContain('이미 등록한 묶음으로 보여요');
  });
});

describe('runMissionRegister — 예시 묶음 dry-run(실제 파일·실제 WebP 변환)', () => {
  it('예시 묶음을 로컬 검증만으로 통과시키고 컨펌 자료를 내며 예시 폴더에 아무것도 쓰지 않는다', async () => {
    const { out, logs, errors } = createOut();
    const before = fs.readdirSync(FIXTURE_DIR).sort();
    const code = await runMissionRegister({
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
    expect(text).toContain('- 제목: [TEST] 예시 주말 러닝 미션');
    expect(text).toContain('- 노출 모드: 숨김(서비스 어디에도 노출하지 않음)');
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- WebP 변환 미리 확인: 통과');
    expect(text).toContain('[등록 예정 내용]');
    expect(text).toContain('[되돌림 SQL 미리보기]');
    expect(fs.readdirSync(FIXTURE_DIR).sort()).toEqual(before);
    expect(before).toEqual(['bundle.json', 'image.png']);
  });
});

describe('runMissionRegister — 실제 등록', () => {
  it('등록하면 제목 중복 조회 → 업로드 → insert 뒤 기록 파일 2개를 쓰고, 같은 묶음은 다시 등록하지 않는다', async () => {
    const stub = createStub();
    const { out, logs, errors } = createOut();
    const run = () => runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });

    expect(await run()).toBe(0);
    expect(errors).toEqual([]);
    expect(stub.events).toEqual(['select:missions', 'upload:png', 'upload:webp', 'insert:missions']);

    const record = JSON.parse(fs.readFileSync(path.join(workDir, 'registration-record.json'), 'utf8'));
    expect(record.mission.id).toBe(MISSION_ID);
    expect(record.registered_at).toBe('2026-09-25T10:31:02+09:00');
    expect(record.storage.png_path).toBe(`missions/asset-generator/${MISSION_ID}.png`);
    expect(record.world_review.world_related).toBe(false);
    const sql = fs.readFileSync(path.join(workDir, 'registration.sql'), 'utf8');
    expect(sql).toContain('INSERT INTO public.missions (');
    expect(sql).toContain(`-- delete from public.missions where id = '${MISSION_ID}';`);
    for (const { table } of UNDO_REFERENCE_TABLES) expect(sql).toContain(table);
    expect(logs.join('\n')).toContain('seed_agent_mission_example_mission.sql');
    expect(logs.join('\n')).toContain('register-mission.mjs --undo');

    const uploadsBefore = stub.uploads.length;
    const second = createOut();
    const secondCode = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out: second.out });
    expect(secondCode).toBe(1);
    expect(second.errors.join('\n')).toContain('이미 등록한 묶음으로 보여요');
    expect(stub.uploads).toHaveLength(uploadsBefore);
  });

  it('--record-dir을 주면 기록을 그 폴더에 쓴다', async () => {
    const stub = createStub();
    const { out } = createOut();
    const recordDir = path.join(workDir, 'records');
    const code = await runMissionRegister({ args: registerArgs(['--record-dir', recordDir]), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(recordDir, 'registration-record.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  // 예시 묶음의 기간은 2026-10-03T00:00+09:00(= 10-02T15:00Z) ~ 2026-10-10T00:00+09:00(= 10-09T15:00Z)이다.
  const existingMission = (starts_at: string, ends_at: string | null) =>
    createStub({ resolve: (e) => (e.table === 'missions' && e.op === 'select' ? { data: [{ id: 'existing-id', starts_at, ends_at }] } : { data: [] }) });

  it('같은 제목의 미션과 기간이 겹치면 중복으로 거절하고 아무것도 쓰지 않는다', async () => {
    const stub = existingMission('2026-10-05T00:00:00+09:00', null);
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: existing-id)');
    expect(stub.uploads).toHaveLength(0);
    expect(stub.count('insert')).toBe(0);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('같은 제목의 미션이 있어도 기간이 겹치지 않으면 등록한다(기존 미션이 끝난 시각에 이어 여는 미션)', async () => {
    const stub = existingMission('2026-09-26T00:00:00+09:00', '2026-10-03T00:00:00+09:00');
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(errors).toEqual([]);
    expect(code).toBe(0);
    expect(stub.events).toEqual(['select:missions', 'upload:png', 'upload:webp', 'insert:missions']);
  });

  it('묶음의 mission에 옛 모드 키(titleDuplicate)가 있으면 묶음 검증이 막아 DB를 읽기 전에 멈춘다', async () => {
    editBundle((raw) => {
      raw.mission.titleDuplicate = 'any';
    });
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('titleDuplicate');
    expect(stub.entries).toHaveLength(0);
  });

  it('insert가 실패하면 파일을 지우고 종료 코드 1이며 기록 파일은 만들지 않는다', async () => {
    const stub = createStub({ resolve: (e) => (e.op === 'insert' ? { error: { message: 'check violation' } } : { data: [] }) });
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('미션 행 등록에 실패했어요: check violation');
    expect(stub.removes).toHaveLength(1);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('서비스 키가 없으면(supabase null) 등록하지 않는다', async () => {
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: null, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors[0]).toContain('.env.local에 없어서 등록할 수 없어요');
  });

  it('어드민 미션 API와 같은 검증(조건 키 오타)에 실패한 묶음은 DB를 읽기 전에 멈추고 등록되지 않는다', async () => {
    editBundle((raw) => {
      raw.mission.condition_json = { distnace_km: 30 };
    });
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('미션 조건에 없는 필드가 있어요 — distnace_km');
    expect(stub.events).toEqual([]);
    expect(fs.existsSync(path.join(workDir, 'registration-record.json'))).toBe(false);
  });

  it('게이트 필드 검증에 실패한 묶음도 등록되지 않는다', async () => {
    editBundle((raw) => {
      raw.mission.gate_stage = 'rare_to_epic';
    });
    const stub = createStub();
    const { out, errors } = createOut();
    const code = await runMissionRegister({ args: registerArgs(), supabase: stub.supabase, convertToWebp: fakeWebp, randomUUID: fixedUuid, now: fixedNow, out });
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('여는 축과 게이트 단계는 둘 다 지정하거나 둘 다 비워야 해요');
    expect(stub.events).toEqual([]);
  });
});

describe('UNDO_REFERENCE_TABLES', () => {
  it('missions를 참조하는 외래 키 9곳과 같다(생성 타입 대조)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src', 'types', 'database.generated.ts'), 'utf8');
    // 표별로 잘라서 referencedRelation: "missions"인 FK의 표·컬럼을 뽑는다.
    const found: string[] = [];
    const tablePattern = /^      (\w+): \{\n        Row: \{/gm;
    const starts = [...source.matchAll(tablePattern)].map((m) => ({ name: m[1], index: m.index! }));
    starts.forEach((start, i) => {
      const block = source.slice(start.index, starts[i + 1]?.index ?? source.length);
      for (const fk of block.matchAll(/columns: \["(\w+)"\]\n\s+isOneToOne: \w+\n\s+referencedRelation: "missions"/g)) {
        found.push(`${start.name}.${fk[1]}`);
      }
    });
    const declared = UNDO_REFERENCE_TABLES.map((r: { table: string; column: string }) => `${r.table}.${r.column}`);
    expect(declared.sort()).toEqual(found.sort());
    expect(found).toHaveLength(9);
  });
});

describe('되돌림 — undoMissionRegistration·runMissionUndo', () => {
  function recordFor(id = MISSION_ID) {
    const paths = missionStoragePathsFor(id);
    return { record_version: 1, mission: { id, title: '[TEST] 예시 주말 러닝 미션' }, storage: { bucket: 'images', png_path: paths.pngPath, webp_path: paths.webpPath } };
  }

  /** 미션 행이 있고 참조 카운트는 `counts`(표 이름 → 건수)로 정하는 스텁 */
  function undoStub(counts: Record<string, number> = {}, row: unknown = { id: MISSION_ID, title: 't', image_source: 'agent-generator' }, extra: Parameters<typeof createStub>[0] = {}) {
    return createStub({
      ...extra,
      resolve: (e) => {
        if (e.table === 'missions' && e.op === 'select') return { data: row, error: null };
        if (e.op === 'delete') return { error: null };
        if (e.opts?.head) return { count: counts[e.table] ?? 0, error: null };
        return { data: [] };
      },
    });
  }

  it('참조가 없으면 미션 행을 먼저 지우고 파일 2개를 지운다', async () => {
    const stub = undoStub();
    const result = await undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ missionId: MISSION_ID, rowFound: true, rowDeleted: true, filesRemoved: true, warnings: [] });
    expect(stub.events).toEqual([
      'select:missions',
      ...UNDO_REFERENCE_TABLES.map((r: { table: string }) => `select:${r.table}`),
      'delete:missions',
      'remove',
    ]);
    expect(stub.removes).toEqual([[`missions/asset-generator/${MISSION_ID}.png`, `missions/asset-generator/${MISSION_ID}.webp`]]);
    // image_source가 agent-generator인 행만 지우도록 조건이 붙는다.
    expect(stub.entries.find((e) => e.op === 'delete')!.filters).toEqual([
      ['eq', 'id', MISSION_ID],
      ['eq', 'image_source', 'agent-generator'],
    ]);
  });

  it('각 표는 그 표의 미션 id 컬럼으로 센다(mission_rank_snapshots에는 id 컬럼이 없다)', async () => {
    const stub = undoStub();
    await undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    const reads = stub.entries.filter((e) => e.opts?.head);
    expect(reads.map((e) => [e.table, e.cols, e.filters[0]])).toEqual(
      UNDO_REFERENCE_TABLES.map((r: { table: string; column: string }) => [r.table, r.column, ['eq', r.column, MISSION_ID]])
    );
  });

  it.each(UNDO_REFERENCE_TABLES.map((r: { table: string }) => r.table))('%s에 사용자 데이터가 붙어 있으면 아무것도 지우지 않고 중단한다', async (table) => {
    const stub = undoStub({ [table]: 3 });
    await expect(undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      `이미 사용자 데이터가 붙어서 되돌리지 않고 중단했어요 — ${table} 3건. 삭제 대신 어드민에서 미션 노출을 숨김으로 바꿔 주세요.`
    );
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('참조를 읽지 못하면 확인 없이 지우지 않고 중단한다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.table === 'missions') return { data: { id: MISSION_ID, image_source: 'agent-generator' }, error: null };
        return { error: { message: 'permission denied' } };
      },
    });
    await expect(undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow(
      'user_mission_completions 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): permission denied'
    );
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('agent-generator가 아닌 미션은 지우지 않는다', async () => {
    const stub = undoStub({}, { id: MISSION_ID, title: 't', image_source: 'admin-generator' });
    await expect(undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow('에이전트 등록(image_source=agent-generator)이 아니라서 지우지 않아요(현재 값: admin-generator)');
    expect(stub.count('delete')).toBe(0);
  });

  it('미션 행 삭제가 실패하면 이미지 파일은 그대로 두고 중단한다', async () => {
    const stub = createStub({
      resolve: (e) => {
        if (e.table === 'missions' && e.op === 'select') return { data: { id: MISSION_ID, image_source: 'agent-generator' }, error: null };
        if (e.op === 'delete') return { error: { message: 'fk violation' } };
        return { count: 0, error: null };
      },
    });
    await expect(undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false })).rejects.toThrow('미션 행을 지우지 못해서 중단했어요(이미지 파일은 그대로 뒀어요): fk violation');
    expect(stub.removes).toEqual([]);
  });

  it('미션 행이 이미 없으면 저장소 파일만 정리하고 알린다', async () => {
    const stub = undoStub({}, null);
    const result = await undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result).toMatchObject({ rowFound: false, rowDeleted: false, filesRemoved: true });
    expect(result.warnings).toEqual(['미션 행이 이미 없어서 저장소 파일만 정리해요.']);
    expect(stub.events).toEqual(['select:missions', 'remove']);
  });

  it('파일 삭제가 실패하면 직접 지울 경로를 경고로 남긴다', async () => {
    const stub = undoStub({}, undefined, { removeError: 'storage down' });
    const result = await undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: false });
    expect(result.rowDeleted).toBe(true);
    expect(result.filesRemoved).toBe(false);
    expect(result.warnings[0]).toContain('직접 지워 주세요');
  });

  it('dryRun이면 참조 확인까지만 하고 아무것도 지우지 않는다', async () => {
    const stub = undoStub();
    const result = await undoMissionRegistration({ supabase: stub.supabase, record: recordFor(), dryRun: true });
    expect(result).toMatchObject({ rowFound: true, rowDeleted: false, filesRemoved: false });
    expect(stub.count('delete')).toBe(0);
    expect(stub.removes).toEqual([]);
  });

  it('기록이 망가졌거나 저장소 경로가 규칙과 다르면 시작하지 않는다', async () => {
    expect(findMissionRecordUndoError(null)).toContain('최상위는 객체');
    expect(findMissionRecordUndoError({ mission: { id: 'x' } })).toContain('UUID 형식이 아니에요');
    const tampered = recordFor();
    tampered.storage.png_path = 'badges/asset-generator/other.png';
    expect(findMissionRecordUndoError(tampered)).toContain('저장소 경로가 규칙');
    const stub = undoStub();
    await expect(undoMissionRegistration({ supabase: stub.supabase, record: tampered, dryRun: false })).rejects.toThrow('저장소 경로가 규칙');
    expect(stub.events).toEqual([]);
  });

  it('runMissionUndo: 성공하면 0, 참조가 있으면 1이며 사유를 알린다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const args = parseRegisterArgs(['--undo', recordPath]);

    const ok = createOut();
    expect(await runMissionUndo({ args, supabase: undoStub().supabase, out: ok.out })).toBe(0);
    expect(ok.logs.join('\n')).toContain('- 미션 행: 삭제했어요');

    const blocked = createOut();
    expect(await runMissionUndo({ args, supabase: undoStub({ today_cards: 1 }).supabase, out: blocked.out })).toBe(1);
    expect(blocked.errors.join('\n')).toContain('today_cards 1건');
  });

  it('runMissionUndo --dry-run: 삭제 대상만 보여 주고 쓰지 않는다', async () => {
    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const stub = undoStub();
    const { out, logs } = createOut();
    const code = await runMissionUndo({ args: parseRegisterArgs(['--undo', recordPath, '--dry-run']), supabase: stub.supabase, out });
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('== 되돌림 검증 (--dry-run) ==');
    expect(logs.join('\n')).toContain('지울 대상: missions 행 1건(있을 때), 저장소 파일 2개');
    expect(stub.count('delete')).toBe(0);
  });

  it('runMissionUndo: 기록 파일이 없거나 서비스 키가 없으면 1이다', async () => {
    const missing = createOut();
    expect(await runMissionUndo({ args: parseRegisterArgs(['--undo', path.join(workDir, 'nope.json')]), supabase: undoStub().supabase, out: missing.out })).toBe(1);
    expect(missing.errors[0]).toContain('등록 기록 파일을 찾을 수 없어요');

    const recordPath = path.join(workDir, 'registration-record.json');
    fs.writeFileSync(recordPath, JSON.stringify(recordFor()));
    const noKey = createOut();
    expect(await runMissionUndo({ args: parseRegisterArgs(['--undo', recordPath]), supabase: null, out: noKey.out })).toBe(1);
    expect(noKey.errors[0]).toContain('.env.local에 없어서 되돌릴 수 없어요');
  });
});
