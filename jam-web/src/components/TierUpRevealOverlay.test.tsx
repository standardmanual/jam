/**
 * 등급 올리기 결과 연출 오버레이 (티켓 20261112_2141)
 *
 * 저장소에 jsdom이 없어(vitest `environment: 'node'`) 두 갈래로 시험한다.
 *  - 마크업: `TierUpRevealStage`를 서버 렌더해 배경 스타일·접근성 속성·문구 줄을 본다(포털과 마운트 게이트는 `TierUpRevealOverlay`에만 있다).
 *  - 타임라인: `playTierUpReveal`에 가짜 요소(`animate`가 가짜 애니메이션을 돌려준다)와 가짜 타이머를 넣어 단계 시간·취소·모션 줄이기를 본다.
 * 실제 재생의 부드러움과 슬롯 실좌표는 브라우저에서만 확인된다.
 *
 * 실행: cd jam-web && npx vitest run src/components/TierUpRevealOverlay.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  STAGE_BACKGROUND,
  TIMING,
  TierUpRevealStage,
  buildRevealLines,
  measureTierUpMaterials,
  playTierUpReveal,
  type RevealTargets,
  type TierUpRevealMaterial,
  type TierUpRevealResult,
} from '@/components/TierUpRevealOverlay'
import { d } from '@/lib/i18n'

const MATERIALS: TierUpRevealMaterial[] = [0, 1, 2, 3, 4, 5].map((slot) => ({
  slot,
  imageUrl: `https://example.com/m${slot}.png`,
  rect: { left: 20 + slot * 10, top: 100, width: 72, height: 72 },
}))

const RESULT: TierUpRevealResult = {
  name: '새벽 러너의 신발',
  rarity: 'epic',
  imageUrl: 'https://example.com/result.png',
  description: '첫 번째 문장입니다. 두 번째 문장입니다.',
}

const render = (result: TierUpRevealResult = RESULT, materials = MATERIALS) =>
  renderToStaticMarkup(<TierUpRevealStage materials={materials} result={result} onConfirm={() => {}} />)

describe('마크업', () => {
  it('배경은 중심이 밝은 원형 그라데이션이고 글로우·그림자·필터가 어디에도 없다', () => {
    expect(STAGE_BACKGROUND).toContain('radial-gradient(circle farthest-corner at 50% 42%')
    expect(STAGE_BACKGROUND).toContain('#343434 0%')
    expect(STAGE_BACKGROUND).toContain('#1a1a1a 38%')
    const html = render()
    expect(html).toContain('background:radial-gradient(circle farthest-corner at 50% 42%')
    for (const forbidden of ['box-shadow', 'drop-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode', 'glow']) {
      expect(html, forbidden).not.toContain(forbidden)
    }
  })

  it('대화창으로 열리고 z-index가 BadgeRevealOverlay와 같은 60이며 이름은 사전 키에서 온다', () => {
    const html = render()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain(`aria-label="${d.combine.tierUp.reveal.ariaLabel}"`)
    expect(html).toContain('z-index:60')
    expect(html).toContain('tabindex="-1"')
  })

  it('이름과 설명 문장이 한 줄씩 따로 나오고, 등급 칩은 Common이 아니면 그린다', () => {
    const html = render()
    expect(html).toContain('>새벽 러너의 신발</p>')
    expect(html).toContain('>첫 번째 문장입니다.</p>')
    expect(html).toContain('>두 번째 문장입니다.</p>')
    expect(html).toContain('Epic')
    expect(html).toContain('aria-live="polite"')
    expect(html.match(/data-reveal="item"/g)).toHaveLength(4) // 칩 + 이름 + 문장 2
    expect(html).toContain('break-keep wrap-break-word text-balance')
  })

  it('Common은 칩이 없다', () => {
    const html = render({ ...RESULT, rarity: 'common' })
    expect(html).not.toContain('Common')
    expect(html.match(/data-reveal="item"/g)).toHaveLength(3)
  })

  it.each([null, undefined, '', '   '])('설명이 %j이면 문장 줄 없이 칩과 이름까지만 나온다', (description) => {
    const html = render({ ...RESULT, description })
    expect(html).toContain('>새벽 러너의 신발</p>')
    expect(html.match(/data-reveal="item"/g)).toHaveLength(2)
  })

  it('확인 버튼은 나오기 전에는 숨김이고 보조기술·포인터에서 빠진다', () => {
    const html = render()
    const wrapper = /<div data-reveal="button"[^>]*>/.exec(html)?.[0] ?? ''
    expect(wrapper).toContain('aria-hidden="true"')
    expect(wrapper).toContain('inert')
    expect(wrapper).toContain('opacity:0')
    expect(html).toContain(`>${d.combine.tierUp.reveal.confirm}</button>`)
  })

  it('재료는 받은 개수만큼만 그리고 그림 주소가 없는 칸은 호출부가 거른 대로 건너뛴다', () => {
    const html = render(RESULT, MATERIALS.filter((m) => m.slot !== 2))
    expect(html.match(/data-reveal="material"/g)).toHaveLength(5)
  })

  it('로고는 폭이 좌우 16px을 뺀 전체이고 비율 2610:865를 유지하며 필터·블렌드가 없다', () => {
    const html = render()
    expect(html).toContain('/jam-logo-white.png')
    expect(html).toContain('aspect-ratio:2610 / 865')
    expect(html).toContain('left:var(--spacing-16);right:var(--spacing-16)')
  })
})

describe('buildRevealLines', () => {
  it('설명을 마침표 기준 문장 줄로 나누고 소수점은 자르지 않는다', () => {
    const lines = buildRevealLines({ name: '이름', rarity: 'rare', description: '42.195를 달렸어요. 끝까지요.' })
    expect(lines.sentences).toEqual(['42.195를 달렸어요.', '끝까지요.'])
    expect(lines.chipRarity).toBe('rare')
  })

  it('등급이 없거나 Common이면 칩이 없다', () => {
    expect(buildRevealLines({ name: '이름', rarity: null }).chipRarity).toBeNull()
    expect(buildRevealLines({ name: '이름', rarity: 'common' }).chipRarity).toBeNull()
    expect(buildRevealLines({ name: '이름' }).sentences).toEqual([])
  })
})

describe('measureTierUpMaterials', () => {
  it('브라우저 밖에서는 빈 목록이다', () => {
    expect(measureTierUpMaterials(['https://example.com/a.png'])).toEqual([])
  })
})

/* ── 타임라인 ── */

