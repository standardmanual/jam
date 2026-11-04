/**
 * 카피 규칙 검사(`copyRules.ts`)의 시험 — 규칙마다 걸리는 문장과 비슷하지만 안 걸리는 문장을 본다(티켓 20261103_1236).
 */
import { describe, expect, it } from 'vitest'
import { collectCopyErrors } from '../copyRules'
import type { CopyField } from '../copyRules'

function hits(field: CopyField, value: string): number {
  return collectCopyErrors('card.', field, value).length
}

describe('collectCopyErrors — 권유 「~하세요」', () => {
  it.each(['30km에 도전해 보세요', '주말에 달리세요', '오늘도 힘내세요'])('%s는 제목·부제·설명 모두에서 걸린다', (text) => {
    expect(hits('title', text)).toBe(1)
    expect(hits('subtitle', text)).toBe(1)
    expect(hits('description', text)).toBe(1)
  })

  it('「해 주세요」 요청 문장은 걸리지 않는다', () => {
    expect(hits('description', '잠시 뒤 새로고침해 주세요')).toBe(0)
  })

  it('「해 봐요」는 걸리지 않는다', () => {
    expect(hits('description', '30km에 도전해 봐요')).toBe(0)
  })

  it('오류 문장에 칸 이름과 대체 문구가 들어간다', () => {
    const [message] = collectCopyErrors('mission.', 'description', '달려 보세요')
    expect(message).toContain('mission.description:')
    expect(message).toContain('~해 봐요')
  })
})

describe('collectCopyErrors — 느낌표(설명만)', () => {
  it.each(['10포인트를 받아요!', '10포인트를 받아요！'])('설명의 %s는 걸린다', (text) => {
    expect(hits('description', text)).toBe(1)
  })

  it('제목·부제의 느낌표는 걸리지 않는다', () => {
    expect(hits('title', '새 역에 가 봐요!')).toBe(0)
    expect(hits('subtitle', '새 역에 가 봐요!')).toBe(0)
  })

  it('느낌표가 없는 설명은 걸리지 않는다', () => {
    expect(hits('description', '새 역 2곳에 체크인하면 포인트를 받아요.')).toBe(0)
  })
})

describe('collectCopyErrors — 「획득」·「보상」으로 끝나는 문장(설명만)', () => {
  it.each(['딱 3번이면 10포인트 획득!', '10포인트 획득', '10포인트 획득.', '10포인트 획득 !', '완료 보상', '완료 보상.', '새 배지 획득. 다음 목표도 있어요'])(
    '설명의 «%s»는 걸린다',
    (text) => {
      expect(collectCopyErrors('card.', 'description', text).some((e) => e.includes('「획득」·「보상」'))).toBe(true)
    }
  )

  it.each(['아이템 배지를 획득해요', '획득한 배지를 모아 봐요', '보상을 받아요', '획득 후에 확인해요'])('설명의 «%s»는 걸리지 않는다', (text) => {
    expect(hits('description', text)).toBe(0)
  })

  it('제목·부제는 이 규칙을 적용하지 않는다', () => {
    expect(hits('title', '완료 보상')).toBe(0)
    expect(hits('subtitle', '배지 획득')).toBe(0)
  })
})

describe('collectCopyErrors — 미션 설명의 보상(미션 설명만)', () => {
  const missionHits = (field: CopyField, value: string) =>
    collectCopyErrors('mission.', field, value).filter((e) => e.includes('미션 설명에는 보상을 쓰지 않아요')).length

  it.each(['동기화하면 10포인트를 받아요', '아이템 배지를 놓으면 100잼이 쌓여요', '1,000 포인트를 모아 봐요', '완료하면 보상이 있어요'])(
    '미션 설명의 «%s»는 걸린다',
    (text) => {
      expect(missionHits('description', text)).toBe(1)
    }
  )

  it('오류 문장에 칸 이름과 고치는 방향이 들어간다', () => {
    const [message] = collectCopyErrors('mission.', 'description', '10포인트를 받아요')
    expect(message).toContain('mission.description: 미션 설명에는 보상을 쓰지 않아요.')
    expect(message).toContain('유저 입장의 장면')
  })

  it.each(['아이템 배지를 한 번 놓아 봐요', '포인트 지갑을 열어 봐요', '잼 한 병을 나눠 봐요'])('숫자 없는 «%s»는 걸리지 않는다', (text) => {
    expect(missionHits('description', text)).toBe(0)
  })

  it('미션 제목·부제는 이 규칙을 적용하지 않는다', () => {
    expect(missionHits('title', '10포인트')).toBe(0)
    expect(missionHits('subtitle', '보상 안내')).toBe(0)
  })

  it('카드 설명은 영향받지 않는다', () => {
    expect(hits('description', '동기화하면 10포인트를 받아요')).toBe(0)
    expect(hits('description', '완료하면 100잼이 쌓여요')).toBe(0)
    expect(hits('description', '보상을 받아요')).toBe(0)
  })
})

