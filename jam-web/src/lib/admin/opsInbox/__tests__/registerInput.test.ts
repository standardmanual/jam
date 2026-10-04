/**
 * 운영 항목 → 카드·미션·JAM! 배지·레시피·드랍 예약 등록 형식 변환 (티켓 20261002_1028, 상위 20260930_1500 ②-2b. 레시피는 티켓 20261002_2221 ⑧-a, 드랍 예약은 티켓 20261002_2306 ⑧-b, JAM! 배지는 티켓 20261004_1756 ⑨-a)
 *
 * 규칙은 `docs/specs/prd/ops-tool/PRD.md` §8.4와 티켓의 「착수 전에 정한 것」 1~8이다.
 * 오류 문장 하나하나는 등록 스크립트 테스트(`scripts/asset-generator/__tests__/`)가 시험한다. 여기서는 «항목에서 읽는 자리»,
 * «경로 매핑», «결정 1~8»을 본다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Json } from '@/types/database.generated'
import { SUGGESTED_LAYOUT_FOR } from '@/lib/admin/today-sections'
import { buildMissionInsertPayload } from '@/lib/admin/registerChecks/missionFields'
import type { MissionInput } from '@/lib/admin/registerChecks/missionFields'
import { buildTodayCardInsertPayload } from '@/lib/admin/registerChecks/homeFeedFields'
import type { HomeFeedCardInput } from '@/lib/admin/registerChecks/homeFeedFields'
import { CARD_SHAPES, CARD_TITLE_MAX_LENGTH } from '@/lib/today/shape'
import { buildBadgeInsertPayload } from '@/lib/admin/badge-insert-payload'
import {
  JAM_BADGE_RECIPE_LINK_FIELD,
  toDropScheduleRegisterInput,
  toJamBadgeRegisterInput,
  toMissionRegisterInput,
  toRecipeRegisterInput,
  toTodayCardRegisterInput,
  withoutLinkedFields,
  withoutSavePrefix,
} from '@/lib/admin/opsInbox/registerInput'
import type { OpsRegisterItem, RegisterInputIssue } from '@/lib/admin/opsInbox/registerInput'

const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const BADGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const MISSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ACTOR_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UUID_C = 'cccccccc-1111-4ccc-8ccc-cccccccccccc'

const GENERATED_TYPES_FILE = path.join(__dirname, '..', '..', '..', '..', 'types', 'database.generated.ts')
const MODULE_FILE = path.join(__dirname, '..', 'registerInput.ts')

type Raw = Record<string, unknown>

/** 운영 항목 한 건. `original`이 제출 원본, `extra`가 수정본·행 칸이다. */
function opsItem(
  kind: string | null,
  original: Raw,
  extra: { edited?: Raw | null; starts_at?: string | null; ends_at?: string | null; pattern_no?: string | null } = {}
): OpsRegisterItem {
  return {
    kind,
    original: original as unknown as Json,
    edited: (extra.edited ?? null) as unknown as Json | null,
    starts_at: extra.starts_at ?? null,
    ends_at: extra.ends_at ?? null,
    pattern_no: extra.pattern_no ?? null,
  }
}

/** 검사를 통과하는 카드 항목. 칸은 `over`로 덮는다. */
function cardOriginal(over: Raw = {}): Raw {
  return {
    starts_at: '2026-10-06T09:00:00+09:00',
    shape: 'hero',
    exposure_tags: ['all'],
    copy: { title: '가을 아침 러닝' },
    resource: { template_type: 'drop_alert' },
    ...over,
  }
}

const cardItem = (over: Raw = {}, extra: Parameters<typeof opsItem>[2] = {}) => opsItem('home_feed_card', cardOriginal(over), extra)

/** 검사를 통과하는 미션 항목. */
function missionOriginal(over: Raw = {}): Raw {
  return {
    starts_at: '2026-10-06T00:00:00+09:00',
    copy: { title: '[TEST] 주말 러닝', description: '주말에 30km를 달려요.' },
    resource: { mission_type: 'distance', condition_json: { activity_type: 'running', distance_km: 30 } },
    ...over,
  }
}

const missionItem = (over: Raw = {}, extra: Parameters<typeof opsItem>[2] = {}) => opsItem('mission', missionOriginal(over), extra)

/** 검사를 통과하는 레시피 항목. */
function recipeOriginal(over: Raw = {}): Raw {
  return {
    starts_at: '2026-10-06T09:00:00+09:00',
    copy: { name: '[TEST] 가을 믹스' },
    resource: {
      slots: [
        { badge_type: 'item', allowed_badge_ids: [UUID_A] },
        { badge_type: 'activity', allowed_badge_ids: [UUID_B] },
      ],
      reward_points: 10,
    },
    ...over,
  }
}

const recipeItem = (over: Raw = {}, extra: Parameters<typeof opsItem>[2] = {}) => opsItem('recipe', recipeOriginal(over), extra)

/** 검사를 통과하는 JAM! 배지 항목(믹스 성공 1회, 등급형). */
function badgeOriginal(over: Raw = {}): Raw {
  return {
    starts_at: '2026-10-06T09:00:00+09:00',
    copy: { name: '[TEST] 첫 믹스', description: '믹스에 처음 성공했어요.' },
    resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', point_reward: 10 },
    ...over,
  }
}

const badgeItem = (over: Raw = {}, extra: Parameters<typeof opsItem>[2] = {}) => opsItem('jam_badge', badgeOriginal(over), extra)

function toBadge(item: OpsRegisterItem, linkedIds?: Parameters<typeof toJamBadgeRegisterInput>[1]['linkedIds']) {
  return toJamBadgeRegisterInput(item, { id: BADGE_ID, linkedIds })
}

/** 검사를 통과하는 드랍 예약 항목(지점 직접 × 컬렉션). */
function dropOriginal(over: Raw = {}): Raw {
  return {
    starts_at: '2026-10-06T09:00:00+09:00',
    copy: { title: '[TEST] 가을 아침 드랍' },
    resource: { poi_ids: [UUID_A], per_poi_count: 2, collection_ids: [UUID_B] },
    ...over,
  }
}

const dropItem = (over: Raw = {}, extra: Parameters<typeof opsItem>[2] = {}) => opsItem('drop_schedule', dropOriginal(over), extra)

const paths = (issues: RegisterInputIssue[]) => issues.map((issue) => issue.path)

function toCard(item: OpsRegisterItem, linkedIds?: Parameters<typeof toTodayCardRegisterInput>[1]['linkedIds']) {
  return toTodayCardRegisterInput(item, { id: CARD_ID, actorId: ACTOR_ID, linkedIds })
}

function toMission(item: OpsRegisterItem, linkedIds?: Parameters<typeof toMissionRegisterInput>[1]['linkedIds']) {
  return toMissionRegisterInput(item, { id: MISSION_ID, linkedIds })
}