interface FakeAnimation {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancelled: boolean
  finished: Promise<void>
  cancel: () => void
}

function fakeElement(name: string) {
  const animations: FakeAnimation[] = []
  const el = {
    name,
    animations,
    hidden: false,
    style: { willChange: '' } as Record<string, string>,
    clientHeight: 780,
    getBoundingClientRect: () => ({ left: 100, top: 400, width: 72, height: 72 }),
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let reject: (reason?: unknown) => void = () => {}
      const animation: FakeAnimation = {
        keyframes,
        options,
        cancelled: false,
        finished: new Promise<void>((resolve, rej) => {
          reject = rej
          setTimeout(resolve, Number(options.delay ?? 0) + Number(options.duration ?? 0))
        }),
        cancel() {
          animation.cancelled = true
          reject(new DOMException('cancelled', 'AbortError'))
        },
      }
      animations.push(animation)
      return animation
    },
  }
  return el
}

function fakeTargets(itemCount: number) {
  const materials = Array.from({ length: 6 }, (_, i) => fakeElement(`material${i}`))
  const items = Array.from({ length: itemCount }, (_, i) => fakeElement(`item${i}`))
  const all = {
    root: fakeElement('root'),
    background: fakeElement('background'),
    materials,
    logo: fakeElement('logo'),
    badge: fakeElement('badge'),
    items,
    button: fakeElement('button'),
  }
  const flat = [all.background, ...materials, all.logo, all.badge, ...items, all.button]
  return { all, targets: all as unknown as RevealTargets, flat }
}