describe('collectCopyErrors — 쓰지 않는 말', () => {
  it.each([
    ['도장', '도장을 찍어 봐요'],
    ['500m', '500m 안에 들어가 봐요'],
    ['500 미터', '500미터 안에 들어가 봐요'],
    ['장소 배지', '장소 배지를 모아 봐요'],
    ['POI 배지', 'POI 배지를 모아 봐요'],
    ['지점 배지', '지점 배지를 모아 봐요'],
    ['방문 배지', '방문 배지를 모아 봐요'],
    ['발견', '새 역을 발견해 봐요'],
    ['찾아서', '새 역을 찾아서 가 봐요'],
    ['이웃', '이웃과 함께 달려 봐요'],
  ])('%s: «%s»는 제목·부제·설명 모두에서 걸린다', (_term, text) => {
    expect(hits('title', text)).toBe(1)
    expect(hits('subtitle', text)).toBe(1)
    expect(hits('description', text)).toBe(1)
  })

  it.each(['10km를 달려 봐요', '500원을 받아요', '1,500m를 달려 봐요', '5000m를 달려 봐요', '500mg을 먹어 봐요', '체크인 배지를 모아 봐요', '배지를 획득해요'])(
    '비슷하지만 «%s»는 걸리지 않는다',
    (text) => {
      expect(hits('title', text)).toBe(0)
      expect(hits('description', text)).toBe(0)
    }
  )
})

describe('collectCopyErrors — 조건을 요약한 제목(제목만)', () => {
  it.each(['새 역 체크인 2곳', '겨울 앞두고 걷기 3번', '걸어서 10km', '산 체크인 한 곳', '이번 주 산 체크인 한 곳', '새 장소 체크인', '입동 주간, 새 장소 체크인'])(
    '«%s»는 제목에서 걸린다',
    (text) => {
      expect(hits('title', text)).toBe(1)
    }
  )

  it.each([
    '지하철 역에서 만나는 행운',
    '쌀쌀한 날의 짧은 산책',
    '걷다 보면 어느새 10km',
    '처음 오른 산에서의 한 걸음',
    '주말엔 한 번',
    '10km',
    '활동 두 번이면 충분해요',
    '걸어서 채워 볼까요',
    '산에서 보내는 하루',
    '오늘은 입동이에요',
    '인벤토리가 꽉 찼다면 하나 드랍하고 가요',
    '드랍하고',
    '픽업하고',
    '이어가기',
    '입동 주간',
    '처음 가는 곳으로',
    // 쉼표가 들어간 제목은 원문 그대로도 시험한다(쉼표로 쪼갠 조각만 시험하면 원문이 빠진다)
    '주말엔 한 번, 10km',
    '10km, 걸어서 채워 볼까요',
    '드랍하고, 픽업하고, 이어가기',
    '입동 주간, 처음 가는 곳으로',
  ])('«%s»는 제목에서 걸리지 않는다', (text) => {
    expect(hits('title', text)).toBe(0)
  })

  it('부제·설명에는 이 규칙을 적용하지 않는다', () => {
    expect(hits('subtitle', '새 역 체크인 2곳')).toBe(0)
    expect(hits('description', '새 역 체크인 2곳')).toBe(0)
  })

  it('오류 문장에 칸 이름과 고치는 방향이 들어간다', () => {
    const [message] = collectCopyErrors('mission.', 'title', '새 역 체크인 2곳')
    expect(message).toContain('mission.title: 제목이 조건을 요약한 말처럼 읽혀요.')
    expect(message).toContain('지하철 역에서 만나는 행운')
    expect(message).toContain('§2.6')
  })
})

describe('collectCopyErrors — 입력 처리', () => {
  it('문자열이 아닌 값은 빈 배열을 돌려준다', () => {
    expect(collectCopyErrors('card.', 'title', undefined)).toEqual([])
    expect(collectCopyErrors('card.', 'title', 123)).toEqual([])
  })

  it('한 문구가 여러 규칙에 걸리면 규칙마다 오류를 낸다', () => {
    expect(collectCopyErrors('card.', 'description', '도장을 찍어 보세요!')).toHaveLength(3)
  })
})