describe('toTodayCardRegisterInput · 읽는 자리', () => {
  it('검사를 통과하면 오류·경고 없이 insert 값을 돌려준다', () => {
    const result = toCard(cardItem())
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.linkFields).toEqual([])
    expect(result.payload).toMatchObject({
      id: CARD_ID,
      template_type: 'drop_alert',
      layout_type: SUGGESTED_LAYOUT_FOR.drop_alert,
      title: '가을 아침 러닝',
      exposure_tags: ['all'],
      starts_at: '2026-10-06T00:00:00.000Z',
      shape: 'hero',
      is_active: true,
      sort_order: 0,
    })
  })

  it('수정본에 값이 있으면 수정본을 먼저 읽는다', () => {
    const result = toCard(
      cardItem(
        {},
        {
          edited: {
            shape: 'brief',
            copy: { title: '고친 제목', subtitle: '고친 부제' },
            resource: { template_type: 'drop_alert', sort_order: 3 },
          },
        }
      )
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ shape: 'brief', title: '고친 제목', subtitle: '고친 부제', sort_order: 3 })
  })

  it('수정본은 값이 있는 칸만 덮는다 — copy를 고쳤어도 수정본에 없는 공통 칸은 제출 원본에서 읽는다', () => {
    const result = toCard(cardItem({}, { edited: { copy: { title: '고친 제목' } } }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ title: '고친 제목', template_type: 'drop_alert', shape: 'hero' })
  })

  it('공통 칸이 먼저다 — resource에 같은 칸이 있으면 공통 칸을 쓰고 경고한다', () => {
    const result = toCard(
      cardItem({
        resource: {
          template_type: 'drop_alert',
          shape: 'poster',
          exposure_tags: ['weather_rain'],
          starts_at: '2027-01-01T00:00:00+09:00',
          ends_at: '2027-01-02T00:00:00+09:00',
          pattern_no: 'P99',
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ shape: 'hero', exposure_tags: ['all'], starts_at: '2026-10-06T00:00:00.000Z', pattern_no: null })
    expect(paths(result.warnings).sort()).toEqual(
      ['resource.ends_at', 'resource.exposure_tags', 'resource.pattern_no', 'resource.shape', 'resource.starts_at'].sort()
    )
  })

  it('글자 칸은 copy를 먼저 읽고, 없으면 resource를 읽는다', () => {
    const result = toCard(
      cardItem({
        copy: { title: '카피 제목' },
        resource: { template_type: 'location_trend', title: '자원 제목', subtitle: '자원 부제', region_label: '한강' },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.payload).toMatchObject({ title: '카피 제목', subtitle: '자원 부제', region_label: '한강' })
  })

  it('글자 칸을 resource에서 읽었다면 오류 경로도 resource다', () => {
    const result = toCard(cardItem({ copy: {}, resource: { template_type: 'drop_alert', title: '   ' } }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'resource.title', message: 'card.title: 비어 있지 않은 문자열이어야 해요.' }])
  })

  it('표에 없는 키는 읽지 않고 경고한다', () => {
    const result = toCard(cardItem({ copy: { title: '제목', headline: '표에 없음' }, resource: { template_type: 'drop_alert', mood: '표에 없음' } }))
    expect(result.errors).toEqual([])
    expect(paths(result.warnings).sort()).toEqual(['copy.headline', 'resource.mood'])
    expect(result.payload).not.toHaveProperty('headline')
    expect(result.payload).not.toHaveProperty('mood')
  })

  it('툴이 정하는 키(id·created_at·created_by·image_source·is_active)는 읽지 않고 경고한다', () => {
    const result = toCard(
      cardItem({
        copy: { title: '제목', id: 'x' },
        resource: {
          template_type: 'drop_alert',
          is_active: false,
          created_by: 'someone',
          created_at: '2020-01-01T00:00:00Z',
          image_source: 'agent-generator',
          id: 'y',
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(paths(result.warnings).sort()).toEqual(
      ['copy.id', 'resource.created_at', 'resource.created_by', 'resource.id', 'resource.image_source', 'resource.is_active'].sort()
    )
    expect(result.payload).toMatchObject({ id: CARD_ID, is_active: true, created_by: ACTOR_ID, image_source: null })
  })

  it('copy·resource가 객체가 아니면 오류다', () => {
    const result = toCard(cardItem({ copy: '문자열', resource: [1] }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(expect.arrayContaining(['copy', 'resource']))
  })

  it('resource 칸(layout_type·content_type_id·target_href·sort_order·description 등)을 payload에 싣는다', () => {
    const result = toCard(
      cardItem({
        copy: { title: '미션 카드', description: '한 줄 설명', subtitle: '부제' },
        resource: {
          template_type: 'mission_spotlight',
          layout_type: 'large_thumbnail',
          mission_id: UUID_A,
          content_type_id: 'T01',
          target_href: '/missions/abc',
          sort_order: 5,
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({
      template_type: 'mission_spotlight',
      layout_type: 'large_thumbnail',
      mission_id: UUID_A,
      content_type_id: 'T01',
      target_href: '/missions/abc',
      sort_order: 5,
      description: '한 줄 설명',
      subtitle: '부제',
    })
  })

  it('kind가 home_feed_card가 아니면 오류다', () => {
    const result = toCard(opsItem('mission', cardOriginal()))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['kind'])
  })
})

describe('toTodayCardRegisterInput · 시각(결정 6)', () => {
  it('종료 시각이 없으면 공개한 날의 끝(23:59:59.999 KST)으로 채운다', () => {
    const result = toCard(cardItem({ starts_at: '2026-10-06T09:00:00+09:00' }))
    expect(result.errors).toEqual([])
    expect(result.payload?.ends_at).toBe('2026-10-06T14:59:59.999Z')
  })

  it('KST 자정을 넘기는 공개 시각은 KST 날짜 기준으로 채운다', () => {
    // 2026-10-06 15:30 UTC = 2026-10-07 00:30 KST → 그날(10-07)의 끝
    const result = toCard(cardItem({ starts_at: '2026-10-06T15:30:00Z' }))
    expect(result.errors).toEqual([])
    expect(result.payload?.ends_at).toBe('2026-10-07T14:59:59.999Z')
    // 2026-10-06 14:59 UTC = 2026-10-06 23:59 KST → 같은 날(10-06)의 끝
    expect(toCard(cardItem({ starts_at: '2026-10-06T14:59:00Z' })).payload?.ends_at).toBe('2026-10-06T14:59:59.999Z')
  })

  it('종료 시각이 있으면 그 값을 쓴다', () => {
    const result = toCard(cardItem({ ends_at: '2026-10-08T00:00:00+09:00' }))
    expect(result.errors).toEqual([])
    expect(result.payload?.ends_at).toBe('2026-10-07T15:00:00.000Z')
  })

  it('항목에 시각이 없으면 행 칸을 읽는다', () => {
    const original = cardOriginal()
    delete original.starts_at
    const result = toCard(opsItem('home_feed_card', original, { starts_at: '2026-10-06T00:00:00+00:00', ends_at: '2026-10-07T00:00:00+00:00' }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ starts_at: '2026-10-06T00:00:00.000Z', ends_at: '2026-10-07T00:00:00.000Z' })
  })

  it('항목 값이 행 칸보다 먼저다', () => {
    const result = toCard(cardItem({ starts_at: '2026-10-06T09:00:00+09:00' }, { starts_at: '2026-10-10T00:00:00+00:00' }))
    expect(result.payload?.starts_at).toBe('2026-10-06T00:00:00.000Z')
  })

  it('공개 시각이 없으면 starts_at 오류 하나만 낸다(종료 시각 「필수」 문장은 겹쳐서 내지 않는다)', () => {
    const original = cardOriginal()
    delete original.starts_at
    const result = toCard(opsItem('home_feed_card', original))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'starts_at', message: 'card.starts_at: 필수 항목이 없어요.' }])
  })

  it('공개 시각 형식이 틀리면 starts_at 오류다', () => {
    const result = toCard(cardItem({ starts_at: '2026-10-06' }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['starts_at'])
    expect(result.errors[0].message).toContain('card.starts_at: 시간대가 붙은 ISO 8601 형식')
  })

  it('공개 시각이 종료 시각보다 늦으면 starts_at 오류다', () => {
    const result = toCard(cardItem({ ends_at: '2026-10-05T00:00:00+09:00' }))
    expect(result.errors).toEqual([{ path: 'starts_at', message: 'card.starts_at: ends_at보다 앞이어야 해요.' }])
  })
})

describe('toTodayCardRegisterInput · pattern_no(결정 5)', () => {
  it('사전 번호 형식이면 payload에 싣는다', () => {
    const result = toCard(cardItem({ pattern_no: 'P12' }))
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.payload?.pattern_no).toBe('P12')
  })

  it('행 칸에 있어도 읽고, 항목 값이 먼저다', () => {
    expect(toCard(cardItem({}, { pattern_no: 'P07' })).payload?.pattern_no).toBe('P07')
    expect(toCard(cardItem({ pattern_no: 'P12' }, { pattern_no: 'P07' })).payload?.pattern_no).toBe('P12')
  })

  it('형식이 아니면 비우고 경고한다', () => {
    for (const value of ['T01', 'P1', 'p12', '12', 7, { n: 1 }]) {
      const result = toCard(cardItem({ pattern_no: value }))
      expect(result.errors, JSON.stringify(value)).toEqual([])
      expect(result.payload?.pattern_no, JSON.stringify(value)).toBeNull()
      expect(paths(result.warnings), JSON.stringify(value)).toEqual(['pattern_no'])
    }
  })

  it('없으면 경고 없이 null이다', () => {
    for (const original of [cardOriginal(), cardOriginal({ pattern_no: '' }), cardOriginal({ pattern_no: null })]) {
      const result = toCard(opsItem('home_feed_card', original))
      expect(result.payload?.pattern_no).toBeNull()
      expect(result.warnings).toEqual([])
    }
  })
})

describe('toTodayCardRegisterInput · 제목 글자 수 경고(G15)', () => {
  it('제목 상한 상수는 모양 5개를 모두 갖는다', () => {
    expect(Object.keys(CARD_TITLE_MAX_LENGTH).sort()).toEqual([...CARD_SHAPES].sort())
    expect(CARD_TITLE_MAX_LENGTH).toEqual({ hero: 22, poster: 18, square: 22, brief: 28, list: 22 })
  })

  for (const shape of CARD_SHAPES) {
    const max = CARD_TITLE_MAX_LENGTH[shape]

    it(`${shape}: ${max}자는 경고가 없고 ${max + 1}자는 경고만 한다(오류 아님)`, () => {
      const atLimit = toCard(cardItem({ shape, copy: { title: '가'.repeat(max) } }))
      expect(atLimit.errors).toEqual([])
      expect(atLimit.warnings).toEqual([])

      const over = toCard(cardItem({ shape, copy: { title: '가'.repeat(max + 1) } }))
      expect(over.errors).toEqual([])
      expect(over.payload).not.toBeNull()
      expect(paths(over.warnings)).toEqual(['copy.title'])
      expect(over.warnings[0].message).toContain(`${max}자`)
    })
  }

  it('앞뒤 공백은 세지 않고, 이모지는 한 글자로 센다', () => {
    expect(toCard(cardItem({ copy: { title: ` ${'가'.repeat(22)} ` } })).warnings).toEqual([])
    expect(toCard(cardItem({ copy: { title: '😀'.repeat(22) } })).warnings).toEqual([])
    expect(paths(toCard(cardItem({ copy: { title: '😀'.repeat(23) } })).warnings)).toEqual(['copy.title'])
  })
})

describe('toTodayCardRegisterInput · 연결 칸(결정 8)', () => {
  it('연결 미션 ID로 mission_id를 채우고 linkFields에 알린다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'mission_spotlight' } }), { mission_id: UUID_A })
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ mission_id: UUID_A })
    expect(result.linkFields).toEqual(['mission_id'])
  })

  it('연결 컬렉션 ID로 item_book_id를 채운다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'itembook_milestone' } }), { item_book_id: UUID_B })
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ item_book_id: UUID_B })
    expect(result.linkFields).toEqual(['item_book_id'])
  })

  it('badge_ids는 resource 값 뒤에 연결 배지를 더한다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'badge_spotlight', badge_ids: [UUID_A] } }), { badge_ids: [UUID_B, UUID_C] })
    expect(result.errors).toEqual([])
    expect(result.payload?.badge_ids).toEqual([UUID_A, UUID_B, UUID_C])
    expect(result.linkFields).toEqual(['badge_ids'])
  })

  it('resource에 badge_ids가 없어도 연결 배지로 채운다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'badge_spotlight' } }), { badge_ids: [UUID_B] })
    expect(result.errors).toEqual([])
    expect(result.payload?.badge_ids).toEqual([UUID_B])
    expect(result.linkFields).toEqual(['badge_ids'])
  })

  it('연결 ID가 없으면 linkFields는 비고 resource 값을 그대로 쓴다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'badge_spotlight', badge_ids: [UUID_A] } }), { badge_ids: [] })
    expect(result.errors).toEqual([])
    expect(result.payload?.badge_ids).toEqual([UUID_A])
    expect(result.linkFields).toEqual([])
  })

  it('단일 칸에 resource 값도 있으면 오류다(연결로 채우는 칸)', () => {
    const missionResult = toCard(cardItem({ resource: { template_type: 'mission_spotlight', mission_id: UUID_B } }), { mission_id: UUID_A })
    expect(missionResult.payload).toBeNull()
    expect(paths(missionResult.errors)).toEqual(['resource.mission_id'])
    expect(missionResult.linkFields).toEqual([])

    const bookResult = toCard(cardItem({ resource: { template_type: 'itembook_milestone', item_book_id: UUID_B } }), { item_book_id: UUID_A })
    expect(bookResult.payload).toBeNull()
    expect(paths(bookResult.errors)).toEqual(['resource.item_book_id'])
  })

  it('템플릿별 필수 참조는 연결 ID(검증용 미리 정한 UUID)로 통과한다', () => {
    const without = toCard(cardItem({ resource: { template_type: 'progress_nudge' } }))
    expect(without.payload).toBeNull()
    expect(paths(without.errors)).toEqual(['resource.badge_ids'])
    expect(without.errors[0].message).toContain('card.badge_ids 또는 card.mission_id')

    const withLink = toCard(cardItem({ resource: { template_type: 'progress_nudge' } }), { mission_id: UUID_A })
    expect(withLink.errors).toEqual([])
  })

  it('템플릿이 쓰지 않는 칸에 연결 ID가 들어오면 검사가 막는다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'drop_alert' } }), { mission_id: UUID_A })
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['resource.mission_id'])
  })
})

