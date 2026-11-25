/**
 * 등급 대응형 레시피의 «아이템 배지 묶음» 판정 — 순수 함수 (티켓 20261114_1705 2회차)
 *
 * 묶음은 같은 컬렉션(`item_book_id`)·같은 이름의 아이템 배지다. 4등급(common·rare·epic·mystic)이 한 개씩 모두 있어야
 * 등급 대응형 레시피의 재료·보상으로 쓸 수 있다. 등급 대응형 레시피는 슬롯 후보와 보상에 묶음의 4등급 배지 id를 전부 담는다
 * (마이그레이션 341 머리말, `lib/combine/gradeMode.ts`). 어드민 양식(후보 검색)과 저장 API(검증)가 이 파일 하나를 쓴다.
 *
 * 컬렉션이 없는 아이템 배지(`item_book_id`가 비어 있음)는 같은 이름이어도 같은 묶음이라고 말할 수 없어 묶음으로 보지 않는다.
 * 같은 등급에 배지가 둘 이상이면(데이터 중복) 어느 배지가 그 등급의 결과인지 정할 수 없어 «4등급이 갖춰지지 않은 묶음»으로 본다.
 */
import type { BadgeRarity } from '@/types/database'

/** 묶음 안의 등급 순서 — 저장할 때 id도 이 순서로 담는다(341과 같다). */
export const GRADE_ORDER: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

const GRADE_LABEL: Record<BadgeRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

function gradeLabel(rarity: BadgeRarity): string {
  return GRADE_LABEL[rarity]
}

/** 묶음을 가르는 데 쓰는 배지 한 줄 */
export interface BundleBadgeInput {
  id: string
  name: string
  rarity: string | null
  item_book_id: string | null
}

export interface ItemBadgeBundle {
  /** `item_book_id:name` — 묶음 식별자 */
  key: string
  itemBookId: string
  name: string
  /** 등급별 배지 id. 등급에 배지가 없으면 칸이 없다. 같은 등급에 둘 이상이면 `duplicateGrades`에 든다(첫 배지만 담는다). */
  idsByGrade: Partial<Record<BadgeRarity, string>>
  /** 4등급이 한 개씩 모두 있는가. 이 값이 참이어야 등급 대응형 레시피에서 고를 수 있다. */
  complete: boolean
  missingGrades: BadgeRarity[]
  duplicateGrades: BadgeRarity[]
  /** 묶음에 든 모든 배지 id(등급 무관, 중복 포함) */
  memberIds: string[]
}

export function bundleKey(itemBookId: string, name: string): string {
  return `${itemBookId}:${name}`
}

function isGrade(value: string | null): value is BadgeRarity {
  return value !== null && (GRADE_ORDER as readonly string[]).includes(value)
}

/** 배지 목록을 «컬렉션 + 이름» 묶음으로 나눈다. 컬렉션이 없는 배지·등급이 없는 배지는 묶음 구성원으로 세지 않는다(등급 없는 배지는 묶음을 불완전하게 만들지도 않는다). 입력 순서로 묶음 순서가 정해진다. */
export function groupItemBadgeBundles(badges: readonly BundleBadgeInput[]): ItemBadgeBundle[] {
  const byKey = new Map<string, ItemBadgeBundle>()
  for (const badge of badges) {
    if (!badge.item_book_id) continue
    const key = bundleKey(badge.item_book_id, badge.name)
    let bundle = byKey.get(key)
    if (!bundle) {
      bundle = {
        key,
        itemBookId: badge.item_book_id,
        name: badge.name,
        idsByGrade: {},
        complete: false,
        missingGrades: [],
        duplicateGrades: [],
        memberIds: [],
      }
      byKey.set(key, bundle)
    }
    bundle.memberIds.push(badge.id)
    if (!isGrade(badge.rarity)) continue
    if (bundle.idsByGrade[badge.rarity] === undefined) bundle.idsByGrade[badge.rarity] = badge.id
    else if (!bundle.duplicateGrades.includes(badge.rarity)) bundle.duplicateGrades.push(badge.rarity)
  }
  for (const bundle of byKey.values()) {
    bundle.missingGrades = GRADE_ORDER.filter((g) => bundle.idsByGrade[g] === undefined)
    bundle.complete = bundle.missingGrades.length === 0 && bundle.duplicateGrades.length === 0
  }
  return [...byKey.values()]
}

