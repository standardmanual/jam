import {
  AURA_BASE_COLOR,
  AURA_BLUR_DETAIL_PX,
  AURA_GRAIN,
  auraGrainImage,
  auraLayers,
  resolveAuraColors,
} from '@/lib/badgeAura'

/**
 * 배지 Aura 배경 — 이미지 대표색으로 깐 세로 그라데이션 두 겹 + 입자 (티켓 20261119_1653)
 *
 * 부모(카드)의 `relative overflow-hidden rounded-*` 안에 `absolute inset-0`으로 깔린다. 훅이 없는 순수 컴포넌트라
 * 서버·클라이언트 어디서나 쓴다(`'use client'` 없음). 상세 히어로 카드와 목록 카드(티켓 20261119_1654)가 함께 쓴다.
 *
 * 격리: 루트가 `isolate`로 쌓임 맥락을 만들어 `multiply`·`soft-light` 블렌드가 카드 밖으로 새지 않게 한다.
 * 모서리는 `rounded-[inherit]` + `overflow-hidden`으로 부모를 따른다. 레이어는 카드 크기 그대로(`inset: 0`)라
 * 블러가 가장자리를 연하게 만든다 — 사용자가 확정한 모양이다.
 * `will-change`는 쓰지 않는다(정적 면에 상시 레이어 승격은 메모리만 먹는다).
 *
 * `colors`가 `[]`이면 청회색 대체색, hex가 아닌 값이 섞였으면 아무것도 그리지 않는다(`resolveAuraColors`).
 */
interface BadgeAuraBackgroundProps {
  /** `badges.bg_colors` 값. 밝기 높은 순 hex, 3색 미만이면 색상을 돌려 채운다 */
  colors: string[]
  /** 레이어 블러 반경(px). 기본은 상세 화면 값이고, 작은 면은 호출부가 줄여 넘긴다 */
  blurPx?: number
  /** 입자(질감) 겹을 그릴지. 기본 true */
  grain?: boolean
}

export default function BadgeAuraBackground({ colors, blurPx = AURA_BLUR_DETAIL_PX, grain = true }: BadgeAuraBackgroundProps) {
  const resolved = resolveAuraColors(colors)
  if (!resolved) return null
  const [layer1, layer2] = auraLayers(resolved)
  const blur = `blur(${blurPx}px)`

  return (
    <div
      aria-hidden="true"
      data-testid="badge-aura-background"
      className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] isolate pointer-events-none"
      style={{ backgroundColor: AURA_BASE_COLOR }}
    >
      <div className="absolute inset-0" style={{ backgroundImage: layer1, mixBlendMode: 'multiply', filter: blur }} />
      <div className="absolute inset-0" style={{ backgroundImage: layer2, mixBlendMode: 'multiply', filter: blur }} />
      {grain && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: auraGrainImage(),
            backgroundSize: `${AURA_GRAIN.tilePx}px ${AURA_GRAIN.tilePx}px`,
            mixBlendMode: AURA_GRAIN.blendMode,
            opacity: AURA_GRAIN.opacity,
          }}
        />
      )}
    </div>
  )
}