describe('toTodayCardRegisterInput · 검사 문장의 경로 매핑(결정 7)', () => {
  it('문장은 그대로 두고 운영 항목 경로를 함께 돌려준다', () => {
    const result = toCard(cardItem({ copy: {}, resource: {} }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: 'copy.title', message: 'card.title: 필수 항목이 없어요.' },
        { path: 'resource.template_type', message: 'card.template_type: 필수 항목이 없어요.' },
      ])
    )
  })

  it('공통 칸 오류는 칸 이름 그대로 경로가 된다', () => {
    const result = toCard(cardItem({ exposure_tags: ['nope'] }))
    expect(paths(result.errors)).toEqual(['exposure_tags'])
    expect(result.errors[0].message).toContain('card.exposure_tags: 허용하지 않는 태그예요')

    const missing = toCard(cardItem({ exposure_tags: undefined }))
    expect(missing.errors).toEqual([{ path: 'exposure_tags', message: 'card.exposure_tags: 필수 항목이 없어요.' }])
  })

  it('shape가 없거나 허용값이 아니면 shape 오류다', () => {
    const missing = toCard(cardItem({ shape: undefined }))
    expect(missing.payload).toBeNull()
    expect(paths(missing.errors)).toEqual(['shape'])
    expect(missing.errors[0].message).toContain('card.shape: 필수 항목이 없어요')

    const wrong = toCard(cardItem({ shape: 'large_thumbnail' }))
    expect(paths(wrong.errors)).toEqual(['shape'])
    expect(wrong.errors[0].message).toContain('card.shape: 허용되지 않는 카드 모양이에요')
  })

  it('resource 칸·copy 칸 오류가 각자의 경로로 나온다', () => {
    const result = toCard(
      cardItem({
        copy: { title: '제목', description: '가'.repeat(41) },
        resource: { template_type: 'mission_spotlight', layout_type: 'banner', mission_id: 'not-a-uuid', sort_order: 1.5 },
      })
    )
    expect(result.payload).toBeNull()
    expect(paths(result.errors).sort()).toEqual(['copy.description', 'resource.layout_type', 'resource.mission_id', 'resource.sort_order'])
  })

  it('이미지가 없어도 오류가 아니다(이미지는 보지 않는다)', () => {
    const result = toCard(cardItem())
    expect(result.errors).toEqual([])
    expect(result.payload?.cover_image_url).toBeNull()
  })

  it('cover_image_url이 문자열이 아니면 오류다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'drop_alert', cover_image_url: 5 } }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['resource.cover_image_url'])
  })

  it('title_in_image가 불리언이 아니면 오류다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'drop_alert', title_in_image: 'yes' } }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['resource.title_in_image'])
  })
})

describe('toTodayCardRegisterInput · 페이로드(결정 1·2)', () => {
  const full = () =>
    toCard(
      cardItem({
        pattern_no: 'P03',
        copy: { title: '전체 칸', subtitle: '부제', description: '설명', region_label: '서울' },
        resource: {
          template_type: 'location_trend',
          cover_image_url: ' https://example.test/cards/cover.webp?v=1 ',
          title_in_image: true,
          content_type_id: 'T02',
        },
      })
    )

  it('image_source는 null이고 created_by는 실행한 관리자 ID다', () => {
    const { payload, errors } = full()
    expect(errors).toEqual([])
    expect(payload).toMatchObject({
      image_source: null,
      created_by: ACTOR_ID,
      cover_image_url: 'https://example.test/cards/cover.webp?v=1',
      title_in_image: true,
      shape: 'hero',
      pattern_no: 'P03',
    })
  })

  it('이미지 주소가 없으면 cover_image_url은 null, title_in_image가 없으면 null이다', () => {
    const { payload } = toCard(cardItem())
    expect(payload).toMatchObject({ cover_image_url: null, title_in_image: null, image_source: null })
  })

  it('키 집합은 등록 스크립트의 페이로드 키에 pattern_no·created_by를 더한 것이다', () => {
    const scriptCard: HomeFeedCardInput = {
      template_type: 'drop_alert',
      title: '제목',
      exposure_tags: ['all'],
      starts_at: '2026-10-06T00:00:00.000Z',
      ends_at: '2026-10-06T14:59:59.999Z',
    }
    const scriptKeys = Object.keys(buildTodayCardInsertPayload(scriptCard, { id: CARD_ID, coverImageUrl: null }))
    const { payload } = full()
    expect(Object.keys(payload ?? {}).sort()).toEqual([...scriptKeys, 'pattern_no', 'created_by'].sort())
  })

  it('생성 타입 컬럼 대조: today_cards Insert 컬럼 중 DB 기본값에 맡기는 created_at을 뺀 전부를 채운다', () => {
    const source = fs.readFileSync(GENERATED_TYPES_FILE, 'utf8')
    const table = source.slice(source.indexOf('      today_cards: {'))
    const insert = table.slice(table.indexOf('Insert: {'), table.indexOf('Update: {'))
    const columns = [...insert.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1])
    expect(columns.length).toBeGreaterThan(15)
    expect(Object.keys(full().payload ?? {}).sort()).toEqual(columns.filter((c) => c !== 'created_at').sort())
  })
})

