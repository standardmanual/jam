/**
 * 미션 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260925_1412)
 *
 * 시각 표기·SQL 리터럴 자체(배지판에서 가져다 쓰는 부품)는 다시 시험하지 않고, 미션 필드가 그 부품을 거쳐
 * 올바른 SQL·기록·요약이 되는지만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMissionInsertPayload } from '../registerMissionBundle.mjs';
import {
  buildMissionRegistrationRecord,
  buildMissionRegistrationSql,
  formatMissionDryRunSummary,
  missionMigrationFileName,
  summarizeMissionBundle,
} from '../registerMissionRecord.mjs';

const MISSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BADGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IMAGE_URL = `https://cdn.test/storage/v1/object/public/images/missions/asset-generator/${MISSION_ID}.webp?v=1790300000000`;
const UNDO_TABLES = ['user_mission_completions', 'today_cards'];

interface SampleBundle {
  world_review: Record<string, unknown>;
  mission: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

function sampleBundle(): SampleBundle {
  return {
    bundle_id: '2026-09-25-weekend-long-run',
    author: '윤진',
    created_at: '2026-09-25T10:30:00+09:00',
    color_rationale_link: 'docs/service/content/TRIBES.md',
    world_review: { world_related: true, winter_reviewed: true, reason: "트라이브 표현이 있어 윈터가 검수했습니다. 'OK'" },
    mission: {
      title: "주말 롱런's 챌린지",
      description: '주말 동안 30km를 달려 보세요.',
      mission_type: 'distance',
      condition_json: { activity_type: 'running', distance_km: 30 },
      starts_at: '2026-10-03T00:00:00+09:00',
      ends_at: '2026-10-10T00:00:00+09:00',
      reward_points: 50,
      reward_badge_ids: [BADGE_ID],
      status_display_type: 'ranking',
      visible_rank_count: 10,
      exposure_mode: 'scheduled',
      exposure_at: '2026-10-02T09:00:00+09:00',
    },
    image: {
      path: 'image.png',
      abs_path: '/tmp/bundle/image.png',
      bytes: 2048,
      seed: 20260925,
      preset_id: '11111111-1111-4111-8111-111111111111',
      bg_color: '#ff1a00',
      end_color: '#ff4dff',
      text: '롱런',
    },
  };
}

const registered = {
  missionId: MISSION_ID,
  bucket: 'images',
  pngPath: `missions/asset-generator/${MISSION_ID}.png`,
  webpPath: `missions/asset-generator/${MISSION_ID}.webp`,
  originalUrl: `https://cdn.test/images/missions/asset-generator/${MISSION_ID}.png`,
  imageUrl: IMAGE_URL,
  webpBytes: 1024,
  registeredAt: new Date(Date.UTC(2026, 8, 25, 1, 31, 2)),
};

function payloadOf(bundle: SampleBundle) {
  return buildMissionInsertPayload(bundle.mission, { id: MISSION_ID, imageUrl: IMAGE_URL });
}

describe('missionMigrationFileName · summarizeMissionBundle', () => {
  it('묶음 ID의 영문·숫자가 아닌 문자를 밑줄로 바꿔 seed_agent_mission_ 파일명을 만든다', () => {
    expect(missionMigrationFileName('2026-09-25-weekend-long-run')).toBe('seed_agent_mission_2026_09_25_weekend_long_run.sql');
  });

  it('요약 한 줄에 유형·제목·기간·조건이 들어간다', () => {
    const line = summarizeMissionBundle(sampleBundle());
    expect(line).toContain("[distance] 주말 롱런's 챌린지");
    expect(line).toContain('2026-10-03T00:00:00+09:00 ~ 2026-10-10T00:00:00+09:00');
    expect(line).toContain('조건 {"activity_type":"running","distance_km":30}');
  });

  it('종료일이 없으면 «종료일 없음»으로 적는다', () => {
    const bundle = sampleBundle();
    delete bundle.mission.ends_at;
    expect(summarizeMissionBundle(bundle)).toContain('~ 종료일 없음');
  });
});

describe('buildMissionRegistrationRecord', () => {
  it('미션 id·저장 경로·URL·세계관 검수 기록·이미지 재현 정보를 담는다', () => {
    const record = buildMissionRegistrationRecord({ bundle: sampleBundle(), ...registered });
    expect(record.registered_at).toBe('2026-09-25T10:31:02+09:00');
    expect(record.mission).toMatchObject({ id: MISSION_ID, mission_type: 'distance', image_source: 'agent-generator', exposure_mode: 'scheduled' });
    expect(record.world_review).toEqual({ world_related: true, winter_reviewed: true, reason: "트라이브 표현이 있어 윈터가 검수했습니다. 'OK'" });
    expect(record.storage).toEqual({ bucket: 'images', png_path: `missions/asset-generator/${MISSION_ID}.png`, webp_path: `missions/asset-generator/${MISSION_ID}.webp` });
    expect(record.urls.image_url).toBe(IMAGE_URL);
    expect(record.image).toMatchObject({ seed: 20260925, source_path: 'image.png', original_bytes: 2048, webp_bytes: 1024 });
  });

  it('상태 표시·노출 모드를 생략한 묶음은 기본값으로 기록한다', () => {
    const bundle = sampleBundle();
    delete bundle.mission.status_display_type;
    delete bundle.mission.exposure_mode;
    const record = buildMissionRegistrationRecord({ bundle, ...registered });
    expect(record.mission.status_display_type).toBe('ranking');
    expect(record.mission.exposure_mode).toBe('start_date');
  });
});

describe('buildMissionRegistrationSql', () => {
  const bundle = sampleBundle();
  const record = buildMissionRegistrationRecord({ bundle, ...registered });
  const sql = buildMissionRegistrationSql({ payload: payloadOf(bundle), record, undoTables: UNDO_TABLES });

  it('INSERT INTO public.missions와 ON CONFLICT DO NOTHING을 낸다', () => {
    expect(sql).toContain('INSERT INTO public.missions (');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING;');
    expect(sql).toContain(`  '${MISSION_ID}'`);
  });

  it('작은따옴표는 두 번 쓰고, 조건은 jsonb, 보상 배지는 uuid[] 리터럴로 쓴다(text[]는 uuid[] 컬럼에 들어가지 않는다)', () => {
    expect(sql).toContain("'주말 롱런''s 챌린지'");
    expect(sql).toContain(`'{"activity_type":"running","distance_km":30}'::jsonb`);
    expect(sql).toContain(`ARRAY['${BADGE_ID}']::uuid[]`);
    expect(sql).not.toContain('::text[]');
  });

  it('보상 배지가 없으면 빈 uuid[] 배열이다', () => {
    const empty = sampleBundle();
    delete empty.mission.reward_badge_ids;
    const emptySql = buildMissionRegistrationSql({ payload: payloadOf(empty), record, undoTables: UNDO_TABLES });
    expect(emptySql).toContain('ARRAY[]::uuid[]');
  });

  it('값이 없는 필드는 NULL, 이미지 출처는 agent-generator다', () => {
    expect(sql).toContain('  NULL');
    expect(sql).toContain("  'agent-generator'");
  });

  it('파일 끝에 되돌림 표식과 삭제 SQL, 붙은 사용자 데이터 안내가 있다', () => {
    expect(sql).toContain('-- 되돌림 SQL');
    expect(sql).toContain(`-- delete from public.missions where id = '${MISSION_ID}';`);
    expect(sql).toContain('user_mission_completions · today_cards');
    expect(sql).toContain('seed_agent_mission_2026_09_25_weekend_long_run.sql');
  });

  it('줄바꿈이 섞인 값도 주석 밖의 실행 가능한 문장이 되지 않는다', () => {
    const evil = sampleBundle();
    evil.author = '윤진\nDROP TABLE users; --';
    evil.mission.title = '제목\r\nDELETE FROM missions; --';
    const evilRecord = buildMissionRegistrationRecord({ bundle: evil, ...registered });
    const evilSql = buildMissionRegistrationSql({ payload: payloadOf(evil), record: evilRecord, undoTables: UNDO_TABLES });
    const headerLines = evilSql.split('\n').slice(0, evilSql.split('\n').indexOf('INSERT INTO public.missions ('));
    expect(headerLines.every((line) => line === '' || line.startsWith('--'))).toBe(true);
  });
});

describe('formatMissionDryRunSummary', () => {
  const bundle = sampleBundle();
  const payload = buildMissionInsertPayload(bundle.mission, { id: '<등록할 때 정해지는 미션 id>', imageUrl: '<WebP 공개 주소>' });
  const dbChecks = [
    { label: '제목 중복', status: '통과', detail: '' },
    { label: '보상 배지 존재', status: '건너뜀', detail: '서비스 키(.env.local)가 없어 DB를 읽지 않았어요' },
  ];

  it('통과하면 묶음·세계관 검수·미션·이미지·DB 검사·등록 예정·되돌림 미리보기를 보여 준다', () => {
    const text = formatMissionDryRunSummary({ bundle, payload, errors: [], dbChecks, webp: { bytes: 1024 }, recordDir: '/tmp/bundle' });
    expect(text).toContain('== 미션 등록 묶음 검증 (--dry-run) ==');
    expect(text).toContain('결과: 통과');
    expect(text).toContain('- 작성 시각: 2026-09-25 10:30:00 KST');
    expect(text).toContain('- 세계관과 닿는 내용: 있음');
    expect(text).toContain('- 윈터 검수: 거침');
    expect(text).toContain("- 제목: 주말 롱런's 챌린지");
    expect(text).toContain('- 표시 방식: 랭킹형 (상위 10명 노출)');
    expect(text).toContain('- 기간: 2026-10-03 00:00:00 KST ~ 2026-10-10 00:00:00 KST');
    expect(text).toContain('- 노출 모드: 지정한 시각에 노출 (2026-10-02 09:00:00 KST)');
    expect(text).toContain(`- 보상 배지: ${BADGE_ID}`);
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- 제목 중복: 통과');
    expect(text).toContain('- 보상 배지 존재: 건너뜀 — 서비스 키');
    expect(text).toContain('missions/asset-generator/<새 미션 id>.png');
    expect(text).toContain("delete from public.missions where id = '<등록할 때 정해지는 미션 id>';");
    expect(text).toContain('register-mission.mjs --undo /tmp/bundle/registration-record.json');
    expect(text.trimEnd().endsWith('DB·저장소에는 아무것도 쓰지 않았어요.')).toBe(true);
  });

  it('DB 읽기 검사를 건너뛰었으면 첫 줄에 건너뜀을 적고 다시 돌리라는 안내를 넣는다(배지판과 같은 표기)', () => {
    const lines = formatMissionDryRunSummary({ bundle, payload, errors: [], dbChecks, webp: { bytes: 1024 }, recordDir: '/tmp/bundle' }).split('\n');
    expect(lines[1]).toBe('결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)');
    expect(lines[2]).toContain('컨펌 근거로 쓰지 말고');
    expect(lines[2]).toContain('서비스 키가 있는 환경(메인 폴더)에서 다시 돌려요');
  });

  it('건너뜀이 없으면 첫 줄이 기존과 같고 안내가 없다', () => {
    const ran = [{ label: '제목 중복', status: '통과', detail: '' }];
    const text = formatMissionDryRunSummary({ bundle, payload, errors: [], dbChecks: ran, recordDir: '/tmp/bundle' });
    expect(text.split('\n')[1]).toBe('결과: 통과');
    expect(text).not.toContain('컨펌 근거로 쓰지 말고');
  });

  it('숨김 미션·상시 미션·검수 없는 미션을 알아볼 수 있게 적는다', () => {
    const quiet = sampleBundle();
    quiet.world_review = { world_related: false, winter_reviewed: false, reason: '순수 운영성 미션' };
    Object.assign(quiet.mission, { exposure_mode: 'hidden', exposure_at: undefined });
    delete quiet.mission.ends_at;
    const quietPayload = buildMissionInsertPayload(quiet.mission, { id: 'x', imageUrl: 'y' });
    const text = formatMissionDryRunSummary({ bundle: quiet, payload: quietPayload, errors: [], dbChecks: [], recordDir: '/tmp/bundle' });
    expect(text).toContain('- 세계관과 닿는 내용: 없음(순수 운영성)');
    expect(text).toContain('- 윈터 검수: 거치지 않음');
    expect(text).toContain('종료일 없음(상시)');
    expect(text).toContain('- 노출 모드: 숨김(서비스 어디에도 노출하지 않음)');
    expect(text).toContain('- WebP 변환 미리 확인: 하지 않았어요');
  });

  it('실패하면 사유 전체를 보여 주고, 묶음이 없으면 사유만 보여 준다', () => {
    const text = formatMissionDryRunSummary({ bundle: null, payload: null, errors: ['a', 'b'], dbChecks: [], recordDir: '/tmp/bundle' });
    expect(text).toContain('결과: 실패 (2건)');
    expect(text).toContain('[고쳐야 할 점]\n- a\n- b');
    expect(text).not.toContain('[미션]');
  });

  it('알아둘 점(warnings)을 따로 보여 준다', () => {
    const text = formatMissionDryRunSummary({ bundle, payload, errors: [], warnings: ['판정에 영향이 없는 필드'], dbChecks, recordDir: '/tmp/bundle' });
    expect(text).toContain('[알아둘 점]\n- 판정에 영향이 없는 필드');
  });
});

describe('제어·개행 문자 정규식 원본 (티켓 20260926_0120)', () => {
  it.each(['registerMissionRecord.mjs', 'registerMissionBundle.mjs'])('%s에 범위 문자를 다시 적지 않는다(원본은 registerBundle.mjs 한 곳)', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
    expect(source).not.toMatch(/\\u2028|\\u0085/);
  });
});
