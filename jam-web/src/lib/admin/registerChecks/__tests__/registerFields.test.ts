/**
 * 카드·미션 순수 검사와 페이로드(티켓 20261002_1027) — 서버가 가져다 쓸 TS 모듈(`homeFeedFields.ts`·`missionFields.ts`·
 * `bundleRules.ts`)과, 그 모듈을 감싸는 스크립트(`registerHomeFeedBundle.mjs`·`registerMissionBundle.mjs`)가 같은 결과를 내는지 본다.
 * 오류 문장 하나하나는 `scripts/asset-generator/__tests__/register*Bundle.test.ts`가 시험한다. 여기서는 «래퍼가 TS 함수와 어긋나지
 * 않는다», «선택 인자를 주면 그 값이 들어간다», «선택 인자를 안 주면 옮기기 전 값이다», «키 집합이 그대로다»를 본다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENT_IMAGE_SOURCE as BUNDLE_AGENT_IMAGE_SOURCE,
  CONTROL_OR_LINE_BREAK as BUNDLE_CONTROL_OR_LINE_BREAK,
  UUID_PATTERN as BUNDLE_UUID_PATTERN,
} from '../../../../../scripts/asset-generator/registerBundle.mjs'
import * as homeFeedScript from '../../../../../scripts/asset-generator/registerHomeFeedBundle.mjs'
import * as missionScript from '../../../../../scripts/asset-generator/registerMissionBundle.mjs'
import { AGENT_IMAGE_SOURCE, CONTROL_OR_LINE_BREAK, UUID_PATTERN } from '../bundleRules'
import * as homeFeedFields from '../homeFeedFields'
import type { HomeFeedCardInput } from '../homeFeedFields'
import * as missionFields from '../missionFields'
import type { MissionInput } from '../missionFields'

const FIXTURE_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', 'scripts', 'asset-generator', '__fixtures__')
const HOME_FEED_BUNDLE_FILE = path.join(FIXTURE_ROOT, 'example-home-feed-bundle', 'bundle.json')
const MISSION_BUNDLE_FILE = path.join(FIXTURE_ROOT, 'example-mission-bundle', 'bundle.json')

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const COVER_URL = 'https://example.test/cards/cover.webp?v=1'
const MISSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const IMAGE_URL = 'https://example.test/missions/image.webp?v=1'

type Raw = Record<string, unknown>

function readBundle(file: string): Raw {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const exampleCard = (): Raw => readBundle(HOME_FEED_BUNDLE_FILE).card as Raw
const exampleMission = (): Raw => readBundle(MISSION_BUNDLE_FILE).mission as Raw

describe('bundleRules — 스크립트가 같은 값을 쓴다', () => {
  it('registerBundle.mjs가 내보내는 세 상수는 bundleRules의 값 그대로다', () => {
    expect(BUNDLE_AGENT_IMAGE_SOURCE).toBe(AGENT_IMAGE_SOURCE)
    expect(BUNDLE_UUID_PATTERN).toBe(UUID_PATTERN)
    expect(BUNDLE_CONTROL_OR_LINE_BREAK).toBe(CONTROL_OR_LINE_BREAK)
    expect(AGENT_IMAGE_SOURCE).toBe('agent-generator')
  })

  it('미션·홈피드 묶음도 같은 UUID 정규식·이미지 출처를 다시 내보낸다', () => {
    expect(homeFeedScript.UUID_PATTERN).toBe(UUID_PATTERN)
    expect(missionScript.UUID_PATTERN).toBe(UUID_PATTERN)
    expect(homeFeedScript.AGENT_IMAGE_SOURCE).toBe(AGENT_IMAGE_SOURCE)
    expect(missionScript.AGENT_IMAGE_SOURCE).toBe(AGENT_IMAGE_SOURCE)
  })

  it('개행·제어 문자 정규식은 줄 구분 문자와 유니코드 줄 구분자를 잡는다', () => {
    for (const value of ['a\nb', 'a\rb', 'a\tb', 'a\u0085b', 'a\u2028b', 'a\u2029b', 'a\u007fb']) {
      expect(CONTROL_OR_LINE_BREAK.test(value), JSON.stringify(value)).toBe(true)
    }
    expect(CONTROL_OR_LINE_BREAK.test('한 줄 제목 abc')).toBe(false)
  })
})

describe('홈피드 카드 — 상수 재수출과 검사 결과', () => {
  it('스크립트가 내보내는 카드 상수는 homeFeedFields의 값 그대로다', () => {
    for (const name of [
      'CARD_REQUIRED_FIELDS',
      'CARD_OPTIONAL_FIELDS',
      'TEMPLATE_TYPES',
      'LAYOUT_TYPES',
      'EXPOSURE_TAGS',
      'CONTENT_TYPE_IDS',
      'TEMPLATE_FIELD_KEY',
      'REQUIRED_REFERENCE_FIELDS',
    ] as const) {
      expect(homeFeedScript[name], name).toBe(homeFeedFields[name])
    }
  })

  const cards: [string, unknown][] = [
    ['예시 카드', exampleCard()],
    [
      '값을 많이 채운 미션 카드',
      {
        title: '  주말 미션  ',
        subtitle: '부제',
        description: '게재용 설명문',
        template_type: 'mission_spotlight',
        mission_id: UUID_A,
        content_type_id: 'T01',
        target_href: '/missions/weekend',
        exposure_tags: ['all'],
        starts_at: '2099-01-01T00:00:00+09:00',
        ends_at: '2099-01-08T00:00:00+09:00',
        sort_order: 3,
        is_active: true,
      },
    ],
    ['객체가 아님(배열)', []],
    ['객체가 아님(문자열)', 'text'],
    ['빈 객체', {}],
    ['모르는 필드와 잘못된 분류', { ...exampleCard(), pattern_no: 1, template_type: 'nope', layout_type: 'nope' }],
    ['미션 카드가 큰 썸네일이 아님', { ...exampleCard(), template_type: 'mission_spotlight', mission_id: UUID_A, layout_type: 'banner', body_markdown: undefined }],
    ['템플릿이 쓰지 않는 필드', { ...exampleCard(), badge_ids: [UUID_A] }],
    ['참조 형식과 중복', { ...exampleCard(), template_type: 'progress_nudge', layout_type: undefined, badge_ids: [UUID_A, UUID_A.toUpperCase()], mission_id: 'x' }],
    ['잘못된 태그·기간·정렬', { ...exampleCard(), exposure_tags: ['all', 'all', 'zzz'], starts_at: '2099-01-08T00:00:00+09:00', ends_at: '2099-01-01T00:00:00+09:00', sort_order: 1.5, is_active: 'yes' }],
    ['줄바꿈이 섞인 제목과 긴 설명', { ...exampleCard(), title: '두\n줄', description: 'ㅇ'.repeat(41), target_href: '//evil.test' }],
  ]

  const PASSING_CARDS = new Set(['예시 카드', '값을 많이 채운 미션 카드'])

  it.each(cards)('%s: 묶음 검사가 내는 카드 오류와 validateCard의 오류가 같다', (name, card) => {
    const direct: string[] = []
    homeFeedFields.validateCard(direct, card)

    const raw = { ...readBundle(HOME_FEED_BUNDLE_FILE), card }
    const { errors } = homeFeedScript.validateHomeFeedBundle(raw, { bundleFile: HOME_FEED_BUNDLE_FILE })
    const fromBundle = errors.filter((e: string) => e.startsWith('card.') || e.startsWith('card:'))

    expect(fromBundle).toEqual(direct)
    // 둘 다 빈 목록이라 우연히 같은 것이 아니게 — 통과해야 하는 입력만 오류가 없다.
    expect(direct.length === 0).toBe(PASSING_CARDS.has(name))
  })

  it('예시 카드는 오류가 없고, 객체가 아닌 카드는 한 줄만 쌓는다', () => {
    const ok: string[] = []
    homeFeedFields.validateCard(ok, exampleCard())
    expect(ok).toEqual([])

    const bad: string[] = []
    homeFeedFields.validateCard(bad, 'text')
    expect(bad).toEqual(['card: 객체여야 해요.'])
  })
})

describe('홈피드 카드 페이로드', () => {
  const EXPECTED_KEYS = [
    'id',
    'template_type',
    'layout_type',
    'title',
    'subtitle',
    'description',
    'cover_image_url',
    'badge_ids',
    'mission_id',
    'item_book_id',
    'region_label',
    'body_markdown',
    'ranking_mode_id',
    'recipe_id',
    'content_type_id',
    'target_href',
    'exposure_tags',
    'starts_at',
    'ends_at',
    'sort_order',
    'is_active',
    'image_source',
    'shape',
    'title_in_image',
  ]

  const card = (): HomeFeedCardInput => ({ ...exampleCard(), title: '  제목  ' }) as unknown as HomeFeedCardInput

  it('래퍼와 TS 함수가 같은 값을 낸다', () => {
    const viaScript = homeFeedScript.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL })
    const viaTs = homeFeedFields.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL })
    expect(viaScript).toEqual(viaTs)
  })

  it('선택 인자를 주지 않으면 옮기기 전 값이다(image_source는 agent-generator, shape·title_in_image는 null)', () => {
    const payload = homeFeedFields.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL })
    expect(payload.image_source).toBe('agent-generator')
    expect(payload.shape).toBeNull()
    expect(payload.title_in_image).toBeNull()
    expect(payload.title).toBe('제목')
    expect(payload.cover_image_url).toBe(COVER_URL)
    expect(payload.id).toBe(CARD_ID)
    expect(payload.starts_at).toBe(new Date('2099-01-01T00:00:00+09:00').toISOString())
  })

  it('선택 인자를 주면 그 값이 들어가고, 나머지 값은 그대로다', () => {
    const base = homeFeedFields.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL })
    const custom = homeFeedFields.buildTodayCardInsertPayload(card(), {
      id: CARD_ID,
      coverImageUrl: COVER_URL,
      imageSource: null,
      shape: 'hero',
      titleInImage: true,
    })
    expect(custom.image_source).toBeNull()
    expect(custom.shape).toBe('hero')
    expect(custom.title_in_image).toBe(true)
    expect({ ...custom, image_source: base.image_source, shape: base.shape, title_in_image: base.title_in_image }).toEqual(base)

    const other = homeFeedFields.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL, imageSource: 'ops-tool', titleInImage: false })
    expect(other.image_source).toBe('ops-tool')
    expect(other.shape).toBeNull()
    expect(other.title_in_image).toBe(false)
  })

  it('키 집합이 그대로다(pattern_no 없음)', () => {
    for (const options of [{}, { imageSource: null, shape: 'hero', titleInImage: true }]) {
      const keys = Object.keys(homeFeedFields.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL, ...options }))
      expect(keys).toEqual(EXPECTED_KEYS)
      expect(keys).not.toContain('pattern_no')
    }
    expect(Object.keys(homeFeedScript.buildTodayCardInsertPayload(card(), { id: CARD_ID, coverImageUrl: COVER_URL }))).toEqual(EXPECTED_KEYS)
  })
})

describe('미션 — 상수 재수출과 검사 결과', () => {
  it('스크립트가 내보내는 미션 상수는 missionFields의 값 그대로다', () => {
    for (const name of ['MISSION_REQUIRED_FIELDS', 'MISSION_OPTIONAL_FIELDS', 'STATUS_DISPLAY_TYPES', 'EXPOSURE_MODES'] as const) {
      expect(missionScript[name], name).toBe(missionFields[name])
    }
  })

  const missions: [string, unknown][] = [
    ['예시 미션', exampleMission()],
    [
      '선택 필드를 채운 미션',
      {
        ...exampleMission(),
        reward_badge_ids: [UUID_A, UUID_B],
        visible_rank_count: 5,
        max_completions: 2,
        exposure_mode: 'scheduled',
        exposure_at: '2026-10-02T00:00:00+09:00',
      },
    ],
    ['객체가 아님(배열)', []],
    ['객체가 아님(문자열)', 'text'],
    ['빈 객체', {}],
    ['모르는 필드와 잘못된 유형', { ...exampleMission(), pattern_no: 1, mission_type: 'nope' }],
    ['조건이 객체가 아님', { ...exampleMission(), condition_json: [] }],
    ['조건 값이 이상함', { ...exampleMission(), condition_json: { activity_type: 'running', distance_km: -5 } }],
    ['제목 줄바꿈과 빈 설명', { ...exampleMission(), title: '두\n줄', description: '  ' }],
    ['예약 노출인데 시각이 없음', { ...exampleMission(), exposure_mode: 'scheduled' }],
    ['예약이 아닌데 시각이 있음', { ...exampleMission(), exposure_at: '2026-10-02T00:00:00+09:00' }],
    ['잘못된 표시 유형·횟수·보상', { ...exampleMission(), status_display_type: 'nope', visible_rank_count: 0, max_completions: 1.5, reward_points: -1 }],
    ['보상 배지 중복·형식', { ...exampleMission(), reward_badge_ids: [UUID_A, UUID_A.toUpperCase()] }],
    ['잘못된 기간', { ...exampleMission(), starts_at: '2026-10-10T00:00:00+09:00', ends_at: '2026-10-03T00:00:00+09:00' }],
    ['게이트 필드 어긋남', { ...exampleMission(), gate_axis: 'nope', gate_stage: 'nope' }],
  ]

  const PASSING_MISSIONS = new Set(['예시 미션', '선택 필드를 채운 미션'])

  it.each(missions)('%s: 묶음 검사가 내는 미션 오류·주의와 validateMission의 결과가 같다', (name, mission) => {
    const directErrors: string[] = []
    const directWarnings: string[] = []
    missionFields.validateMission(directErrors, directWarnings, mission)

    const raw = { ...readBundle(MISSION_BUNDLE_FILE), mission }
    const { errors, warnings } = missionScript.validateMissionBundle(raw, { bundleFile: MISSION_BUNDLE_FILE })
    const isMissionMessage = (e: string) => e.startsWith('mission.') || e.startsWith('mission:')

    expect(errors.filter(isMissionMessage)).toEqual(directErrors)
    expect(warnings.filter(isMissionMessage)).toEqual(directWarnings)
    // 둘 다 빈 목록이라 우연히 같은 것이 아니게 — 통과해야 하는 입력만 오류가 없다.
    expect(directErrors.length === 0).toBe(PASSING_MISSIONS.has(name))
  })

  it('예시 미션은 오류·주의가 없고, 객체가 아닌 미션은 한 줄만 쌓는다', () => {
    const errors: string[] = []
    const warnings: string[] = []
    missionFields.validateMission(errors, warnings, exampleMission())
    expect([errors, warnings]).toEqual([[], []])

    const badErrors: string[] = []
    missionFields.validateMission(badErrors, [], 7)
    expect(badErrors).toEqual(['mission: 객체여야 해요.'])
  })

  it('collectCheck는 오류·주의를 접두어와 함께 각 목록에 옮긴다', () => {
    const errors: string[] = []
    const warnings: string[] = []
    missionFields.collectCheck(errors, warnings, 'mission.condition_json: ', { error: 'E', warning: 'W' })
    missionFields.collectCheck(errors, warnings, 'mission.condition_json: ', { error: null, warning: null })
    expect(errors).toEqual(['mission.condition_json: E'])
    expect(warnings).toEqual(['mission.condition_json: W'])
  })
})

describe('미션 페이로드', () => {
  const EXPECTED_KEYS = [
    'id',
    'title',
    'description',
    'mission_type',
    'condition_json',
    'condition_text',
    'reward_type',
    'reward_id',
    'reward_points',
    'reward_badge_ids',
    'status_display_type',
    'visible_rank_count',
    'starts_at',
    'ends_at',
    'max_completions',
    'image_url',
    'image_source',
    'gated_badge_id',
    'gate_axis',
    'gate_stage',
    'visibility_rule_json',
    'exposure_mode',
    'exposure_at',
  ]

  const mission = (): MissionInput => exampleMission() as unknown as MissionInput

  it('래퍼와 TS 함수가 같은 값을 낸다', () => {
    const viaScript = missionScript.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL })
    const viaTs = missionFields.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL })
    expect(viaScript).toEqual(viaTs)
  })

  it('선택 인자를 주지 않으면 옮기기 전 값이다(image_source는 agent-generator, condition_text는 null)', () => {
    const payload = missionFields.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL })
    expect(payload.image_source).toBe('agent-generator')
    expect(payload.condition_text).toBeNull()
    expect(payload.id).toBe(MISSION_ID)
    expect(payload.image_url).toBe(IMAGE_URL)
    expect(payload.reward_badge_ids).toEqual([])
    expect(payload.reward_type).toBeNull()
    expect(payload.reward_id).toBeNull()
    expect(payload.gated_badge_id).toBeNull()
  })

  it('선택 인자를 주면 그 값이 들어가고, 나머지 값은 그대로다', () => {
    const base = missionFields.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL })
    const custom = missionFields.buildMissionInsertPayload(mission(), {
      id: MISSION_ID,
      imageUrl: IMAGE_URL,
      imageSource: null,
      conditionText: '30km를 달려요',
    })
    expect(custom.image_source).toBeNull()
    expect(custom.condition_text).toBe('30km를 달려요')
    expect({ ...custom, image_source: base.image_source, condition_text: base.condition_text }).toEqual(base)

    const other = missionFields.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL, imageSource: 'ops-tool' })
    expect(other.image_source).toBe('ops-tool')
    expect(other.condition_text).toBeNull()
  })

  it('키 집합이 그대로다', () => {
    for (const options of [{}, { imageSource: null, conditionText: '문장' }]) {
      const keys = Object.keys(missionFields.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL, ...options }))
      expect(keys).toEqual(EXPECTED_KEYS)
    }
    expect(Object.keys(missionScript.buildMissionInsertPayload(mission(), { id: MISSION_ID, imageUrl: IMAGE_URL }))).toEqual(EXPECTED_KEYS)
  })
})