describe('toMissionRegisterInput', () => {
  it('검사를 통과하면 오류·경고 없이 insert 값을 돌려준다', () => {
    const result = toMission(missionItem())
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.linkFields).toEqual([])
    expect(result.payload).toMatchObject({
      id: MISSION_ID,
      title: '[TEST] 주말 러닝',
      description: '주말에 30km를 달려요.',
      mission_type: 'distance',
      condition_json: { activity_type: 'running', distance_km: 30 },
      starts_at: '2026-10-06T00:00:00+09:00',
      ends_at: null,
      exposure_mode: 'start_date',
      exposure_at: null,
      image_source: null,
      image_url: null,
      condition_text: null,
      reward_type: null,
      reward_id: null,
      gated_badge_id: null,
      status_display_type: 'ranking',
      reward_badge_ids: [],
    })
  })

  it('종료 시각이 없으면 상시(null)이고 있으면 그 값이다', () => {
    expect(toMission(missionItem()).payload?.ends_at).toBeNull()
    expect(toMission(missionItem({ ends_at: '2026-10-13T00:00:00+09:00' })).payload?.ends_at).toBe('2026-10-13T00:00:00+09:00')
  })

  it('항목에 시각이 없으면 행 칸을 읽는다', () => {
    const original = missionOriginal()
    delete original.starts_at
    const result = toMission(opsItem('mission', original, { starts_at: '2026-10-06T00:00:00+00:00', ends_at: '2026-10-13T00:00:00+00:00' }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ starts_at: '2026-10-06T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z' })
  })

  it('수정본을 먼저 읽는다', () => {
    const result = toMission(missionItem({}, { edited: { copy: { title: '고친 제목', description: '고친 설명' } } }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ title: '고친 제목', description: '고친 설명' })
  })

  it('description은 필수다(결정 3)', () => {
    const result = toMission(missionItem({ copy: { title: '제목만' } }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'copy.description', message: 'mission.description: 필수 항목이 없어요.' }])
  })

  it('description은 resource에서도 읽는다(copy가 먼저)', () => {
    const result = toMission(missionItem({ copy: { title: '제목' }, resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, description: '자원 설명' } }))
    expect(result.errors).toEqual([])
    expect(result.payload?.description).toBe('자원 설명')
  })

  it('condition_text는 copy에서 읽고, 없으면 resource, 그것도 없으면 null이다', () => {
    const fromCopy = toMission(missionItem({ copy: { title: '제목', description: '설명', condition_text: '30km 달리기' } }))
    expect(fromCopy.errors).toEqual([])
    expect(fromCopy.warnings).toEqual([])
    expect(fromCopy.payload?.condition_text).toBe('30km 달리기')

    const fromResource = toMission(
      missionItem({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, condition_text: '자원 문장' } })
    )
    expect(fromResource.payload?.condition_text).toBe('자원 문장')

    expect(toMission(missionItem()).payload?.condition_text).toBeNull()
  })

  it('condition_text가 문자열이 아니면 copy 경로 오류다', () => {
    const result = toMission(missionItem({ copy: { title: '제목', description: '설명', condition_text: 3 } }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['copy.condition_text'])
  })

  it('resource 칸을 payload에 싣고 image_url은 resource에서 읽는다', () => {
    const result = toMission(
      missionItem({
        resource: {
          mission_type: 'distance',
          condition_json: { activity_type: 'running', distance_km: 30 },
          reward_points: 50,
          status_display_type: 'achievement',
          visible_rank_count: 10,
          max_completions: 2,
          image_url: ' https://example.test/missions/image.webp?v=1 ',
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({
      reward_points: 50,
      status_display_type: 'achievement',
      visible_rank_count: 10,
      max_completions: 2,
      image_url: 'https://example.test/missions/image.webp?v=1',
      image_source: null,
    })
  })

  it('표에 없는 키와 툴이 정하는 키는 읽지 않고 경고한다', () => {
    const result = toMission(
      missionItem({
        copy: { title: '제목', description: '설명', slogan: '표에 없음' },
        resource: {
          mission_type: 'distance',
          condition_json: { distance_km: 30 },
          exposure_mode: 'hidden',
          exposure_at: '2026-10-06T00:00:00+09:00',
          reward_type: 'badge',
          gated_badge_id: UUID_A,
          starts_at: '2027-01-01T00:00:00+09:00',
          color: 'red',
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(paths(result.warnings).sort()).toEqual(
      ['copy.slogan', 'resource.color', 'resource.exposure_at', 'resource.exposure_mode', 'resource.gated_badge_id', 'resource.reward_type', 'resource.starts_at'].sort()
    )
    expect(result.payload).toMatchObject({ exposure_mode: 'start_date', exposure_at: null, reward_type: null, gated_badge_id: null, starts_at: '2026-10-06T00:00:00+09:00' })
  })

  it('reward_badge_ids는 resource 값 뒤에 연결 배지를 더하고 linkFields에 알린다', () => {
    const result = toMission(
      missionItem({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, reward_badge_ids: [UUID_A] } }),
      { reward_badge_ids: [UUID_B] }
    )
    expect(result.errors).toEqual([])
    expect(result.payload?.reward_badge_ids).toEqual([UUID_A, UUID_B])
    expect(result.linkFields).toEqual(['reward_badge_ids'])
  })

  it('resource에 보상 배지가 없어도 연결 배지로 채운다', () => {
    const result = toMission(missionItem(), { reward_badge_ids: [UUID_B] })
    expect(result.payload?.reward_badge_ids).toEqual([UUID_B])
    expect(result.linkFields).toEqual(['reward_badge_ids'])
  })

  it('검사 문장은 그대로 두고 운영 항목 경로를 돌려준다', () => {
    const result = toMission(
      missionItem({
        copy: { title: '제목', description: '설명' },
        resource: { mission_type: 'teleport', condition_json: { distance_km: 30 }, reward_points: -1, gate_axis: 'bogus' },
      })
    )
    expect(result.payload).toBeNull()
    const byPath = Object.fromEntries(result.errors.map((e) => [e.path, e.message]))
    expect(byPath['resource.mission_type']).toContain('mission.mission_type:')
    expect(byPath['resource.reward_points']).toBe('mission.reward_points: 0 이상의 정수여야 해요.')
    expect(byPath['resource']).toContain('mission.gate:')
  })

  it('필수 칸이 없으면 칸별 경로로 알린다', () => {
    const result = toMission(opsItem('mission', { copy: {}, resource: {} }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors).sort()).toEqual(
      ['copy.description', 'copy.title', 'resource.condition_json', 'resource.mission_type', 'starts_at'].sort()
    )
  })

  it('조건 검증 경고는 warnings로 돌려주고 payload는 만든다(오류 아님)', () => {
    // 판정에 영향이 없는 조건 필드(`route`)는 `mission.condition_json: …` 고지로 나온다(`lib/missions/condition-keys`).
    const result = toMission(
      missionItem({ resource: { mission_type: 'distance', condition_json: { distance_km: 30, route: 'x' } } })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).not.toBeNull()
    expect(paths(result.warnings)).toEqual(['resource.condition_json'])
    expect(result.warnings[0].message.startsWith('mission.condition_json: ')).toBe(true)
  })

  it('공개 시각이 종료 시각보다 늦으면 starts_at 오류다', () => {
    const result = toMission(missionItem({ ends_at: '2026-10-05T00:00:00+09:00' }))
    expect(result.errors).toEqual([{ path: 'starts_at', message: 'mission.starts_at: ends_at보다 앞이어야 해요.' }])
  })

  it('image_url이 문자열이 아니면 오류다', () => {
    const result = toMission(missionItem({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, image_url: 1 } }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['resource.image_url'])
  })

  it('kind가 mission이 아니면 오류다', () => {
    const result = toMission(opsItem('home_feed_card', missionOriginal()))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['kind'])
  })

  it('페이로드 키 집합은 미션 등록 스크립트와 같다', () => {
    const scriptMission: MissionInput = {
      title: '제목',
      description: '설명',
      mission_type: 'distance',
      condition_json: { distance_km: 30 },
      starts_at: '2026-10-06T00:00:00+09:00',
    }
    const scriptKeys = Object.keys(buildMissionInsertPayload(scriptMission, { id: MISSION_ID, imageUrl: null }))
    expect(Object.keys(toMission(missionItem()).payload ?? {}).sort()).toEqual(scriptKeys.sort())
  })

  it('생성 타입 컬럼 대조: missions Insert 컬럼 중 DB 기본값에 맡기는 created_at을 뺀 전부를 채운다', () => {
    const source = fs.readFileSync(GENERATED_TYPES_FILE, 'utf8')
    const table = source.slice(source.indexOf('      missions: {'))
    const insert = table.slice(table.indexOf('Insert: {'), table.indexOf('Update: {'))
    const columns = [...insert.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1])
    expect(columns.length).toBeGreaterThan(10)
    expect(Object.keys(toMission(missionItem()).payload ?? {}).sort()).toEqual(columns.filter((c) => c !== 'created_at').sort())
  })
})

describe('toRecipeRegisterInput (티켓 20261002_2221, PRD §8.4 레시피 행)', () => {
  const SLOTS = [
    { badge_type: 'item', allowed_badge_ids: [UUID_A] },
    { badge_type: 'activity', allowed_badge_ids: [UUID_B] },
  ]

  it('공통 칸 starts_at은 valid_from으로, name은 copy에서, 슬롯·보상은 resource에서 읽고 오류·경고·연결 칸이 없다', () => {
    const result = toRecipeRegisterInput(recipeItem({ resource: { slots: SLOTS, reward_points: 10, reward_badge_ids: [UUID_C] } }))
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.linkFields).toEqual([])
    expect(result.payload).toEqual({
      name: '[TEST] 가을 믹스',
      valid_from: '2026-10-06T09:00:00+09:00',
      slots: SLOTS,
      reward_points: 10,
      reward_badge_ids: [UUID_C],
    })
  })

  it('종료 시각(ends_at)이 없으면 valid_until 칸을 넣지 않는다(상시). 있으면 valid_until로 읽는다', () => {
    const open = toRecipeRegisterInput(recipeItem())
    expect(open.payload).not.toBeNull()
    expect('valid_until' in (open.payload as object)).toBe(false)

    const closed = toRecipeRegisterInput(recipeItem({ ends_at: '2026-10-13T09:00:00+09:00' }))
    expect(closed.errors).toEqual([])
    expect(closed.payload).toMatchObject({ valid_from: '2026-10-06T09:00:00+09:00', valid_until: '2026-10-13T09:00:00+09:00' })
  })

  it('항목 값이 비었으면 행 칸(starts_at·ends_at)으로 시각을 읽는다', () => {
    const { starts_at: _omit, ...withoutStart } = recipeOriginal()
    const result = toRecipeRegisterInput(opsItem('recipe', withoutStart, { starts_at: '2026-10-06T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z' }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ valid_from: '2026-10-06T00:00:00.000Z', valid_until: '2026-10-13T00:00:00.000Z' })
  })

  it('수정본에 값이 있으면 수정본을 먼저 읽고, 수정본에 없는 칸은 제출 원본에서 읽는다', () => {
    const result = toRecipeRegisterInput(
      recipeItem({}, { edited: { starts_at: '2026-10-07T09:00:00+09:00', copy: { name: '고친 이름' }, resource: { slots: SLOTS, reward_points: 20 } } })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ name: '고친 이름', valid_from: '2026-10-07T09:00:00+09:00', reward_points: 20 })

    const partial = toRecipeRegisterInput(recipeItem({}, { edited: { copy: { name: '고친 이름' } } }))
    expect(partial.errors).toEqual([])
    expect(partial.payload).toMatchObject({ name: '고친 이름', valid_from: '2026-10-06T09:00:00+09:00', slots: SLOTS })
  })

  it('name은 copy를 먼저 읽고, 없으면 resource의 name을 읽는다', () => {
    const fromResource = toRecipeRegisterInput(recipeItem({ copy: {}, resource: { name: 'resource 이름', slots: SLOTS, reward_points: 10 } }))
    expect(fromResource.errors).toEqual([])
    expect(fromResource.warnings).toEqual([])
    expect(fromResource.payload).toMatchObject({ name: 'resource 이름' })

    const both = toRecipeRegisterInput(recipeItem({ copy: { name: 'copy 이름' }, resource: { name: 'resource 이름', slots: SLOTS, reward_points: 10 } }))
    expect(both.payload).toMatchObject({ name: 'copy 이름' })
  })

  it('필수 칸이 없으면 오류를 칸마다 쌓고 payload는 null이다. 경로는 운영 항목 경로다', () => {
    const result = toRecipeRegisterInput(opsItem('recipe', { copy: {}, resource: {} }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([
      { path: 'copy.name', message: 'recipe.name: 필수 항목이 없어요.' },
      { path: 'starts_at', message: 'recipe.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' },
      { path: 'resource.slots', message: 'recipe.slots: 필수 항목이 없어요.' },
    ])
  })

  it('공개 시각이 빈 문자열이어도 없는 것이다 — 서버 함수가 바로 공개로 읽어 예약이 아니게 되는 것을 막는다', () => {
    const result = toRecipeRegisterInput(recipeItem({ starts_at: '' }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['starts_at'])
  })

  it('값의 형식은 보지 않고 그대로 넘긴다(형식 검사는 normalizeRecipePayload가 현재 시각과 한다)', () => {
    const result = toRecipeRegisterInput(
      recipeItem({ starts_at: 'not-a-time', resource: { slots: 'nope', reward_points: 'abc', reward_badge_ids: 'x' } })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ valid_from: 'not-a-time', slots: 'nope', reward_points: 'abc', reward_badge_ids: 'x' })
  })

  it('표에 없는 칸·툴이 정하는 값·공통 칸과 겹치는 resource 키는 경고하고 읽지 않는다', () => {
    const result = toRecipeRegisterInput(
      recipeItem({
        copy: { name: '[TEST] 가을 믹스', mood: 'calm' },
        resource: { slots: SLOTS, reward_points: 10, id: UUID_A, starts_at: '2027-01-01T00:00:00+09:00', valid_from: '2027-01-01T00:00:00+09:00' },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ valid_from: '2026-10-06T09:00:00+09:00' })
    expect(result.payload).not.toHaveProperty('id')
    expect(result.warnings).toEqual([
      { path: 'copy.mood', message: 'copy.mood: 표에 없는 칸이라 읽지 않아요.' },
      { path: 'resource.id', message: 'resource.id: 툴이 정하는 값이라 읽지 않아요.' },
      { path: 'resource.starts_at', message: 'resource.starts_at: 항목 공통 칸(starts_at)이 먼저라 이 값은 읽지 않아요.' },
      { path: 'resource.valid_from', message: 'resource.valid_from: 표에 없는 칸이라 읽지 않아요.' },
    ])
  })

  it('copy·resource가 객체가 아니면 오류다', () => {
    const result = toRecipeRegisterInput(recipeItem({ copy: 'x', resource: [1] }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual(expect.arrayContaining([{ path: 'copy', message: 'copy: 객체여야 해요.' }, { path: 'resource', message: 'resource: 객체여야 해요.' }]))
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const result = toRecipeRegisterInput(missionItem())
    expect(result.payload).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ path: 'kind' })
    expect(result.errors[0].message).toMatch(/^kind: recipe 항목만 레시피로 바꿀 수 있어요/)
  })

  it('입력 항목을 바꾸지 않는다', () => {
    const item = recipeItem()
    const before = JSON.stringify(item)
    toRecipeRegisterInput(item)
    expect(JSON.stringify(item)).toBe(before)
  })
})

describe('toDropScheduleRegisterInput (티켓 20261002_2306, PRD §8.4 드랍 행)', () => {
  it('공통 칸 starts_at은 scheduled_at으로, title은 copy에서, 6개 키는 resource에서 읽고 오류·경고·연결 칸이 없다', () => {
    const result = toDropScheduleRegisterInput(dropItem())
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.linkFields).toEqual([])
    expect(result.payload).toEqual({
      scheduled_at: '2026-10-06T09:00:00+09:00',
      title: '[TEST] 가을 아침 드랍',
      poi_ids: [UUID_A],
      per_poi_count: 2,
      collection_ids: [UUID_B],
    })
  })

  it('resource의 6개 키(poi_ids·poi_category·badge_ids·collection_ids·per_poi_count·total_count)를 값 그대로 넘긴다', () => {
    const category = toDropScheduleRegisterInput(dropItem({ resource: { poi_category: 'cafe', total_count: 5, badge_ids: [UUID_A, UUID_B] } }))
    expect(category.errors).toEqual([])
    expect(category.payload).toMatchObject({ poi_category: 'cafe', total_count: 5, badge_ids: [UUID_A, UUID_B] })
    expect(category.payload).not.toHaveProperty('poi_ids')
    expect(category.payload).not.toHaveProperty('collection_ids')
  })

  it('값의 형식은 보지 않고 그대로 넘긴다(형식 검사는 parseAmbientDropScheduleInput이 현재 시각과 한다)', () => {
    const result = toDropScheduleRegisterInput(dropItem({ starts_at: 'not-a-time', resource: { poi_ids: 'x', per_poi_count: 0, total_count: 'abc' } }))
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ scheduled_at: 'not-a-time', poi_ids: 'x', per_poi_count: 0, total_count: 'abc' })
  })

  it('title은 copy를 먼저 읽고, 없으면 resource의 title을 읽고, 둘 다 없으면 칸을 넣지 않는다(길이는 파서가 본다)', () => {
    const fromResource = toDropScheduleRegisterInput(dropItem({ copy: {}, resource: { title: 'resource 제목', total_count: 1, badge_ids: [UUID_A] } }))
    expect(fromResource.errors).toEqual([])
    expect(fromResource.warnings).toEqual([])
    expect(fromResource.payload).toMatchObject({ title: 'resource 제목' })

    const both = toDropScheduleRegisterInput(
      dropItem({ copy: { title: 'copy 제목' }, resource: { title: 'resource 제목', poi_ids: [UUID_A], per_poi_count: 1, badge_ids: [UUID_A] } })
    )
    expect(both.payload).toMatchObject({ title: 'copy 제목' })

    const none = toDropScheduleRegisterInput(dropItem({ copy: {} }))
    expect(none.errors).toEqual([])
    expect(none.payload).not.toHaveProperty('title')

    const long = toDropScheduleRegisterInput(dropItem({ copy: { title: '가'.repeat(101) } }))
    expect(long.errors).toEqual([])
    expect((long.payload as { title: string }).title).toHaveLength(101)
  })

  it('항목 값이 비었으면 행 칸(starts_at)으로 공개 시각을 읽는다. 수정본이 있으면 수정본을 먼저 읽는다', () => {
    const fromColumn = toDropScheduleRegisterInput(opsItem('drop_schedule', dropOriginal({ starts_at: undefined }), { starts_at: '2026-10-06T00:00:00.000Z' }))
    expect(fromColumn.errors).toEqual([])
    expect(fromColumn.payload).toMatchObject({ scheduled_at: '2026-10-06T00:00:00.000Z' })

    const edited = toDropScheduleRegisterInput(dropItem({}, { edited: { starts_at: '2026-10-07T09:00:00+09:00', copy: { title: '고친 제목' } } }))
    expect(edited.errors).toEqual([])
    expect(edited.payload).toMatchObject({ scheduled_at: '2026-10-07T09:00:00+09:00', title: '고친 제목', poi_ids: [UUID_A] })
  })

  it('공개 시각이 없으면 변환 오류다. 빈 문자열이어도 없는 것이다. 경로는 starts_at이다', () => {
    const result = toDropScheduleRegisterInput(opsItem('drop_schedule', { copy: { title: '[TEST]' }, resource: { total_count: 1, badge_ids: [UUID_A] } }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'starts_at', message: 'drop_schedule.scheduled_at: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).' }])

    const blank = toDropScheduleRegisterInput(dropItem({ starts_at: '' }))
    expect(blank.payload).toBeNull()
    expect(paths(blank.errors)).toEqual(['starts_at'])
  })

  it('종료 시각(ends_at)이 있으면 변환 오류다. 항목 값이든 행 칸이든 같다', () => {
    const fromItem = toDropScheduleRegisterInput(dropItem({ ends_at: '2026-10-13T09:00:00+09:00' }))
    expect(fromItem.payload).toBeNull()
    expect(fromItem.errors).toEqual([
      { path: 'ends_at', message: 'drop_schedule.ends_at: 드랍 일정은 놓은 뒤 내리지 않아서 종료 시각이 없어요. 종료 시각을 빼 주세요.' },
    ])

    const fromColumn = toDropScheduleRegisterInput(dropItem({}, { ends_at: '2026-10-13T00:00:00.000Z' }))
    expect(fromColumn.payload).toBeNull()
    expect(paths(fromColumn.errors)).toEqual(['ends_at'])

    // 종료 시각이 없으면 payload에도 ends_at 칸이 없다.
    expect(toDropScheduleRegisterInput(dropItem()).payload).not.toHaveProperty('ends_at')
  })

  it('공개 시각이 없고 종료 시각이 있으면 오류를 칸마다 쌓는다', () => {
    const result = toDropScheduleRegisterInput(dropItem({ starts_at: undefined }, { ends_at: '2026-10-13T00:00:00.000Z' }))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['starts_at', 'ends_at'])
  })

  describe('연결 칸 collection_ids(§8.3)', () => {
    it('연결 ID가 있으면 resource 몫 뒤에 더하고 linkFields에 알린다', () => {
      const result = toDropScheduleRegisterInput(dropItem(), { linkedIds: { collection_ids: [UUID_C] } })
      expect(result.errors).toEqual([])
      expect(result.payload).toMatchObject({ collection_ids: [UUID_B, UUID_C] })
      expect(result.linkFields).toEqual(['collection_ids'])
    })

    it('resource에 collection_ids가 없으면 연결 ID만 들어간다', () => {
      const result = toDropScheduleRegisterInput(dropItem({ resource: { poi_category: 'cafe', total_count: 3 } }), { linkedIds: { collection_ids: [UUID_C, UUID_A] } })
      expect(result.errors).toEqual([])
      expect(result.payload).toMatchObject({ collection_ids: [UUID_C, UUID_A], poi_category: 'cafe', total_count: 3 })
      expect(result.linkFields).toEqual(['collection_ids'])
    })

    it('연결 ID가 비어 있거나 없으면 resource 값 그대로이고 linkFields는 비어 있다', () => {
      for (const linkedIds of [undefined, {}, { collection_ids: null }, { collection_ids: [] }]) {
        const result = toDropScheduleRegisterInput(dropItem(), linkedIds === undefined ? undefined : { linkedIds })
        expect(result.payload).toMatchObject({ collection_ids: [UUID_B] })
        expect(result.linkFields).toEqual([])
      }
    })

    it('받은 연결 ID 배열을 바꾸지 않는다', () => {
      const linked = [UUID_C]
      toDropScheduleRegisterInput(dropItem(), { linkedIds: { collection_ids: linked } })
      expect(linked).toEqual([UUID_C])
    })

    it('resource에 badge_ids가 있는 채로 연결 ID가 더해지면 변환은 막지 않고 둘 다 넘긴다(섞임은 파서가 막는다)', () => {
      const result = toDropScheduleRegisterInput(dropItem({ resource: { poi_ids: [UUID_A], per_poi_count: 1, badge_ids: [UUID_A] } }), {
        linkedIds: { collection_ids: [UUID_C] },
      })
      expect(result.errors).toEqual([])
      expect(result.payload).toMatchObject({ badge_ids: [UUID_A], collection_ids: [UUID_C] })
    })
  })

  it('표에 없는 칸·툴이 정하는 값·공통 칸과 겹치는 resource 키는 경고하고 읽지 않는다', () => {
    const result = toDropScheduleRegisterInput(
      dropItem({
        copy: { title: '[TEST] 가을 아침 드랍', mood: 'calm' },
        resource: {
          total_count: 1,
          badge_ids: [UUID_A],
          id: UUID_A,
          starts_at: '2027-01-01T00:00:00+09:00',
          scheduled_at: '2027-01-01T00:00:00+09:00',
          rarity_common: 5,
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ scheduled_at: '2026-10-06T09:00:00+09:00' })
    expect(result.payload).not.toHaveProperty('id')
    expect(result.payload).not.toHaveProperty('rarity_common')
    expect(result.warnings).toEqual([
      { path: 'copy.mood', message: 'copy.mood: 표에 없는 칸이라 읽지 않아요.' },
      { path: 'resource.id', message: 'resource.id: 툴이 정하는 값이라 읽지 않아요.' },
      { path: 'resource.starts_at', message: 'resource.starts_at: 항목 공통 칸(starts_at)이 먼저라 이 값은 읽지 않아요.' },
      { path: 'resource.scheduled_at', message: 'resource.scheduled_at: 표에 없는 칸이라 읽지 않아요.' },
      { path: 'resource.rarity_common', message: 'resource.rarity_common: 표에 없는 칸이라 읽지 않아요.' },
    ])
  })

  it('copy·resource가 객체가 아니면 오류다', () => {
    const result = toDropScheduleRegisterInput(dropItem({ copy: 'x', resource: [1] }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual(expect.arrayContaining([{ path: 'copy', message: 'copy: 객체여야 해요.' }, { path: 'resource', message: 'resource: 객체여야 해요.' }]))
  })

  it('다른 종류의 항목은 변환 오류로 막는다', () => {
    const result = toDropScheduleRegisterInput(missionItem())
    expect(result.payload).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ path: 'kind' })
    expect(result.errors[0].message).toMatch(/^kind: drop_schedule 항목만 드랍 예약으로 바꿀 수 있어요/)
  })

  it('입력 항목을 바꾸지 않는다', () => {
    const item = dropItem()
    const before = JSON.stringify(item)
    toDropScheduleRegisterInput(item, { linkedIds: { collection_ids: [UUID_C] } })
    expect(JSON.stringify(item)).toBe(before)
  })
})

describe('toJamBadgeRegisterInput (티켓 20261004_1756, PRD §8.4 JAM! 배지 행)', () => {
  it('공통 칸 starts_at은 valid_from으로, name·description은 copy에서, 나머지는 resource에서 읽고 어드민 배지 변환(buildBadgeInsertPayload)과 같은 값을 만든다', () => {
    const result = toBadge(
      badgeItem({
        resource: { condition_json: { combine_success_count: 1 }, rarity: 'rare', point_reward: 30, family_key: 'jam:첫 믹스', sort_order: 3, image_url: 'https://example.com/badge.png' },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.linkFields).toEqual([])
    expect(result.payload).toEqual({
      id: BADGE_ID,
      ...buildBadgeInsertPayload({
        name: '[TEST] 첫 믹스',
        description: '믹스에 처음 성공했어요.',
        type: 'activity',
        rarity: 'rare',
        level: undefined,
        family_key: 'jam:첫 믹스',
        sort_order: 3,
        image_url: 'https://example.com/badge.png',
        activity_types: [],
        condition_json: { combine_success_count: 1 },
        admin_category: 'jam',
        valid_from: '2026-10-06T09:00:00+09:00',
        valid_until: null,
        point_reward: 30,
      }),
    })
  })

  it('툴이 정하는 값: type = activity, admin_category = jam, activity_types = [] 이고 이미지가 없으면 null이다(G1)', () => {
    const payload = toBadge(badgeItem()).payload!
    expect(payload).toMatchObject({ id: BADGE_ID, type: 'activity', admin_category: 'jam', activity_types: [], image_url: null, family_key: null, sort_order: 0, point_reward: 10, level: null, rarity: 'common' })
  })

  it('종료 시각(ends_at)이 없으면 valid_until이 null(상시)이고, 있으면 valid_until로 읽는다', () => {
    expect(toBadge(badgeItem()).payload).toMatchObject({ valid_from: '2026-10-06T09:00:00+09:00', valid_until: null })
    const closed = toBadge(badgeItem({ ends_at: '2026-10-13T09:00:00+09:00' }))
    expect(closed.errors).toEqual([])
    expect(closed.payload).toMatchObject({ valid_until: '2026-10-13T09:00:00+09:00' })
  })

  it('항목 값이 비었으면 행 칸(starts_at·ends_at)으로 시각을 읽고, 수정본이 있으면 수정본을 먼저 읽는다', () => {
    const withoutStart = badgeOriginal()
    delete withoutStart.starts_at
    const fromRow = toBadge(opsItem('jam_badge', withoutStart, { starts_at: '2026-10-06T00:00:00.000Z', ends_at: '2026-10-13T00:00:00.000Z' }))
    expect(fromRow.errors).toEqual([])
    expect(fromRow.payload).toMatchObject({ valid_from: '2026-10-06T00:00:00.000Z', valid_until: '2026-10-13T00:00:00.000Z' })

    // 수정본의 copy·resource는 묶음 단위로 읽는다(수정본에 copy가 있으면 그 객체 전체가 copy다). 수정본에 없는 묶음·공통 칸은 제출 원본에서 읽는다.
    const edited = toBadge(badgeItem({}, { edited: { starts_at: '2026-10-07T09:00:00+09:00', copy: { name: '고친 이름', description: '고친 설명' } } }))
    expect(edited.errors).toEqual([])
    expect(edited.payload).toMatchObject({ name: '고친 이름', description: '고친 설명', valid_from: '2026-10-07T09:00:00+09:00', point_reward: 10, rarity: 'common' })
  })

  it('name·description은 copy를 먼저 읽고, 없으면 resource에서 읽는다. 앞뒤 공백은 뗀다', () => {
    const fromResource = toBadge(
      badgeItem({ copy: {}, resource: { name: ' resource 이름 ', description: 'resource 설명', condition_json: { combine_success_count: 1 }, rarity: 'common' } })
    )
    expect(fromResource.errors).toEqual([])
    expect(fromResource.warnings).toEqual([])
    expect(fromResource.payload).toMatchObject({ name: 'resource 이름', description: 'resource 설명' })
  })

  it('필수 칸이 없으면 칸마다 오류를 쌓고 payload가 없다(경로는 copy.name·copy.description·starts_at·resource.condition_json)', () => {
    const withoutStart = badgeOriginal({ copy: {}, resource: { rarity: 'common' } })
    delete withoutStart.starts_at
    const result = toBadge(opsItem('jam_badge', withoutStart))
    expect(result.payload).toBeNull()
    expect(paths(result.errors)).toEqual(['copy.name', 'copy.description', 'starts_at', 'resource.condition_json'])
    expect(result.errors.map((issue) => issue.message)).toEqual([
      'badge.name: 필수 항목이 없어요.',
      'badge.description: 필수 항목이 없어요.',
      'badge.valid_from: 필수 항목이 없어요(공개 시각 starts_at이 필요해요).',
      'badge.condition_json: 필수 항목이 없어요.',
    ])
  })

  it('이름·설명이 공백뿐이면 없는 것으로 보고, 문자열이 아니면 형식 오류다', () => {
    const blank = toBadge(badgeItem({ copy: { name: '   ', description: '설명' } }))
    expect(blank.errors).toEqual([{ path: 'copy.name', message: 'badge.name: 필수 항목이 없어요.' }])
    const notText = toBadge(badgeItem({ copy: { name: 7, description: '설명' } }))
    expect(notText.errors).toEqual([{ path: 'copy.name', message: 'badge.name: 문자열이어야 해요(받은 값: 7).' }])
  })

  it('조건은 객체여야 한다', () => {
    const result = toBadge(badgeItem({ resource: { condition_json: 'combine_success_count', rarity: 'common' } }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'resource.condition_json', message: 'badge.condition_json: 객체여야 해요(받은 값: "combine_success_count").' }])
  })

  it('시각은 시간대가 붙은 ISO여야 하고 종료는 공개보다 늦어야 한다', () => {
    const badStart = toBadge(badgeItem({ starts_at: '내일 아침' }))
    expect(badStart.errors).toEqual([{ path: 'starts_at', message: 'badge.valid_from: 시간대가 붙은 ISO 형식이어야 해요(받은 값: "내일 아침").' }])
    const badEnd = toBadge(badgeItem({ ends_at: '다음 주' }))
    expect(badEnd.errors).toEqual([{ path: 'ends_at', message: 'badge.valid_until: 시간대가 붙은 ISO 형식이어야 해요(받은 값: "다음 주").' }])
    const same = toBadge(badgeItem({ ends_at: '2026-10-06T09:00:00+09:00' }))
    expect(same.errors).toEqual([{ path: 'ends_at', message: 'badge.valid_until: 종료 시각은 공개 시각보다 늦어야 해요.' }])
    const earlier = toBadge(badgeItem({ ends_at: '2026-10-05T09:00:00+09:00' }))
    expect(paths(earlier.errors)).toEqual(['ends_at'])
  })

  it('희귀도와 레벨은 정확히 하나여야 한다(둘 다·둘 다 없음·알 수 없는 값·잘못된 레벨), 문장 앞의 「저장할 수 없습니다.」는 뗀다', () => {
    const both = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', level: 1 } }))
    expect(both.payload).toBeNull()
    expect(paths(both.errors)).toEqual(['resource.rarity'])
    expect(both.errors[0].message).toBe('badge.rarity: 등급형과 레벨형은 함께 지정할 수 없습니다. 등급(common~mystic)이나 레벨(Lv.1 이상) 중 하나만 남겨주세요.')

    const none = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 } } }))
    expect(paths(none.errors)).toEqual(['resource.rarity'])
    expect(none.errors[0].message).toContain('배지 종류가 정해지지 않았습니다')

    const unknownRarity = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'shiny' } }))
    expect(unknownRarity.errors[0].message).toContain('등급 값(shiny)을 알 수 없습니다')

    const badLevel = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, level: 0 } }))
    expect(paths(badLevel.errors)).toEqual(['resource.level'])
    expect(badLevel.errors[0].message).toContain('레벨 값(0)이 올바르지 않습니다')

    const leveled = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, level: 2 } }))
    expect(leveled.errors).toEqual([])
    expect(leveled.payload).toMatchObject({ level: 2, rarity: null })
  })

  it('계열 키는 "종목:이름" 형태여야 하고 문자열이어야 한다', () => {
    const bad = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', family_key: '쉼표,있음:이름' } }))
    expect(bad.payload).toBeNull()
    expect(bad.errors[0].path).toBe('resource.family_key')
    expect(bad.errors[0].message).toContain('계열 키 형태(쉼표,있음:이름)가 올바르지 않아요')

    const notText = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', family_key: 3 } }))
    expect(notText.errors).toEqual([{ path: 'resource.family_key', message: 'badge.family_key: 문자열이어야 해요(받은 값: 3).' }])

    const blank = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', family_key: '  ' } }))
    expect(blank.errors).toEqual([])
    expect(blank.payload).toMatchObject({ family_key: null })
  })

  it('포인트와 정렬 값은 0 이상의 정수여야 한다(조용히 0으로 바뀌지 않는다)', () => {
    const result = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', point_reward: '10', sort_order: -1 } }))
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([
      { path: 'resource.point_reward', message: 'badge.point_reward: 0 이상의 정수여야 해요(받은 값: "10").' },
      { path: 'resource.sort_order', message: 'badge.sort_order: 0 이상의 정수여야 해요(받은 값: -1).' },
    ])
  })

  it('이미지 주소가 문자열이 아니면 형식 오류다', () => {
    const result = toBadge(badgeItem({ resource: { condition_json: { combine_success_count: 1 }, rarity: 'common', image_url: 5 } }))
    expect(result.errors).toEqual([{ path: 'resource.image_url', message: 'badge.image_url: 문자열이어야 해요(받은 값: 5).' }])
  })

  it('activity_types·type·admin_category는 툴이 정하는 값이라 읽지 않고 경고한다. 표에 없는 칸(tribe_id·item_book_id 등)도 경고한다', () => {
    const result = toBadge(
      badgeItem({
        resource: {
          condition_json: { combine_success_count: 1 },
          rarity: 'common',
          activity_types: ['running'],
          type: 'item',
          admin_category: 'other',
          tribe_id: UUID_A,
          item_book_id: UUID_B,
        },
      })
    )
    expect(result.errors).toEqual([])
    expect(result.payload).toMatchObject({ type: 'activity', admin_category: 'jam', activity_types: [], tribe_id: null, item_book_id: null })
    expect(Object.fromEntries(result.warnings.map((issue) => [issue.path, issue.message]))).toEqual({
      'resource.activity_types': 'resource.activity_types: 툴이 정하는 값이라 읽지 않아요.',
      'resource.type': 'resource.type: 툴이 정하는 값이라 읽지 않아요.',
      'resource.admin_category': 'resource.admin_category: 툴이 정하는 값이라 읽지 않아요.',
      'resource.tribe_id': 'resource.tribe_id: 표에 없는 칸이라 읽지 않아요.',
      'resource.item_book_id': 'resource.item_book_id: 표에 없는 칸이라 읽지 않아요.',
    })
  })

  describe('연결 칸 condition_json.recipe_first_success.recipe_id(§8.3 「덮는 칸」)', () => {
    it('연결 ID가 있으면 항목의 값 위에 덮고 linkFields에 알린다. resource의 같은 값은 충돌이 아니다', () => {
      const result = toBadge(
        badgeItem({ resource: { condition_json: { recipe_first_success: { recipe_id: UUID_A } }, rarity: 'common' } }),
        { recipe_id: UUID_B }
      )
      expect(result.errors).toEqual([])
      expect(result.linkFields).toEqual([JAM_BADGE_RECIPE_LINK_FIELD])
      expect(result.linkFields).toEqual(['condition_json.recipe_first_success.recipe_id'])
      expect(result.payload?.condition_json).toEqual({ recipe_first_success: { recipe_id: UUID_B } })
    })

    it('항목에 recipe_first_success가 없으면 칸을 만들고, 값이 객체가 아닌 칸도 연결 ID로 맞춘다', () => {
      const none = toBadge(badgeItem({ resource: { condition_json: { mission_reward: true }, rarity: 'common' } }), { recipe_id: UUID_B })
      expect(none.payload?.condition_json).toEqual({ mission_reward: true, recipe_first_success: { recipe_id: UUID_B } })

      const notObject = toBadge(badgeItem({ resource: { condition_json: { recipe_first_success: true }, rarity: 'common' } }), { recipe_id: UUID_B })
      expect(notObject.payload?.condition_json).toEqual({ recipe_first_success: { recipe_id: UUID_B } })
    })

    it('연결 ID가 없으면(null·빈 문자열 포함) 항목의 값을 그대로 두고 linkFields는 비어 있다', () => {
      for (const linked of [undefined, { recipe_id: null }, { recipe_id: '' }]) {
        const result = toBadge(badgeItem({ resource: { condition_json: { recipe_first_success: { recipe_id: UUID_A } }, rarity: 'common' } }), linked)
        expect(result.linkFields).toEqual([])
        expect(result.payload?.condition_json).toEqual({ recipe_first_success: { recipe_id: UUID_A } })
      }
    })

    it('원본 항목의 condition_json 객체를 바꾸지 않는다', () => {
      const original = badgeOriginal({ resource: { condition_json: { recipe_first_success: { recipe_id: UUID_A } }, rarity: 'common' } })
      const before = JSON.stringify(original)
      toBadge(opsItem('jam_badge', original), { recipe_id: UUID_B })
      expect(JSON.stringify(original)).toBe(before)
    })
  })

  it('kind가 jam_badge가 아니면 오류다', () => {
    const result = toJamBadgeRegisterInput(opsItem('mission', badgeOriginal()), { id: BADGE_ID })
    expect(result.payload).toBeNull()
    expect(result.errors).toEqual([{ path: 'kind', message: 'kind: jam_badge 항목만 JAM! 배지로 바꿀 수 있어요(받은 값: "mission").' }])
  })
})

