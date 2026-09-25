/**
 * 미션 등록 묶음 — 검증·미션 행 매핑 (티켓 20260925_1412)
 *
 * 검증 규칙의 정본은 docs/specs/prd/asset-generator/MISSION_REGISTRATION_BUNDLE.md다. 여기서는 규칙마다
 * «어떤 사유 문장이 나오는지»까지 확인한다(에이전트가 이 문장을 보고 묶음을 고친다). 배지와 공통인 부품
 * (`readBundleFile`·`findPreviousRecordError`)은 다시 시험하지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMissionInsertPayload, validateMissionBundle } from '../registerMissionBundle.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-mission-bundle');
const JAM_WEB_DIR = path.join(__dirname, '..', '..', '..');
const ROUTE_FILE = path.join(JAM_WEB_DIR, 'src', 'app', 'api', 'admin', 'missions', 'route.ts');
const GENERATED_TYPES_FILE = path.join(JAM_WEB_DIR, 'src', 'types', 'database.generated.ts');

let workDir: string;
let bundleFile: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-mission-bundle-test-'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'image.png'), path.join(workDir, 'image.png'));
  bundleFile = path.join(workDir, 'bundle.json');
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

interface RawBundle {
  world_review: Record<string, unknown>;
  mission: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

/** 예시 묶음과 같은 내용의 유효한 원본(테스트마다 복사해서 한 필드씩 망가뜨린다) */
function validRaw(): RawBundle {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'bundle.json'), 'utf8'));
}

function validate(raw: unknown) {
  return validateMissionBundle(raw, { bundleFile });
}

describe('validateMissionBundle — 통과', () => {
  it('예시 묶음은 통과하고 이미지 절대경로·크기가 붙는다', () => {
    const file = path.join(FIXTURE_DIR, 'bundle.json');
    const { errors, warnings, bundle } = validateMissionBundle(validRaw(), { bundleFile: file });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(bundle.image.abs_path).toBe(path.join(FIXTURE_DIR, 'image.png'));
    expect(bundle.image.bytes).toBeGreaterThan(0);
    expect(bundle.mission.title).toBe('[TEST] 예시 주말 러닝 미션');
  });

  it('선택 필드를 전부 채운 묶음도 통과한다', () => {
    const raw = validRaw();
    Object.assign(raw.mission, {
      reward_badge_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      status_display_type: 'ranking',
      visible_rank_count: 10,
      max_completions: 1,
      exposure_mode: 'scheduled',
      exposure_at: '2026-10-02T09:00:00+09:00',
    });
    expect(validate(raw).errors).toEqual([]);
  });

  it('세계관 내용이 있고 윈터 검수를 거쳤으면 통과한다', () => {
    const raw = validRaw();
    raw.world_review = { world_related: true, winter_reviewed: true, reason: '트라이브 세계관 표현이 있어 윈터가 검수했습니다.' };
    expect(validate(raw).errors).toEqual([]);
  });
});

describe('validateMissionBundle — 구조·필수·문자열', () => {
  it('필수 항목이 없으면 항목마다 사유를 모두 알린다', () => {
    const raw = validRaw();
    delete raw.mission.title;
    delete raw.mission.starts_at;
    delete raw.image.seed;
    delete raw.world_review;
    const { errors, bundle } = validate(raw);
    expect(bundle).toBeNull();
    expect(errors).toEqual(expect.arrayContaining(['mission.title: 필수 항목이 없어요.', 'mission.starts_at: 필수 항목이 없어요.', 'image.seed: 필수 항목이 없어요.', 'world_review: 필수 항목이 없어요.']));
  });

  it('지원하지 않는 필드는 거절한다 — 폐기 예정 필드와 image_source 포함', () => {
    const raw = validRaw();
    Object.assign(raw.mission, { reward_type: 'points', gated_badge_id: null, image_source: 'admin-generator' });
    raw.extra = 1;
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('mission: 묶음이 지원하지 않는 필드예요 — reward_type, gated_badge_id, image_source');
    expect(text).toContain('알 수 없는 최상위 필드예요 — extra');
  });

  it.each([
    ['author', (raw: RawBundle) => (raw.author = '윤진\n-- 주입')],
    ['mission.title', (raw: RawBundle) => (raw.mission.title = '제목\r\nDROP TABLE users;')],
    ['world_review.reason', (raw: RawBundle) => (raw.world_review.reason = '사유\n두 줄')],
  ])('%s에 줄바꿈이 있으면 거절한다', (field, mutate) => {
    const raw = validRaw();
    mutate(raw);
    expect(validate(raw).errors).toContain(`${field}: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`);
  });

  it('bundle_id 형식·created_at 시간대·컬러 근거 링크를 검사한다', () => {
    const raw = validRaw();
    raw.bundle_id = 'Bad_ID';
    raw.created_at = '2026-09-25 10:30';
    raw.color_rationale_link = '아무 말';
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('bundle_id: 영문 소문자·숫자와 하이픈만');
    expect(text).toContain('created_at: 시간대가 붙은 ISO 8601 형식이어야 해요');
    expect(text).toContain('color_rationale_link: http(s) 주소이거나 저장소 상대 경로');
  });
});

