/**
 * «JAM! 시작하기» 카드 문구 사전 (티켓 20261021_1248 2회, 운영 로직 2.2절, UX 라이팅 가이드 §1.3·§3)
 *
 * 고정하는 것:
 * - 유저 화면 문구 사전 `d` 어디에도 «퀘스트»가 없다. 예외는 관리자 전용 미리보기 띠(`d.onboardingQuest.preview`)뿐이다.
 * - 카드 문구(`chipLabel`·`cardLabel`·`progress`·`real`·`skip`·연출 단계 이름)에는 «연습»·«과제»·«가이드»·«튜토리얼»·«온보딩»이 없다.
 * - 카드 안 버튼 문구에는 «시작하기»가 없다(칩 이름 «JAM! 시작하기»·완료 배지 이름 「JAM!」과 겹치지 않게).
 * - 새로 쓴 문구(`real`)는 한 문장이면 마침표가 없고 두 문장 이상이면 마침표로 끝난다. 엠대시와 이모지가 없다.
 * - 사용자가 정한 이름·라벨이 글자 그대로 들어 있다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/i18n/__tests__/onboarding-quest-copy.test.ts
 */
import { describe, expect, it } from 'vitest'
import { d } from '@/lib/i18n'

interface Entry {
  path: string
  text: string
}

function collectStrings(node: unknown, path: string, out: Entry[]): void {
  if (typeof node === 'string') {
    out.push({ path, text: node })
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collectStrings(value, path ? `${path}.${key}` : key, out)
  }
}

const all: Entry[] = []
collectStrings(d, 'd', all)

const card: Entry[] = []
collectStrings(d.onboardingQuest, 'd.onboardingQuest', card)
// 관리자 전용 미리보기 띠는 카드 문구가 아니다
const cardCopy = card.filter((e) => !e.path.startsWith('d.onboardingQuest.preview.'))

const real: Entry[] = []
collectStrings(d.onboardingQuest.real, 'd.onboardingQuest.real', real)

describe('유저 화면 문구 사전 — «퀘스트»', () => {
  it('«퀘스트»는 관리자 미리보기 띠에만 있다', () => {
    const found = all.filter((e) => e.text.includes('퀘스트')).map((e) => e.path)
    expect(found.sort()).toEqual(['d.onboardingQuest.preview.doneLabel', 'd.onboardingQuest.preview.stepLabel'])
  })
})

describe('«JAM! 시작하기» 카드 문구', () => {
  it('사용자가 정한 이름과 구역 라벨이 그대로다', () => {
    expect(d.onboardingQuest.chipLabel).toBe('JAM! 시작하기')
    expect(d.onboardingQuest.progress.demo).toBe('미리 해보기 {done}/{total}')
    expect(d.onboardingQuest.progress.real).toBe('내 활동으로 {done}/{total}')
    expect(d.onboardingQuest.real.steps).toEqual({ sync: 'Strava 동기화', capsule: '캡슐 열기', locked: '잠긴 아이템 배지 열기' })
    expect(d.onboardingQuest.skip.entryLabel).toBe('미리 해보기 건너뛰기')
  })

  it('금지어(연습·과제·가이드·튜토리얼·온보딩)가 없다', () => {
    for (const banned of ['연습', '과제', '가이드', '튜토리얼', '온보딩']) {
      const found = cardCopy.filter((e) => e.text.includes(banned)).map((e) => `${e.path}: ${e.text}`)
      expect(found, `«${banned}»가 들어 있는 문구:\n${found.join('\n')}`).toEqual([])
    }
  })

  it('카드 안 버튼 문구에 «시작하기»가 없다', () => {
    const buttons = [
      d.onboardingQuest.continueButton,
      d.onboardingQuest.skip.entryLabel,
      d.onboardingQuest.skip.keepGoingButton,
      d.onboardingQuest.skip.skipButton,
      d.onboardingQuest.real.sync.connectCta,
      d.onboardingQuest.real.capsule.fillCta,
      d.onboardingQuest.real.capsule.openCta,
      d.onboardingQuest.real.locked.cta,
      d.capsule.sheet.inventoryLink,
      d.today.syncButton,
    ]
    for (const label of buttons) expect(label).not.toContain('시작하기')
  })

  it('새 문구(real)는 한 문장이면 마침표가 없고 두 문장 이상이면 마침표로 끝난다', () => {
    for (const entry of real) {
      const sentences = entry.text.split(/(?<=[.!?])\s+/).filter(Boolean)
      if (sentences.length >= 2) {
        expect(entry.text.endsWith('.'), `${entry.path}: 두 문장 이상인데 마침표로 끝나지 않는다 — ${entry.text}`).toBe(true)
      } else {
        expect(entry.text.endsWith('.'), `${entry.path}: 한 문장인데 마침표가 있다 — ${entry.text}`).toBe(false)
      }
    }
  })

  it('엠대시와 이모지가 없다', () => {
    for (const entry of cardCopy) {
      expect(entry.text, entry.path).not.toContain('—')
      expect(/\p{Extended_Pictographic}/u.test(entry.text), `${entry.path}: 이모지`).toBe(false)
    }
  })

  it('건너뛰기 확인 시트 본문은 «JAM! 배지»와 «100 포인트»를 말하고 «퀘스트 클리어»·«100포인트»는 없다', () => {
    const body = d.onboardingQuest.skip.confirmBody
    expect(body).toContain('JAM! 배지')
    expect(body).toContain('100 포인트')
    expect(body).not.toContain('퀘스트 클리어')
    expect(body).not.toContain('100포인트')
  })

  it('잼 안내는 «잼 {n}만큼»처럼 받침이 갈리는 조사를 피하고 열기를 부추기지 않는다', () => {
    const shortage = d.onboardingQuest.real.shortage.capsule
    expect(shortage).toBe('잼이 모자라요. 가진 잼 {have}만큼, 필요한 잼은 {need}만큼이에요. 새 활동을 동기화하면 잼을 더 받아요.')
    for (const entry of real) {
      expect(entry.text, entry.path).not.toContain('한 번만 더')
      expect(entry.text, entry.path).not.toContain('곧 좋은 게')
    }
  })
})
