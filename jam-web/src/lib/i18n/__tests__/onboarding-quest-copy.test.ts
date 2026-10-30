/**
 * «JAM! 시작하기» 카드 문구 사전 (티켓 20261021_1248 2회 · 2단계·포인트 기준 20261028_1738 1회, 운영 로직 2.2절, UX 라이팅 가이드 §1.3·§3)
 *
 * 고정하는 것:
 * - 유저 화면 문구 사전 `d` 어디에도 «퀘스트»가 없다. 예외는 관리자 전용 미리보기 띠(`d.onboardingQuest.preview`)와, 사용자가 직접 정한 건너뛰기 확인 문장
 *   (`d.onboardingQuest.skip.confirmBody`, 티켓 20261028_1738)뿐이다.
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
  it('«퀘스트»는 관리자 미리보기 띠와 사용자가 정한 건너뛰기 확인 문장에만 있다', () => {
    const found = all.filter((e) => e.text.includes('퀘스트')).map((e) => e.path)
    expect(found.sort()).toEqual([
      'd.onboardingQuest.preview.doneLabel',
      'd.onboardingQuest.preview.stepLabel',
      'd.onboardingQuest.skip.confirmBody',
    ])
  })
})

describe('«JAM! 시작하기» 카드 문구', () => {
  it('사용자가 정한 이름과 구역 라벨이 그대로다', () => {
    expect(d.onboardingQuest.chipLabel).toBe('JAM! 시작하기')
    expect(d.onboardingQuest.progress.demo).toBe('미리 해보기 {done}/{total}')
    expect(d.onboardingQuest.progress.real).toBe('내 활동으로 {done}/{total}')
    expect(d.onboardingQuest.real.listLabel).toBe('내 활동으로 2단계')
    expect(d.onboardingQuest.real.steps).toEqual({ sync: 'Strava 동기화', locked: '잠긴 아이템 배지 열기' })
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
      d.onboardingQuest.real.locked.cta,
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

  it('건너뛰기 확인 시트 본문은 사용자가 정한 한 문장이다', () => {
    expect(d.onboardingQuest.skip.confirmBody).toBe('퀘스트를 건너뛸까요?')
  })

  it('② 문구는 사용자가 확정한 그대로다: 개체를 알면 같은 문장, 모르면 «열어 보세요», 버튼은 «인벤토리 가기», 모자람은 «{need} 포인트가 필요해요»', () => {
    expect(d.onboardingQuest.real.locked.description).toBe('잠긴 배지를 열 수 있어요')
    expect(d.onboardingQuest.real.locked.descriptionGeneral).toBe('잠긴 배지를 열어 보세요')
    expect(d.onboardingQuest.real.locked.cta).toBe('인벤토리 가기')
    expect(d.onboardingQuest.real.shortage).toBe('{need} 포인트가 필요해요')
  })

  it('옛 캡슐·잼 안내 문구가 사전에 남아 있지 않고 열기를 부추기지 않는다', () => {
    expect(d.onboardingQuest.real).not.toHaveProperty('capsule')
    // ① 설명의 «잼과 배지»는 판정대로 남는다. 잼 안내가 사라졌는지는 ②와 모자람 문구로 본다
    for (const entry of real.filter((e) => e.path.includes('.locked.') || e.path.includes('.shortage'))) {
      expect(entry.text, entry.path).not.toContain('잼')
    }
    for (const entry of real) {
      expect(entry.text, entry.path).not.toContain('열러 가기')
      expect(entry.text, entry.path).not.toContain('포인트 없이')
      expect(entry.text, entry.path).not.toContain('한 번만 더')
      expect(entry.text, entry.path).not.toContain('곧 좋은 게')
    }
  })
})
