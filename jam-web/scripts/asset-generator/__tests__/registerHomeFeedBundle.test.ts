/**
 * 홈피드 카드 등록 묶음 — 검증·카드 행 매핑 (티켓 20260925_1413)
 *
 * 검증 규칙의 정본은 docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md다. 규칙마다 «어떤 사유 문장이
 * 나오는지»까지 확인한다(에이전트가 이 문장을 보고 묶음을 고친다). 배지와 공통인 부품(`readBundleFile`·
 * `findPreviousRecordError`)은 다시 시험하지 않는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SUGGESTED_LAYOUT_FOR, TODAY_FIELDS_FOR } from '../../../src/lib/admin/today-sections';
import {
  CONTENT_TYPE_IDS,
  EXPOSURE_TAGS,
  LAYOUT_TYPES,
  REQUIRED_REFERENCE_FIELDS,
  TEMPLATE_FIELD_KEY,
  TEMPLATE_TYPES,
  buildTodayCardInsertPayload,
  validateHomeFeedBundle,
} from '../registerHomeFeedBundle.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-home-feed-bundle');
const JAM_WEB_DIR = path.join(__dirname, '..', '..', '..');
const MIGRATIONS_DIR = path.join(JAM_WEB_DIR, 'supabase', 'migrations');
const GENERATED_TYPES_FILE = path.join(JAM_WEB_DIR, 'src', 'types', 'database.generated.ts');

const BADGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let workDir: string;
let bundleFile: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-home-feed-bundle-test-'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'image.png'), path.join(workDir, 'image.png'));
  bundleFile = path.join(workDir, 'bundle.json');
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

interface RawBundle {
  world_review: Record<string, unknown>;
  card: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

/** 예시 묶음과 같은 내용의 유효한 원본(테스트마다 복사해서 한 필드씩 망가뜨린다) */
function validRaw(): RawBundle {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'bundle.json'), 'utf8'));
}

function validate(raw: unknown) {
  return validateHomeFeedBundle(raw, { bundleFile });
}

function errorsFor(mutate: (raw: RawBundle) => void) {
  const raw = validRaw();
  mutate(raw);
  return validate(raw).errors;
}