describe('validateMissionBundle — 세계관 검수 기록', () => {
  it('세계관 내용이 있는데 윈터 검수를 안 거쳤으면 거절한다', () => {
    const raw = validRaw();
    raw.world_review = { world_related: true, winter_reviewed: false, reason: '검수 생략' };
    expect(validate(raw).errors.join('\n')).toContain('world_review.winter_reviewed: 세계관과 닿는 미션(world_related=true)은 윈터 검수를 거쳐야 해서 true여야 해요.');
  });

  it('사유가 없거나 불리언이 아니면 거절한다', () => {
    const raw = validRaw();
    raw.world_review = { world_related: 'yes', winter_reviewed: false };
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('world_review.reason: 필수 항목이 없어요.');
    expect(text).toContain('world_review.world_related: true 또는 false여야 해요');
  });
});

describe('validateMissionBundle — 어드민 미션 API와 같은 검증 3종', () => {
  it('라우트가 같은 세 함수를 같은 순서(키 → 값 → 게이트)로 부르는 것을 확인한다', () => {
    const source = fs.readFileSync(ROUTE_FILE, 'utf8');
    const positions = ['checkMissionCondition(', 'checkMissionConditionValue(', 'findGateMissionSaveError('].map((name) => source.indexOf(name, source.indexOf('export async function POST')));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('조건 키 오타는 checkMissionCondition 사유로 거절한다', () => {
    const raw = validRaw();
    raw.mission.condition_json = { distnace_km: 30 };
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('mission.condition_json: 조건 JSON을 저장하지 못했어요. 미션 조건에 없는 필드가 있어요 — distnace_km');
    expect(text).toContain('distance_km');
  });

  it('조건 값이 0 이하이면 checkMissionConditionValue 사유로 거절한다', () => {
    const raw = validRaw();
    raw.mission.condition_json = { distance_km: 0 };
    expect(validate(raw).errors.join('\n')).toContain('거리 값은 0보다 큰 숫자여야 하는데');
  });

  it('item_collect의 배지 id가 비면 거절한다(영구 미달성 방지)', () => {
    const raw = validRaw();
    raw.mission.mission_type = 'item_collect';
    raw.mission.condition_json = { badge_id: null };
    expect(validate(raw).errors.join('\n')).toContain('목표 배지를 지정해야 달성 여부를 판정할 수 있는데 비어 있어요');
  });

  it('조건 키가 틀리면 값 검사는 이어서 하지 않는다(라우트와 같은 순서)', () => {
    const raw = validRaw();
    raw.mission.condition_json = { distnace_km: 0 };
    const conditionErrors = validate(raw).errors.filter((e) => e.startsWith('mission.condition_json:'));
    expect(conditionErrors).toHaveLength(1);
  });

  it('조건이 객체가 아니면 거절한다', () => {
    const raw = validRaw();
    raw.mission.condition_json = [1, 2];
    expect(validate(raw).errors).toContain('mission.condition_json: 객체여야 해요.');
  });

  it('게이트 축과 단계가 짝이 아니면 findGateMissionSaveError 사유로 거절한다', () => {
    const raw = validRaw();
    raw.mission.gate_axis = 'running:pace';
    expect(validate(raw).errors.join('\n')).toContain('mission.gate: 저장할 수 없어요. 여는 축과 게이트 단계는 둘 다 지정하거나 둘 다 비워야 해요.');
  });

  it('노출 조건은 게이트 미션에만 붙일 수 있다', () => {
    const raw = validRaw();
    raw.mission.visibility_rule_json = { require_owned: { family_keys: ['running:pace'] } };
    expect(validate(raw).errors.join('\n')).toContain('노출 조건은 게이트 미션(여는 축이 있는 미션)에만 설정할 수 있어요');
  });

  it('미션 유형이 목록에 없으면 거절한다(DB CHECK와 같은 목록)', () => {
    const raw = validRaw();
    raw.mission.mission_type = 'poi_visit';
    expect(validate(raw).errors.join('\n')).toContain('mission.mission_type: distance · checkin · activity_count');
  });
});

describe('validateMissionBundle — 기간·노출·표시·보상', () => {
  it('시작이 종료보다 늦거나 같으면 거절한다', () => {
    const raw = validRaw();
    raw.mission.ends_at = raw.mission.starts_at;
    expect(validate(raw).errors).toContain('mission.starts_at: ends_at보다 앞이어야 해요.');
  });

  it('시간대 없는 시각은 거절한다', () => {
    const raw = validRaw();
    raw.mission.starts_at = '2026-10-03';
    expect(validate(raw).errors.join('\n')).toContain('mission.starts_at: 시간대가 붙은 ISO 8601 형식이어야 해요');
  });

  it('scheduled면 exposure_at이 필요하고, 다른 모드에서 exposure_at을 주면 거절한다', () => {
    const scheduled = validRaw();
    scheduled.mission.exposure_mode = 'scheduled';
    expect(validate(scheduled).errors).toContain('mission.exposure_at: exposure_mode가 scheduled면 노출 시각이 필요해요.');

    const other = validRaw();
    other.mission.exposure_at = '2026-10-02T09:00:00+09:00';
    expect(validate(other).errors.join('\n')).toContain('mission.exposure_at: exposure_mode가 scheduled일 때만 쓸 수 있어요');
  });

  it('exposure_mode·status_display_type 값 목록을 검사한다', () => {
    const raw = validRaw();
    raw.mission.exposure_mode = 'later';
    raw.mission.status_display_type = 'chart';
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('mission.exposure_mode: hidden · start_date · scheduled 중 하나여야 해요');
    expect(text).toContain('mission.status_display_type: ranking · achievement · individual 중 하나여야 해요');
  });

  it('숫자 필드 범위를 검사한다', () => {
    const raw = validRaw();
    Object.assign(raw.mission, { reward_points: -1, visible_rank_count: 0, max_completions: 1.5 });
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('mission.reward_points: 0 이상의 정수여야 해요.');
    expect(text).toContain('mission.visible_rank_count: 1 이상의 정수여야 해요.');
    expect(text).toContain('mission.max_completions: 1 이상의 정수여야 해요.');
  });

  it('보상 배지 id 형식·중복을 검사한다', () => {
    const bad = validRaw();
    bad.mission.reward_badge_ids = ['not-a-uuid'];
    expect(validate(bad).errors).toContain('mission.reward_badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.');

    const dup = validRaw();
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    dup.mission.reward_badge_ids = [id, id.toUpperCase()];
    expect(validate(dup).errors).toContain('mission.reward_badge_ids: 같은 배지를 두 번 넣을 수 없어요.');
  });
});

describe('validateMissionBundle — 이미지', () => {
  it('이미지 파일이 없으면 거절한다', () => {
    const raw = validRaw();
    raw.image.path = 'nope.png';
    expect(validate(raw).errors.join('\n')).toContain('image.path: 이미지 파일을 찾을 수 없어요');
  });

  it('PNG가 아닌 파일은 확장자와 무관하게 거절한다', () => {
    fs.writeFileSync(path.join(workDir, 'fake.png'), 'not a png');
    const raw = validRaw();
    raw.image.path = 'fake.png';
    expect(validate(raw).errors.join('\n')).toContain('image.path: PNG 파일이 아니에요');
  });

  it('시드·프리셋·색 형식을 검사한다', () => {
    const raw = validRaw();
    Object.assign(raw.image, { seed: 1.5, preset_id: 'x', bg_color: 'red' });
    const text = validate(raw).errors.join('\n');
    expect(text).toContain('image.seed: 정수여야 해요(받은 값: 1.5).');
    expect(text).toContain('image.preset_id: 프리셋 ID(UUID) 형식이 아니에요');
    expect(text).toContain('image.bg_color: #rrggbb 형식이어야 해요(받은 값: "red").');
  });
});

describe('buildMissionInsertPayload', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const imageUrl = 'https://cdn.test/missions/asset-generator/x.webp?v=1';

  it('image_url·image_source를 넣고 폐기 예정 필드는 null, 생략한 필드는 DB 기본값과 같은 값으로 채운다', () => {
    const payload = buildMissionInsertPayload(validRaw().mission, { id, imageUrl });
    expect(payload).toMatchObject({
      id,
      image_url: imageUrl,
      image_source: 'agent-generator',
      reward_type: null,
      reward_id: null,
      gated_badge_id: null,
      reward_badge_ids: [],
      visible_rank_count: null,
      max_completions: null,
      gate_axis: null,
      gate_stage: null,
      visibility_rule_json: null,
      exposure_at: null,
      status_display_type: 'achievement',
      exposure_mode: 'hidden',
      reward_points: 50,
    });
  });

  it('상태 표시·노출 모드를 생략하면 어드민 기본값(ranking·start_date)이 들어간다', () => {
    const mission = validRaw().mission;
    delete mission.status_display_type;
    delete mission.exposure_mode;
    const payload = buildMissionInsertPayload(mission, { id, imageUrl });
    expect(payload.status_display_type).toBe('ranking');
    expect(payload.exposure_mode).toBe('start_date');
  });

  it('생성 타입(database.generated.ts)의 missions Insert 컬럼과 어긋나지 않는다', () => {
    const source = fs.readFileSync(GENERATED_TYPES_FILE, 'utf8');
    const table = source.slice(source.indexOf('      missions: {'));
    const insertBlock = table.slice(table.indexOf('Insert: {'), table.indexOf('Update: {'));
    const columns = [...insertBlock.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    const payloadKeys = Object.keys(buildMissionInsertPayload(validRaw().mission, { id, imageUrl }));
    // created_at은 DB 기본값에 맡겨서 페이로드에 없다.
    expect([...payloadKeys, 'created_at'].sort()).toEqual([...columns].sort());
  });
});