describe('withoutSavePrefix', () => {
  it('어드민 저장 검사 문장 앞의 「저장할 수 없습니다.」만 뗀다', () => {
    expect(withoutSavePrefix('저장할 수 없습니다. 등급 값을 알 수 없습니다.')).toBe('등급 값을 알 수 없습니다.')
    expect(withoutSavePrefix('등급 값을 알 수 없습니다. 저장할 수 없습니다.')).toBe('등급 값을 알 수 없습니다. 저장할 수 없습니다.')
  })
})

describe('withoutLinkedFields · 등록 전 DB 검사용 사본(결정 8)', () => {
  it('연결로 채운 단일 칸은 null로, 배열 칸은 연결 몫만 빼고 resource 몫은 남긴다', () => {
    const linkedIds = { mission_id: UUID_A, badge_ids: [UUID_B, UUID_C], item_book_id: UUID_A }
    const result = toCard(
      cardItem({ resource: { template_type: 'progress_nudge', badge_ids: [UUID_A] } }),
      { mission_id: UUID_A, badge_ids: [UUID_B, UUID_C] }
    )
    expect(result.payload).not.toBeNull()
    expect(result.linkFields).toEqual(['mission_id', 'badge_ids'])

    const copy = withoutLinkedFields(result.payload!, result.linkFields, linkedIds)
    expect(copy.mission_id).toBeNull()
    expect(copy.badge_ids).toEqual([UUID_A])
    // 연결로 채우지 않은 칸은 그대로다
    expect(copy.title).toBe(result.payload!.title)
    expect(copy.item_book_id).toBeNull()
    // 원본은 바뀌지 않는다
    expect(result.payload!.mission_id).toBe(UUID_A)
    expect(result.payload!.badge_ids).toEqual([UUID_A, UUID_B, UUID_C])
  })

  it('linkFields에 없는 칸은 건드리지 않는다', () => {
    const result = toCard(cardItem({ resource: { template_type: 'mission_spotlight', mission_id: UUID_A } }))
    expect(result.linkFields).toEqual([])
    const copy = withoutLinkedFields(result.payload!, result.linkFields, {})
    expect(copy).toEqual(result.payload)
    expect(copy).not.toBe(result.payload)
  })

  it('연결 배지가 대소문자만 다르게 들어와도 같은 ID로 뺀다', () => {
    const upper = UUID_B.toUpperCase()
    const result = toCard(cardItem({ resource: { template_type: 'badge_spotlight', badge_ids: [UUID_A] } }), { badge_ids: [upper] })
    const copy = withoutLinkedFields(result.payload!, result.linkFields, { badge_ids: [UUID_B] })
    expect(copy.badge_ids).toEqual([UUID_A])
  })

  it('미션의 reward_badge_ids도 같은 방식이다', () => {
    const result = toMission(
      missionItem({ resource: { mission_type: 'distance', condition_json: { distance_km: 30 }, reward_badge_ids: [UUID_A] } }),
      { reward_badge_ids: [UUID_B] }
    )
    expect(result.linkFields).toEqual(['reward_badge_ids'])
    const copy = withoutLinkedFields(result.payload!, result.linkFields, { reward_badge_ids: [UUID_B] })
    expect(copy.reward_badge_ids).toEqual([UUID_A])
    expect(result.payload!.reward_badge_ids).toEqual([UUID_A, UUID_B])
  })

  it('연결 몫을 빼면 배열이 비는 경우도 빈 배열이다', () => {
    const result = toMission(missionItem(), { reward_badge_ids: [UUID_B] })
    const copy = withoutLinkedFields(result.payload!, result.linkFields, { reward_badge_ids: [UUID_B] })
    expect(copy.reward_badge_ids).toEqual([])
  })
})

describe('모듈 경계', () => {
  it('Supabase·node: 모듈을 가져오지 않는다(DB에 접근하지 않는 순수 모듈)', () => {
    const source = fs.readFileSync(MODULE_FILE, 'utf8')
    const imports = [...source.matchAll(/^import[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(5)
    for (const specifier of imports) {
      expect(specifier, specifier).not.toMatch(/supabase/i)
      expect(specifier, specifier).not.toMatch(/^node:/)
    }
    expect(source).not.toMatch(/\.from\(\s*['"`]/)
  })

  it('드랍 입력 키를 가져오는 scheduleSpec도 Supabase·서버 전용 모듈을 값으로 가져오지 않는다', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ambient-drop', 'scheduleSpec.ts'), 'utf8')
    const imports = [...source.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports).toContain('@/lib/admin/uuid')
    for (const specifier of imports) {
      expect(specifier, specifier).not.toMatch(/supabase/i)
      expect(specifier, specifier).not.toMatch(/^node:/)
    }
  })
})