describe('타임라인 (프로토타입 v7 시간)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const start = (itemCount: number, reducedMotion = false) => {
    const fake = fakeTargets(itemCount)
    const onReady = vi.fn()
    const timeline = playTierUpReveal(fake.targets, { reducedMotion, slots: [0, 1, 2, 3, 4, 5], onReady })
    return { ...fake, onReady, timeline }
  }

  it('0ms에 배경 500ms 페이드인이 걸리고, 600ms에 로고와 재료 6개가 움직인다', async () => {
    const { all } = start(3)
    expect(all.background.animations).toHaveLength(1)
    expect(all.background.animations[0].options).toMatchObject({ duration: 500, easing: 'ease-out' })
    expect(all.logo.animations).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(599)
    expect(all.logo.animations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(all.logo.animations).toHaveLength(1)
    expect(all.logo.animations[0].options).toMatchObject({ duration: 300, easing: 'ease-out' })
    all.materials.forEach((el, i) => {
      expect(el.animations).toHaveLength(1)
      expect(el.animations[0].options).toMatchObject({ delay: 150 + i * 80, duration: 720, easing: 'cubic-bezier(.55,0,.75,.4)' })
    })
  })

  it('재료는 로고 중심으로 모이며 작아지고 로고 뒤에 있다(DOM 순서는 마크업 시험이 본다)', async () => {
    const { all } = start(3)
    await vi.advanceTimersByTimeAsync(600)
    const frames = all.materials[0].animations[0].keyframes
    expect(frames).toHaveLength(3)
    expect(frames[1]).toMatchObject({ opacity: 1, offset: 0.92 })
    expect(String(frames[1].transform)).toContain('scale(0.08)')
    expect(frames[2]).toMatchObject({ opacity: 0 })
  })

  it('로고 펄스 → 380ms 대기 → 3단계 520ms, 600ms 뒤 결과 배지 650ms 팝업', async () => {
    const { all } = start(3)
    await vi.advanceTimersByTimeAsync(600 + 1270)
    expect(all.logo.animations).toHaveLength(2) // 입장 + 펄스
    expect(all.logo.animations[1].options).toMatchObject({ duration: 260, easing: 'ease-out' })

    await vi.advanceTimersByTimeAsync(260 + 380 - 1)
    expect(all.logo.animations).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(all.logo.animations).toHaveLength(3)
    const out = all.logo.animations[2]
    expect(out.options).toMatchObject({ duration: 520, easing: 'cubic-bezier(.6,0,.8,.3)' })
    expect(out.keyframes[1]).toMatchObject({ offset: 0.7, opacity: 1 })
    expect(String(out.keyframes[1].transform)).toContain('scale(8)')
    expect(String(out.keyframes[2].transform)).toContain('scale(11)')
    expect(out.keyframes[2]).toMatchObject({ opacity: 0 })

    expect(all.badge.animations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(600)
    expect(all.badge.animations).toHaveLength(1)
    expect(all.badge.animations[0].options).toMatchObject({ duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' })
    expect(all.badge.animations[0].keyframes[1]).toMatchObject({ offset: 0.65 })
  })

  it('문구는 i번째가 i*650ms 뒤에 700ms 동안 나오고, 마지막 항목 뒤 250ms에 확인 버튼이 나온다', async () => {
    const { all, onReady } = start(3)
    const itemsStart = 600 + 1270 + 260 + 380 + 600 + 850
    await vi.advanceTimersByTimeAsync(itemsStart)
    all.items.forEach((el, i) => {
      expect(el.animations).toHaveLength(1)
      expect(el.animations[0].options).toMatchObject({ delay: i * 650, duration: 700, easing: 'ease-out' })
      expect(el.animations[0].keyframes[0]).toMatchObject({ opacity: 0, transform: 'translateY(-14px)' })
    })
    const wait = 2 * 650 + 700 + 250
    await vi.advanceTimersByTimeAsync(wait - 1)
    expect(onReady).not.toHaveBeenCalled()
    expect(all.button.animations).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(all.button.animations).toHaveLength(1)
    expect(all.button.animations[0].options).toMatchObject({ duration: 500, easing: 'ease-out' })
  })

  it('확인: 380ms 페이드 → 420ms 대기 → 배경 450ms 페이드, 끝나면 풀린다', async () => {
    const { all, timeline } = start(2)
    await vi.advanceTimersByTimeAsync(600 + 1270 + 260 + 380 + 600 + 850 + 650 + 700 + 250)
    const done = vi.fn()
    void timeline.exit().then(done)
    expect(all.button.animations.at(-1)?.options).toMatchObject({ duration: 380, easing: 'ease-in' })
    expect(all.badge.animations.at(-1)?.options).toMatchObject({ duration: 380, easing: 'ease-in' })
    all.items.forEach((el) => expect(el.animations.at(-1)?.options).toMatchObject({ duration: 380, easing: 'ease-in' }))
    const backgroundCount = all.background.animations.length

    await vi.advanceTimersByTimeAsync(380 + 419)
    expect(all.background.animations).toHaveLength(backgroundCount)
    await vi.advanceTimersByTimeAsync(1)
    expect(all.background.animations).toHaveLength(backgroundCount + 1)
    expect(all.background.animations.at(-1)?.options).toMatchObject({ duration: 450, easing: 'ease-out' })
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(450)
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('중간에 취소하면 모든 애니메이션이 취소되고 이후 단계가 걸리지 않는다', async () => {
    const { all, flat, onReady, timeline } = start(3)
    await vi.advanceTimersByTimeAsync(700)
    timeline.cancel()
    const created = flat.flatMap((el) => el.animations)
    expect(created.length).toBeGreaterThan(0)
    expect(created.every((a) => a.cancelled)).toBe(true)

    const before = flat.map((el) => el.animations.length)
    await vi.advanceTimersByTimeAsync(20000)
    expect(flat.map((el) => el.animations.length)).toEqual(before)
    expect(onReady).not.toHaveBeenCalled()
    expect(all.button.animations).toHaveLength(0)
    flat.forEach((el) => expect(el.style.willChange).toBe(''))
  })

  it('취소는 여러 번 불러도 되고, 닫는 연출 중 취소하면 닫힘 뒤처리가 불리지 않는다', async () => {
    const { timeline } = start(1)
    await vi.advanceTimersByTimeAsync(600 + 1270 + 260 + 380 + 600 + 850 + 700 + 250)
    const done = vi.fn()
    void timeline.exit().then(done)
    await vi.advanceTimersByTimeAsync(100)
    timeline.cancel()
    timeline.cancel()
    await vi.advanceTimersByTimeAsync(5000)
    expect(done).not.toHaveBeenCalled()
  })

  it('연출 시작에 will-change를 켜고 확인 버튼이 나올 때 끈다', async () => {
    const { all, flat } = start(1)
    flat.forEach((el) => expect(el.style.willChange).toBe('transform, opacity'))
    await vi.advanceTimersByTimeAsync(600 + 1270 + 260 + 380 + 600 + 850 + 700 + 250)
    flat.forEach((el) => expect(el.style.willChange).toBe(''))
    expect(all.button.animations).toHaveLength(1)
  })

  describe('모션 줄이기', () => {
    it('크기·위치 변화 없이 페이드만 쓰고, 재료는 보이지 않으며, 문구는 동시에 나오고 확인 버튼이 바로 나온다', async () => {
      const { all, flat, onReady } = start(3, true)
      expect(all.materials.every((el) => el.hidden)).toBe(true)
      await vi.advanceTimersByTimeAsync(TIMING.reduced.fade * 2)
      expect(onReady).toHaveBeenCalledTimes(1)

      const created = flat.flatMap((el) => el.animations)
      for (const animation of created) {
        for (const frame of animation.keyframes) {
          expect(Object.keys(frame)).toEqual(['opacity'])
        }
      }
      // 문구와 배지가 같은 시각(지연 없음)에 걸린다
      for (const el of [all.badge, ...all.items]) {
        expect(el.animations).toHaveLength(1)
        expect(el.animations[0].options.delay).toBeUndefined()
      }
      expect(all.logo.animations).toHaveLength(0)
      expect(all.button.animations[0].options.duration).toBe(0)
    })

    it('닫을 때도 페이드만 쓴다', async () => {
      const { all, timeline } = start(2, true)
      await vi.advanceTimersByTimeAsync(TIMING.reduced.fade * 2)
      const done = vi.fn()
      void timeline.exit().then(done)
      await vi.advanceTimersByTimeAsync(TIMING.reduced.fade * 2)
      expect(done).toHaveBeenCalledTimes(1)
      for (const animation of all.background.animations) {
        for (const frame of animation.keyframes) expect(Object.keys(frame)).toEqual(['opacity'])
      }
    })
  })
})