/** 마이그레이션 SQL에서 `<제약 이름> CHECK (<컬럼> IN (...))`의 값 목록을 뽑는다. */
function checkValues(file: string, constraint: string): string[] {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  // 주석에도 제약 이름이 나오므로 «ADD CONSTRAINT <이름>»으로 실제 정의를 찾는다.
  const start = sql.indexOf(`ADD CONSTRAINT ${constraint}`);
  expect(start, `${file}에서 ${constraint}를 찾지 못했어요`).toBeGreaterThan(-1);
  const open = sql.indexOf('IN (', start);
  const close = sql.indexOf('))', open);
  return [...sql.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('validateHomeFeedBundle — 통과', () => {
  it('예시 묶음은 통과하고 이미지 절대경로·크기가 붙는다', () => {
    const file = path.join(FIXTURE_DIR, 'bundle.json');
    const { errors, bundle } = validateHomeFeedBundle(validRaw(), { bundleFile: file });
    expect(errors).toEqual([]);
    expect(bundle.image.abs_path).toBe(path.join(FIXTURE_DIR, 'image.png'));
    expect(bundle.image.bytes).toBeGreaterThan(0);
    expect(bundle.card.title).toBe('[TEST] 예시 주간 홈피드 카드');
  });

  it('필수 4개 필드와 노출 태그만 있는 카드(drop_alert)도 통과한다', () => {
    const raw = validRaw();
    raw.card = {
      title: '드랍 알림',
      template_type: 'drop_alert',
      exposure_tags: ['all'],
      starts_at: '2026-10-05T00:00:00+09:00',
      ends_at: '2026-10-12T00:00:00+09:00',
    };
    expect(validate(raw).errors).toEqual([]);
  });

  it('참조를 채운 미션 소개·배지 소개·진행 알림 카드도 통과한다', () => {
    const raw = validRaw();
    Object.assign(raw.card, { template_type: 'mission_spotlight', mission_id: MISSION_ID, body_markdown: undefined, target_href: '/missions/x' });
    expect(validate(raw).errors).toEqual([]);
    Object.assign(raw.card, { template_type: 'badge_spotlight', mission_id: undefined, badge_ids: [BADGE_ID] });
    expect(validate(raw).errors).toEqual([]);
    Object.assign(raw.card, { template_type: 'progress_nudge', badge_ids: [], mission_id: MISSION_ID, target_href: 'https://j-a-m.app/missions' });
    expect(validate(raw).errors).toEqual([]);
  });

  it('세계관 내용이 있고 윈터 검수를 거쳤으면 통과한다', () => {
    const raw = validRaw();
    raw.world_review = { world_related: true, winter_reviewed: true, reason: '트라이브 세계관 표현이 있어 윈터가 검수했습니다.' };
    expect(validate(raw).errors).toEqual([]);
  });
});

describe('허용값 목록 — today-sections.ts·DB CHECK와 갈라지지 않는다', () => {
  it('템플릿 목록은 today_cards_template_type_check(마이그레이션 158)와 같다', () => {
    expect([...TEMPLATE_TYPES].sort()).toEqual(checkValues('158_ranking_modes.sql', 'today_cards_template_type_check').sort());
  });

  it('노출 형태 목록은 today_cards_layout_type_check(마이그레이션 158)와 같다', () => {
    expect([...LAYOUT_TYPES].sort()).toEqual(checkValues('158_ranking_modes.sql', 'today_cards_layout_type_check').sort());
  });

  it('컨텐츠 유형 목록은 today_cards_content_type_id_check(마이그레이션 183)와 같다', () => {
    expect([...CONTENT_TYPE_IDS].sort()).toEqual(checkValues('183_today_card_type_and_events.sql', 'today_cards_content_type_id_check').sort());
  });

  it('image_source CHECK(마이그레이션 190)는 스크립트가 넣는 agent-generator를 허용한다', () => {
    expect(checkValues('190_today_cards_image_source.sql', 'today_cards_image_source_check')).toContain('agent-generator');
  });

  it('노출 태그 목록은 어드민 폼 상수와 같은 값이고 all을 포함한다', () => {
    expect(EXPOSURE_TAGS).toContain('all');
    expect(new Set(EXPOSURE_TAGS).size).toBe(EXPOSURE_TAGS.length);
  });

  it('템플릿별 필수 참조는 그 템플릿의 TODAY_FIELDS_FOR가 허용하는 필드만 가리킨다', () => {
    for (const template of TEMPLATE_TYPES as (keyof typeof TODAY_FIELDS_FOR)[]) {
      const fields = TODAY_FIELDS_FOR[template] as Record<string, boolean | undefined>;
      const required = (REQUIRED_REFERENCE_FIELDS as Record<string, string[]>)[template];
      expect(required, `${template}의 필수 참조 정의가 없어요`).toBeDefined();
      for (const key of required) {
        expect(fields[(TEMPLATE_FIELD_KEY as Record<string, string>)[key]], `${template}는 ${key}를 쓰지 않는데 필수로 요구해요`).toBe(true);
      }
    }
    expect(Object.keys(REQUIRED_REFERENCE_FIELDS).sort()).toEqual([...TEMPLATE_TYPES].sort());
  });
});

describe('validateHomeFeedBundle — 구조·필수·문자열', () => {
  it('필수 항목이 없으면 항목마다 사유를 모두 알린다', () => {
    const errors = errorsFor((raw) => {
      delete raw.card.title;
      delete raw.card.template_type;
      delete raw.card.starts_at;
      delete raw.card.ends_at;
      delete raw.card.exposure_tags;
      delete raw.world_review.reason;
      delete raw.image.seed;
    });
    for (const field of ['card.title', 'card.template_type', 'card.starts_at', 'card.ends_at', 'card.exposure_tags', 'world_review.reason', 'image.seed']) {
      expect(errors).toContain(`${field}: 필수 항목이 없어요.`);
    }
  });

  it('알 수 없는 필드는 최상위·card·image 어디서든 거절한다(cover_image_url·image_source·created_by 포함)', () => {
    const errors = errorsFor((raw) => {
      raw.extra = 1;
      raw.card.cover_image_url = 'https://x.test/a.webp';
      raw.card.image_source = 'agent-generator';
      raw.card.created_by = 'someone';
      raw.image.width = 400;
    });
    expect(errors.join('\n')).toContain('알 수 없는 최상위 필드예요 — extra');
    expect(errors.join('\n')).toContain('묶음이 지원하지 않는 필드예요 — cover_image_url, image_source, created_by');
    expect(errors.join('\n')).toContain('image: 알 수 없는 필드예요 — width');
  });

  it('최상위가 객체가 아니면 그 사유 하나만 낸다', () => {
    expect(validate([]).errors).toEqual(['묶음 파일의 최상위는 객체여야 해요.']);
  });

  it('작성자·제목·부제·지역·검수 사유에 줄바꿈이나 제어 문자가 있으면 거절한다', () => {
    const errors = errorsFor((raw) => {
      raw.author = '윤진\n; DROP TABLE today_cards; --';
      raw.card.title = '제목\r\n다음 줄';
      raw.card.subtitle = '부제\u2028줄';
      raw.card.template_type = 'location_trend';
      raw.card.region_label = '성수동\t';
      raw.card.body_markdown = undefined;
      raw.world_review.reason = '사유\n줄';
    });
    for (const label of ['author', 'card.title', 'card.subtitle', 'card.region_label', 'world_review.reason']) {
      expect(errors).toContain(`${label}: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`);
    }
  });

  it('본문은 줄바꿈·탭을 허용하고 다른 제어 문자만 거절한다', () => {
    expect(errorsFor((raw) => (raw.card.body_markdown = '첫 줄\n\n둘째 줄\t끝'))).toEqual([]);
    expect(errorsFor((raw) => (raw.card.body_markdown = '본문\u0000'))).toContain('card.body_markdown: 줄바꿈·탭 말고 다른 제어 문자는 쓸 수 없어요.');
  });

  it('공백뿐인 제목은 거절한다', () => {
    expect(errorsFor((raw) => (raw.card.title = '   '))).toContain('card.title: 비어 있지 않은 문자열이어야 해요.');
  });

  it('bundle_id·created_at·color_rationale_link 형식을 확인한다', () => {
    const errors = errorsFor((raw) => {
      raw.bundle_id = 'Bad_ID';
      raw.created_at = '2026-09-25 10:30';
      raw.color_rationale_link = '아무 데나';
    });
    expect(errors.join('\n')).toContain('bundle_id: 영문 소문자·숫자와 하이픈만');
    expect(errors.join('\n')).toContain('created_at: 시간대가 붙은 ISO 8601 형식이어야 해요');
    expect(errors.join('\n')).toContain('color_rationale_link: http(s) 주소이거나 저장소 상대 경로');
  });
});

describe('validateHomeFeedBundle — 세계관 검수', () => {
  it('world_review 객체·불리언·필수 항목을 확인한다', () => {
    expect(errorsFor((raw) => (raw.world_review = 'x' as unknown as Record<string, unknown>))).toContain('world_review: 객체여야 해요.');
    expect(errorsFor((raw) => (raw.world_review.world_related = 'yes'))).toContain('world_review.world_related: true 또는 false여야 해요(받은 값: "yes").');
    expect(errorsFor((raw) => (raw.world_review = undefined as unknown as Record<string, unknown>))).toContain('world_review: 필수 항목이 없어요.');
  });

  it('세계관 내용이 있는데 윈터 검수를 안 했으면 거절한다', () => {
    expect(
      errorsFor((raw) => {
        raw.world_review.world_related = true;
        raw.world_review.winter_reviewed = false;
      })
    ).toContain('world_review.winter_reviewed: 세계관과 닿는 카드(world_related=true)는 윈터 검수를 거쳐야 해서 true여야 해요.');
  });
});

describe('validateHomeFeedBundle — 카드 규칙(허용값·템플릿·기간)', () => {
  it('템플릿·노출 형태·컨텐츠 유형은 허용 목록 밖이면 거절한다', () => {
    const errors = errorsFor((raw) => {
      raw.card.template_type = 'weekly_recap';
      raw.card.layout_type = 'giant';
      raw.card.content_type_id = 'T18';
    });
    expect(errors.join('\n')).toContain('card.template_type: badge_spotlight · ');
    expect(errors.join('\n')).toContain('(받은 값: "weekly_recap")');
    expect(errors.join('\n')).toContain('card.layout_type: large_thumbnail · ');
    expect(errors.join('\n')).toContain('card.content_type_id: T01~T17 중 하나여야 해요(받은 값: "T18")');
  });

  it('노출 태그는 1개 이상이고 허용 목록 안의 값이며 중복이 없어야 한다', () => {
    expect(errorsFor((raw) => (raw.card.exposure_tags = []))).toContain('card.exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).');
    expect(errorsFor((raw) => (raw.card.exposure_tags = 'all'))).toContain('card.exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).');
    expect(errorsFor((raw) => (raw.card.exposure_tags = ['all', 'sunny'])).join('\n')).toContain('card.exposure_tags: 허용하지 않는 태그예요 — "sunny"');
    expect(errorsFor((raw) => (raw.card.exposure_tags = ['all', 'all']))).toContain('card.exposure_tags: 같은 태그를 두 번 넣을 수 없어요.');
    expect(errorsFor((raw) => (raw.card.exposure_tags = ['time_morning', 'weather_clear']))).toEqual([]);
  });

  it('템플릿이 쓰지 않는 참조 필드는 조용히 버려지지 않게 거절한다', () => {
    const errors = errorsFor((raw) => {
      raw.card.template_type = 'drop_alert';
      raw.card.mission_id = MISSION_ID;
      raw.card.badge_ids = [BADGE_ID];
    });
    expect(errors).toContain('card.mission_id: drop_alert 템플릿은 이 필드를 쓰지 않아요(어드민 폼도 저장할 때 비워요). 묶음에서 빼 주세요.');
    expect(errors).toContain('card.badge_ids: drop_alert 템플릿은 이 필드를 쓰지 않아요(어드민 폼도 저장할 때 비워요). 묶음에서 빼 주세요.');
    // 비어 있는 배열은 «채우지 않은 것»이라 거절하지 않는다.
    expect(
      errorsFor((raw) => {
        raw.card.template_type = 'drop_alert';
        raw.card.badge_ids = [];
        delete raw.card.body_markdown;
      }).join('\n')
    ).not.toContain('이 필드를 쓰지 않아요');
  });

  it('템플릿마다 꼭 있어야 하는 참조가 없으면 거절한다', () => {
    const cases: [string, string][] = [
      ['badge_spotlight', 'card.badge_ids: badge_spotlight 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
      ['progress_nudge', 'card.badge_ids 또는 card.mission_id: progress_nudge 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
      ['mission_spotlight', 'card.mission_id: mission_spotlight 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
      ['itembook_milestone', 'card.item_book_id: itembook_milestone 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
      ['location_trend', 'card.region_label: location_trend 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
      ['ranking_board', 'card.ranking_mode_id: ranking_board 템플릿은 이 참조가 있어야 카드가 의미가 있어요.'],
    ];
    for (const [template, message] of cases) {
      expect(errorsFor((raw) => {
        raw.card.template_type = template;
        delete raw.card.body_markdown;
      })).toContain(message);
    }
    expect(errorsFor((raw) => delete raw.card.body_markdown)).toContain('card.body_markdown: editorial_article 템플릿은 이 참조가 있어야 카드가 의미가 있어요.');
  });

  it('참조 필드의 UUID·배열 형식을 확인한다', () => {
    const errors = errorsFor((raw) => {
      raw.card.template_type = 'progress_nudge';
      raw.card.mission_id = 'not-a-uuid';
      raw.card.badge_ids = [BADGE_ID, BADGE_ID.toUpperCase()];
      raw.card.body_markdown = undefined;
    });
    expect(errors).toContain('card.mission_id: UUID 형식이어야 해요(받은 값: "not-a-uuid").');
    expect(errors).toContain('card.badge_ids: 같은 배지를 두 번 넣을 수 없어요.');
    expect(errorsFor((raw) => {
      raw.card.template_type = 'badge_spotlight';
      raw.card.badge_ids = ['x'];
      raw.card.body_markdown = undefined;
    })).toContain('card.badge_ids: 배지 ID(UUID) 문자열의 배열이어야 해요.');
  });

  it('이동 경로는 앱 안 경로(/…)나 https 주소만 허용한다', () => {
    for (const bad of ['missions', '//evil.test', 'http://x.test', 'javascript:alert(1)', '/a b']) {
      expect(errorsFor((raw) => (raw.card.target_href = bad)).join('\n')).toContain('card.target_href: 앱 안 경로');
    }
    for (const good of ['/missions/abc', 'https://j-a-m.app/missions']) {
      expect(errorsFor((raw) => (raw.card.target_href = good))).toEqual([]);
    }
  });

  it('기간은 시간대가 붙은 ISO 형식이고 시작이 종료보다 앞이어야 한다', () => {
    expect(errorsFor((raw) => (raw.card.starts_at = '2099-01-01'))).toContain('card.starts_at: 시간대가 붙은 ISO 8601 형식이어야 해요(예: 2026-10-01T00:00:00+09:00).');
    expect(errorsFor((raw) => (raw.card.ends_at = '2098-12-31T00:00:00+09:00'))).toContain('card.starts_at: ends_at보다 앞이어야 해요.');
    expect(errorsFor((raw) => (raw.card.ends_at = raw.card.starts_at))).toContain('card.starts_at: ends_at보다 앞이어야 해요.');
  });

  it('정렬 순서는 정수, 활성 여부는 불리언이어야 한다', () => {
    expect(errorsFor((raw) => (raw.card.sort_order = 1.5))).toContain('card.sort_order: 정수여야 해요(받은 값: 1.5).');
    expect(errorsFor((raw) => (raw.card.is_active = 'false'))).toContain('card.is_active: true 또는 false여야 해요(받은 값: "false").');
    expect(errorsFor((raw) => (raw.card.sort_order = -3))).toEqual([]);
  });
});

describe('validateHomeFeedBundle — 이미지', () => {
  it('이미지가 없거나 PNG가 아니거나 비어 있으면 거절한다', () => {
    expect(errorsFor((raw) => (raw.image.path = 'nope.png'))[0]).toContain('image.path: 이미지 파일을 찾을 수 없어요');
    fs.writeFileSync(path.join(workDir, 'fake.png'), 'not a png');
    fs.writeFileSync(path.join(workDir, 'empty.png'), '');
    expect(errorsFor((raw) => (raw.image.path = 'fake.png'))[0]).toContain('image.path: PNG 파일이 아니에요');
    expect(errorsFor((raw) => (raw.image.path = 'empty.png'))[0]).toContain('image.path: 이미지 파일이 비어 있어요');
  });

  it('5MB를 넘는 이미지는 거절한다', () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big);
    fs.writeFileSync(path.join(workDir, 'big.png'), big);
    expect(errorsFor((raw) => (raw.image.path = 'big.png'))[0]).toContain('이미지가 너무 커요');
  });

  it('시드·프리셋·색 형식을 확인한다', () => {
    const errors = errorsFor((raw) => {
      raw.image.seed = 1.5;
      raw.image.preset_id = 'abc';
      raw.image.bg_color = 'red';
      raw.image.end_color = '#12345';
    });
    expect(errors.join('\n')).toContain('image.seed: 정수여야 해요');
    expect(errors.join('\n')).toContain('image.preset_id: 프리셋 ID(UUID) 형식이 아니에요');
    expect(errors.join('\n')).toContain('image.bg_color: #rrggbb 형식이어야 해요');
    expect(errors.join('\n')).toContain('image.end_color: #rrggbb 형식이어야 해요');
  });
});

describe('buildTodayCardInsertPayload', () => {
  const ARGS = { id: 'card-id', coverImageUrl: 'https://cdn.test/images/today_cards/asset-generator/card-id.webp?v=1' };

  function payloadOf(mutate: (raw: RawBundle) => void = () => {}) {
    const raw = validRaw();
    mutate(raw);
    return buildTodayCardInsertPayload(raw.card, ARGS);
  }

  it('cover_image_url(image_url이 아니다)과 image_source=agent-generator를 넣고 id를 받는다', () => {
    const payload = payloadOf();
    expect(payload.id).toBe('card-id');
    expect(payload.cover_image_url).toBe(ARGS.coverImageUrl);
    expect(payload.image_source).toBe('agent-generator');
    expect(payload).not.toHaveProperty('image_url');
    expect(payload).not.toHaveProperty('created_by');
  });

  it('묶음의 값을 어드민 폼 저장과 같은 모양으로 옮기고 기간은 UTC ISO로 바꾼다', () => {
    const payload = payloadOf();
    expect(payload).toMatchObject({
      template_type: 'editorial_article',
      layout_type: 'large_thumbnail',
      title: '[TEST] 예시 주간 홈피드 카드',
      subtitle: '묶음 형식을 확인하는 예시예요',
      badge_ids: [],
      mission_id: null,
      item_book_id: null,
      region_label: null,
      ranking_mode_id: null,
      content_type_id: 'T12',
      target_href: null,
      exposure_tags: ['all'],
      starts_at: '2098-12-31T15:00:00.000Z',
      ends_at: '2099-01-07T15:00:00.000Z',
      sort_order: 0,
      is_active: false,
    });
    expect(payload.body_markdown).toContain('\n\n');
  });

  it('생략한 값은 기본값이다: 노출 형태는 템플릿 추천값, 정렬 0, 활성 true, 나머지 null·[]', () => {
    const payload = payloadOf((raw) => {
      raw.card = {
        title: '  드랍 알림  ',
        template_type: 'drop_alert',
        exposure_tags: ['all'],
        starts_at: '2026-10-05T00:00:00+09:00',
        ends_at: '2026-10-12T00:00:00+09:00',
      };
    });
    expect(payload).toMatchObject({
      title: '드랍 알림',
      layout_type: SUGGESTED_LAYOUT_FOR.drop_alert,
      subtitle: null,
      body_markdown: null,
      content_type_id: null,
      sort_order: 0,
      is_active: true,
      badge_ids: [],
    });
  });

  it('생성 타입 컬럼 대조: today_cards Insert 컬럼 중 DB 기본값에 맡기는 created_at·created_by를 뺀 전부를 채운다', () => {
    const source = fs.readFileSync(GENERATED_TYPES_FILE, 'utf8');
    const table = source.slice(source.indexOf('      today_cards: {'));
    const insert = table.slice(table.indexOf('Insert: {'), table.indexOf('Update: {'));
    const columns = [...insert.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(columns.length).toBeGreaterThan(15);
    const expected = columns.filter((c) => !['created_at', 'created_by'].includes(c)).sort();
    expect(Object.keys(payloadOf()).sort()).toEqual(expected);
  });
});
