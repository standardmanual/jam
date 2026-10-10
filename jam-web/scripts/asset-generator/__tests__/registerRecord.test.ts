/**
 * 배지 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260924_2202)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBadgeInsertPayload, CONTROL_OR_LINE_BREAK } from '../registerBundle.mjs';
import {
  buildRegistrationRecord,
  buildRegistrationSql,
  formatDryRunSummary,
  formatKst,
  migrationFileName,
  sqlLiteral,
  summarizeBundle,
  toKstIso,
} from '../registerRecord.mjs';

const BADGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// 참조 확인 표의 원본은 registerFlow.mjs다. 여기서는 SQL 주석에 표 이름이 그대로 들어가는지만 본다.
const UNDO_TABLES = ['user_activity_badges', 'item_books', 'item_books', 'missions'];
const IMAGE_URL = 'https://cdn.test/storage/v1/object/public/images/badges/asset-generator/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp?v=1790300000000';

interface SampleBundle {
  badge: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

function sampleBundle(): SampleBundle {
  return {
    bundle_id: '2026-09-25-dawn-runner',
    author: '윤진',
    created_at: '2026-09-25T10:30:00+09:00',
    color_rationale_link: 'docs/service/content/TRIBES.md',
    badge: {
      name: "새벽 러너's",
      description: '이른 아침을 달린 사람에게 남는 표식입니다.',
      type: 'activity',
      level: 1,
      family_key: 'running:DAWN',
      sort_order: 12,
      activity_types: ['running'],
      point_reward: 10,
      condition_json: { activity_type: 'running', distance_km: 5 },
    },
    image: {
      path: 'image.png',
      abs_path: '/tmp/bundle/image.png',
      bytes: 2048,
      seed: 20260925,
      preset_id: '11111111-1111-4111-8111-111111111111',
      bg_color: '#ff1a00',
      end_color: '#ff4dff',
      text: '새벽 러너',
    },
  };
}

function sampleRecord(bundle = sampleBundle()) {
  return buildRegistrationRecord({
    bundle,
    badgeId: BADGE_ID,
    bucket: 'images',
    pngPath: `badges/asset-generator/${BADGE_ID}.png`,
    webpPath: `badges/asset-generator/${BADGE_ID}.webp`,
    originalUrl: 'https://cdn.test/original.png',
    imageUrl: IMAGE_URL,
    webpBytes: 900,
    registeredAt: new Date(Date.UTC(2026, 8, 25, 1, 31, 2)),
  });
}

describe('KST 시각 표기', () => {
  it('UTC 시각을 KST로 바꿔 표기한다', () => {
    const utc = new Date(Date.UTC(2026, 8, 25, 1, 31, 2));
    expect(formatKst(utc)).toBe('2026-09-25 10:31:02 KST');
    expect(toKstIso(utc)).toBe('2026-09-25T10:31:02+09:00');
  });

  it('날짜가 넘어가는 시각과 자정을 맞게 바꾼다', () => {
    expect(toKstIso(new Date(Date.UTC(2026, 8, 24, 15, 0, 0)))).toBe('2026-09-25T00:00:00+09:00');
    expect(formatKst('2026-09-25T10:30:00+09:00')).toBe('2026-09-25 10:30:00 KST');
  });
});

describe('migrationFileName', () => {
  it('묶음 ID의 하이픈을 밑줄로 바꿔 seed_agent_badge_<slug>.sql을 만든다', () => {
    expect(migrationFileName('2026-09-25-dawn-runner')).toBe('seed_agent_badge_2026_09_25_dawn_runner.sql');
  });
});

describe('sqlLiteral', () => {
  it('값 종류별로 SQL 리터럴을 만든다', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(undefined)).toBe('NULL');
    expect(sqlLiteral(true)).toBe('TRUE');
    expect(sqlLiteral(false)).toBe('FALSE');
    expect(sqlLiteral(12)).toBe('12');
    expect(sqlLiteral(1.5)).toBe('1.5');
    expect(sqlLiteral('abc')).toBe("'abc'");
    expect(sqlLiteral([])).toBe('ARRAY[]::text[]');
    expect(sqlLiteral(['running', 'cycling'])).toBe("ARRAY['running', 'cycling']::text[]");
    expect(sqlLiteral({ a: 1 })).toBe(`'{"a":1}'::jsonb`);
  });

  it('작은따옴표를 두 번 써서 이스케이프한다(문자열·jsonb 모두)', () => {
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral({ note: "it's" })).toBe(`'{"note":"it''s"}'::jsonb`);
  });
});

describe('summarizeBundle', () => {
  it('유형·이름·종류·계열·조건을 한 줄로 요약한다', () => {
    expect(summarizeBundle(sampleBundle())).toBe(
      `[activity] 새벽 러너's · Lv.1 · running:DAWN · 조건 {"activity_type":"running","distance_km":5}`
    );
  });

  it('등급형·조건 없음도 요약한다', () => {
    const bundle = sampleBundle();
    bundle.badge = { name: 'A', type: 'item', rarity: 'rare' };
    expect(summarizeBundle(bundle)).toBe('[item] A · rare · 조건 없음');
  });
});

describe('buildRegistrationRecord', () => {
  it('배지 id·저장소 경로 2개·이미지 URL·시드·프리셋·색·작성자·등록 시각(KST)·요약을 담는다', () => {
    const record = sampleRecord();
    expect(record).toEqual({
      record_version: 1,
      bundle_id: '2026-09-25-dawn-runner',
      author: '윤진',
      bundle_created_at: '2026-09-25T10:30:00+09:00',
      registered_at: '2026-09-25T10:31:02+09:00',
      summary: summarizeBundle(sampleBundle()),
      badge: {
        id: BADGE_ID,
        name: "새벽 러너's",
        type: 'activity',
        rarity: null,
        level: 1,
        family_key: 'running:DAWN',
        image_source: 'agent-generator',
      },
      storage: {
        bucket: 'images',
        png_path: `badges/asset-generator/${BADGE_ID}.png`,
        webp_path: `badges/asset-generator/${BADGE_ID}.webp`,
      },
      urls: { original_png: 'https://cdn.test/original.png', image_url: IMAGE_URL },
      image: {
        seed: 20260925,
        preset_id: '11111111-1111-4111-8111-111111111111',
        bg_color: '#ff1a00',
        end_color: '#ff4dff',
        text: '새벽 러너',
        source_path: 'image.png',
        original_bytes: 2048,
        webp_bytes: 900,
      },
      color_rationale_link: 'docs/service/content/TRIBES.md',
    });
  });

  it('텍스트를 안 준 묶음은 text를 null로 기록한다', () => {
    const bundle = sampleBundle();
    delete bundle.image.text;
    expect(sampleRecord(bundle).image.text).toBeNull();
  });
});

describe('buildRegistrationSql — 주석 주입 방어', () => {
  it('작성자·이름에 개행이 섞여도 주석 밖에 실행 가능한 줄이 생기지 않는다', () => {
    const bundle = sampleBundle();
    const record = sampleRecord(bundle);
    record.author = '윤진\nDROP TABLE x;';
    record.badge.name = 'ok\r\nDROP TABLE public.badges;--';
    const sql = buildRegistrationSql({ payload: buildBadgeInsertPayload(bundle.badge, { id: BADGE_ID, imageUrl: IMAGE_URL }), record, undoTables: UNDO_TABLES });
    const executable = sql.split(/\r\n|\n|\r|\u2028|\u2029/).filter((l) => l.trim() && !l.trim().startsWith('--'));
    expect(executable.some((l) => /DROP\s+TABLE/i.test(l))).toBe(false);
    // 값은 한 줄로 이어진 주석 안에 그대로 남는다(사람이 보고 이상함을 알아챌 수 있게)
    expect(sql).toContain('-- 배지: ok DROP TABLE public.badges;--');
  });
});

describe('buildRegistrationSql — 모든 주석 줄이 한 줄 (티켓 20260925_0549)', () => {
  const POISON = 'x\ny\r\nz\u2028w\u2029v\u0085u\u0000t\u001bs';

  function build(overrides: (record: ReturnType<typeof sampleRecord>) => void) {
    const bundle = sampleBundle();
    const payload = buildBadgeInsertPayload(bundle.badge, { id: BADGE_ID, imageUrl: IMAGE_URL });
    const clean = buildRegistrationSql({ payload, record: sampleRecord(bundle), undoTables: UNDO_TABLES });
    const record = sampleRecord(bundle);
    overrides(record);
    return { clean, poisoned: buildRegistrationSql({ payload, record, undoTables: UNDO_TABLES }) };
  }

  // 줄 구분자는 '\n' 하나뿐이어야 한다(개행 계열·제어 문자가 남으면 그 뒤가 주석 밖 문장이 된다).
  const allLineBreaks = /\r\n|\n|\r|\u2028|\u2029|\u0085/;

  it.each([
    ['bundle_id', (r: ReturnType<typeof sampleRecord>) => (r.bundle_id = POISON)],
    ['author', (r: ReturnType<typeof sampleRecord>) => (r.author = POISON)],
    ['registered_at', (r: ReturnType<typeof sampleRecord>) => (r.registered_at = POISON)],
    ['badge.name', (r: ReturnType<typeof sampleRecord>) => (r.badge.name = POISON)],
    ['badge.id', (r: ReturnType<typeof sampleRecord>) => (r.badge.id = POISON)],
    ['storage.bucket', (r: ReturnType<typeof sampleRecord>) => (r.storage.bucket = POISON)],
    ['storage.png_path', (r: ReturnType<typeof sampleRecord>) => (r.storage.png_path = POISON)],
    ['storage.webp_path', (r: ReturnType<typeof sampleRecord>) => (r.storage.webp_path = POISON)],
  ])('%s에 개행·CRLF·U+2028 등이 섞여도 주석 줄 수와 실행 줄이 그대로다', (_field, mutate) => {
    const { clean, poisoned } = build(mutate);
    const cleanLines = clean.split('\n');
    const poisonedLines = poisoned.split('\n');
    // 줄 수가 같다 = 값 안의 개행이 새 줄을 만들지 않았다.
    expect(poisonedLines).toHaveLength(cleanLines.length);
    // 줄 구분자('\n')를 뺀 나머지에 개행·제어 문자가 남지 않는다.
    expect(CONTROL_OR_LINE_BREAK.test(poisonedLines.join(''))).toBe(false);
    expect(poisoned.split(allLineBreaks)).toHaveLength(cleanLines.length);
    // '--'로 시작하지 않는 줄(실행되는 SQL)은 값이 달라져도 그대로다.
    const executable = (lines: string[]) => lines.filter((l) => !l.startsWith('--'));
    expect(executable(poisonedLines)).toEqual(executable(cleanLines));
    // 주석 줄은 여전히 전부 '--'로 시작한다.
    expect(poisonedLines.filter((l, i) => cleanLines[i].startsWith('--')).every((l) => l.startsWith('--'))).toBe(true);
  });

  it('제어·개행 문자 정규식의 원본은 registerBundle.mjs 한 곳이다(registerRecord.mjs에 범위를 다시 적지 않는다)', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'registerRecord.mjs'), 'utf-8');
    expect(source).not.toMatch(/\\u2028|\\u0085|\\u007f/i);
    expect(source).toContain('CONTROL_OR_LINE_BREAK');
  });
});

describe('buildRegistrationSql', () => {
  const bundle = sampleBundle();
  const payload = buildBadgeInsertPayload(bundle.badge, { id: BADGE_ID, imageUrl: IMAGE_URL });
  const sql = buildRegistrationSql({ payload, record: sampleRecord(bundle), undoTables: UNDO_TABLES });

  it('등록과 동등한 INSERT 문을 만든다(컬럼 순서와 값 순서가 같다)', () => {
    expect(sql).toContain('INSERT INTO public.badges (');
    expect(sql).toContain(`  '${BADGE_ID}'`);
    expect(sql).toContain("  '새벽 러너''s'");
    expect(sql).toContain("  'agent-generator'");
    expect(sql).toContain("  ARRAY['running']::text[]");
    expect(sql).toContain(`  '{"activity_type":"running","distance_km":5}'::jsonb`);
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING;');

    const columnBlock = sql.split('INSERT INTO public.badges (\n')[1].split('\n) VALUES (')[0];
    const valueBlock = sql.split('\n) VALUES (\n')[1].split('\n)\nON CONFLICT')[0];
    const columns = columnBlock.split(',\n').map((c) => c.trim());
    expect(columns).toEqual(Object.keys(payload));
    expect(valueBlock.split(',\n')).toHaveLength(columns.length);
  });

  it('파일 끝에 기계가 찾는 되돌림 SQL 주석 블록이 있다', () => {
    const lines = sql.trimEnd().split('\n');
    const markerIndex = lines.indexOf('-- 되돌림 SQL');
    expect(markerIndex).toBeGreaterThan(-1);
    expect(lines[markerIndex + 1]).toBe(`-- delete from public.badges where id = '${BADGE_ID}';`);
    // 마커 아래는 전부 SQL 주석이다(파일을 그대로 실행해도 지우지 않는다).
    for (const line of lines.slice(markerIndex)) expect(line.startsWith('--')).toBe(true);
  });

  it('되돌림 주석에 참조 확인 표 이름을 중복 없이 적는다(넘겨받은 목록이 원본)', () => {
    expect(sql).toContain('-- (이 SQL만으로는 저장소 파일이 남아요. user_activity_badges · item_books · missions에 이 id가 이미 붙었다면');
  });

  it('머리 주석에 묶음·저장소 파일·되돌림 명령·옮길 마이그레이션 파일명을 적는다', () => {
    expect(sql).toContain('-- 묶음: 2026-09-25-dawn-runner / 작성자: 윤진 / 등록 시각(KST): 2026-09-25T10:31:02+09:00');
    expect(sql).toContain(`badges/asset-generator/${BADGE_ID}.png, badges/asset-generator/${BADGE_ID}.webp`);
    expect(sql).toContain('register-badge.mjs --undo');
    expect(sql).toContain('jam-web/supabase/migrations/seed_agent_badge_2026_09_25_dawn_runner.sql');
  });
});

describe('formatDryRunSummary', () => {
  const bundle = sampleBundle();
  const payload = buildBadgeInsertPayload(bundle.badge, { id: '<id>', imageUrl: '<url>' });
  const dbChecks = [
    { label: '이름 중복', status: '건너뜀', detail: '서비스 키(.env.local)가 없어 DB를 읽지 않았어요' },
    { label: '트라이브 존재', status: '해당 없음', detail: '' },
  ];

  it('통과하면 컨펌 자료 항목(이름·설명·조건·이미지·시드·색·등록 예정·되돌림)을 전부 보여 준다', () => {
    const text = formatDryRunSummary({ bundle, payload, errors: [], dbChecks, webp: { bytes: 900 }, recordDir: '/tmp/bundle' });
    expect(text).toContain('결과: 통과');
    expect(text).toContain("- 이름: 새벽 러너's");
    expect(text).toContain('- 설명: 이른 아침을 달린 사람에게 남는 표식입니다.');
    expect(text).toContain('- 종류: 레벨형 Lv.1');
    expect(text).toContain('- 획득 조건: {"activity_type":"running","distance_km":5}');
    expect(text).toContain('- 원본 PNG: /tmp/bundle/image.png (2.0KB)');
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- 프리셋 ID: 11111111-1111-4111-8111-111111111111');
    expect(text).toContain('- 배경색 → 끝색: #ff1a00 → #ff4dff');
    expect(text).toContain('- 작성 시각: 2026-09-25 10:30:00 KST');
    expect(text).toContain('- 이름 중복: 건너뜀 — 서비스 키(.env.local)가 없어 DB를 읽지 않았어요');
    expect(text).toContain('- 트라이브 존재: 해당 없음');
    expect(text).toContain('- WebP 변환 미리 확인: 통과 (0.9KB, 긴 변 1280px 이하)');
    expect(text).toContain('[등록 예정 내용]');
    expect(text).toContain("delete from public.badges where id = '<등록할 때 정해지는 배지 id>';");
    expect(text).toContain('--undo /tmp/bundle/registration-record.json');
    expect(text).toContain('DB·저장소에는 아무것도 쓰지 않았어요.');
  });

  it('DB 읽기 검사를 건너뛰었으면 첫 줄에 건너뜀을 적고 다시 돌리라는 안내를 넣는다', () => {
    const text = formatDryRunSummary({ bundle, payload, errors: [], dbChecks, webp: { bytes: 900 }, recordDir: '/tmp/bundle' });
    const lines = text.split('\n');
    expect(lines[1]).toBe('결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)');
    expect(lines[2]).toContain('컨펌 근거로 쓰지 말고');
    expect(lines[2]).toContain('서비스 키가 있는 환경(메인 폴더)에서 다시 돌려요');
  });

  it('건너뜀이 없으면(키가 있으면) 첫 줄이 기존과 같고 안내가 없다', () => {
    const ran = [
      { label: '이름 중복', status: '통과', detail: '' },
      { label: '트라이브 존재', status: '해당 없음', detail: '' },
    ];
    const text = formatDryRunSummary({ bundle, payload, errors: [], dbChecks: ran, webp: { bytes: 900 }, recordDir: '/tmp/bundle' });
    const lines = text.split('\n');
    expect(lines[1]).toBe('결과: 통과');
    expect(text).not.toContain('컨펌 근거로 쓰지 말고');
    expect(text).not.toContain('건너뜀 — 서비스 키 없음');
  });

  it('실패하면 사유를 먼저 보여 주고, 묶음이 없으면 사유만 보여 준다', () => {
    const failed = formatDryRunSummary({
      bundle,
      payload,
      errors: ['이름 중복: 같은 이름의 배지가 이미 있어요(id: x).'],
      dbChecks,
      webp: { bytes: 900 },
      recordDir: '/tmp/bundle',
    });
    expect(failed).toContain('결과: 실패 (1건)');
    expect(failed).toContain('[고쳐야 할 점]\n- 이름 중복: 같은 이름의 배지가 이미 있어요(id: x).');

    const noBundle = formatDryRunSummary({
      bundle: null,
      payload: null,
      errors: ['image.bg_color: #rrggbb 형식이어야 해요(받은 값: "red").'],
      dbChecks: [],
      webp: undefined,
      recordDir: '/tmp/bundle',
    });
    expect(noBundle).toContain('결과: 실패 (1건)');
    expect(noBundle).not.toContain('[배지]');
    expect(noBundle).toContain('DB·저장소에는 아무것도 쓰지 않았어요.');
  });
});