/** 완비된 묶음의 4등급 배지 id를 common → mystic 순서로 돌려준다. 완비되지 않았으면 빈 배열이다. */
export function bundleBadgeIds(bundle: ItemBadgeBundle): string[] {
  if (!bundle.complete) return []
  return GRADE_ORDER.map((g) => bundle.idsByGrade[g] as string)
}

/** 완비되지 않은 이유를 어드민 문장으로 쓴다(양식의 후보 목록 표시용). */
export function incompleteBundleReason(bundle: ItemBadgeBundle): string {
  if (bundle.complete) return ''
  const parts: string[] = []
  if (bundle.missingGrades.length > 0) parts.push(`${bundle.missingGrades.map(gradeLabel).join('·')} 등급이 없어요`)
  if (bundle.duplicateGrades.length > 0) parts.push(`${bundle.duplicateGrades.map(gradeLabel).join('·')} 등급이 둘 이상이에요`)
  return parts.join(', ')
}

/**
 * 등급 대응형 레시피에 담긴 배지 id 목록이 «완비된 묶음의 4등급 배지 전부»로만 이루어졌는지 본다.
 * 어긋나면 어드민 문장의 오류를 돌려준다. `badgeById`는 담긴 id와 그 묶음의 형제 배지를 모두 포함해야 한다.
 * `where`는 오류 문장 앞머리에 붙는 자리 이름이다(예: «슬롯 2», «보상»).
 */
export function findBundleViolation(
  ids: readonly string[],
  allBundles: readonly ItemBadgeBundle[],
  badgeById: ReadonlyMap<string, BundleBadgeInput>,
  where: string
): string | null {
  const bundleByKey = new Map(allBundles.map((b) => [b.key, b]))
  const idSet = new Set(ids)
  for (const id of ids) {
    const badge = badgeById.get(id)
    if (!badge || !badge.item_book_id) {
      return `${where}에 컬렉션에 속하지 않은 아이템 배지가 있어요. 등급 대응형 레시피에는 컬렉션의 아이템 배지만 쓸 수 있어요. 다른 배지를 선택해 주세요.`
    }
    const key = bundleKey(badge.item_book_id, badge.name)
    const bundle = bundleByKey.get(key)
    if (!bundle || !bundle.complete) {
      const reason = bundle ? incompleteBundleReason(bundle) : '배지 정보를 찾지 못했어요'
      return `${where}의 «${badge.name}» 배지 묶음을 쓸 수 없어요(${reason}). 등급 대응형 레시피에는 4등급이 모두 갖춰진 묶음만 쓸 수 있어요. 다른 묶음을 선택해 주세요.`
    }
    if (bundleBadgeIds(bundle).some((memberId) => !idSet.has(memberId))) {
      return `${where}의 «${badge.name}» 배지 묶음에 4등급 배지가 모두 담기지 않았어요. 등급 대응형 레시피는 묶음의 4등급 배지를 전부 담아야 해요. 묶음 단위로 다시 선택해 주세요.`
    }
    // 묶음에 들었지만 4등급 자리에 해당하지 않는 배지(등급이 없는 배지)는 담을 수 없다.
    if (!bundleBadgeIds(bundle).includes(id)) {
      return `${where}의 «${badge.name}» 배지는 등급이 없어 등급 대응형 레시피에 쓸 수 없어요. 4등급이 모두 갖춰진 묶음의 배지만 선택해 주세요.`
    }
  }
  return null
}
