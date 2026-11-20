import {
  AURA_GLOW_BASE_COLOR,
  auraGlowInsetShadow,
  auraGlowLayers,
  auraGlowMetrics,
  AURA_GRAIN_OPACITY,
  AURA_GRAIN_SIZE_PX,
  AURA_GRAIN_URL,
  auraMeshBase,
  auraMeshLayers,
  resolveAuraColors,
} from '@/lib/badgeAura'

/**
 * 배지 글로우 배경 — 이미지 대표색으로 깐 부드러운 그라데이션 (티켓 20261119_1653·20261120_0235·20261120_0316)
 *
 * 부모(카드)의 `relative overflow-hidden rounded-*` 안에 `absolute inset-0`으로 깔린다. 훅이 없는 순수 컴포넌트라
 * 서버·클라이언트 어디서나 쓴다(`'use client'` 없음). 상세 히어로 카드와 목록 카드(`BadgeGridCard`)가 함께 쓴다.
 *
 * 구성(사용자 시안, 2026-11-20): 진한 색이 위 가운데에서 퍼지고, 가운데가 넓게 밝아지며, 아래는 순백으로 풀린다.
 * 그라데이션 면에는 블러를 걸되 가장자리가 옅어지지 않게 위·좌·우로 카드 밖으로 키운다(루트가 `overflow-hidden`으로 자른다).
 * 아래는 흰색이라 키우지 않는다. 안쪽 빛(inset 그림자)은 블러 위에 따로 얹는다 — 블러 면 아래에 두면 가려진다.
 *
 * 격리: 루트가 `isolate`로 쌓임 맥락을 만들고, 모서리는 `rounded-[inherit]` + `overflow-hidden`으로 부모를 따른다.
 * `will-change`는 쓰지 않는다(정적 면에 상시 레이어 승격은 메모리만 먹는다).
 *
 * 변형 두 가지: `glow`(기본, compact 카드)는 위에서 아래로 흰색에 풀리는 글로우, `mesh`(배지 그리드 카드·상세 히어로, 티켓 20261120_1143)는
 * 두 색이 대각선으로 번지고 가운데가 살짝 밝으며 고운 입자가 깔린 파스텔 메시다. 메시는 블러·안쪽 빛·`glowSize`가 필요 없고,
 * 대각선 방향은 `seed`(없으면 색 목록)로 정해져 배지마다 다르되 렌더마다 같다.
 *
 * `colors`가 `[]`이면 청회색 대체색, hex가 아닌 값이 섞였으면 아무것도 그리지 않는다(`resolveAuraColors`).
 */
interface BadgeAuraBackgroundProps {
  /** `badges.bg_colors` 값. 밝기 높은 순 hex, 3색 미만이면 색상을 돌려 채운다 */
  colors: string[]
  /** 대표색 대신 무채색으로 깐다(미획득 배지) */
  gray?: boolean
  /**
   * 블러·여유·안쪽 빛을 면 크기에 맞춘다. 없으면 상세 카드(약 360px) 값, 숫자면 면 한 변(px),
   * `'container'`면 면 폭(cqw, 면 쪽에 `container-type: inline-size`가 있어야 한다)
   */
  glowSize?: number | 'container'
  /** `glow`(기본): 흰색으로 풀리는 글로우, `mesh`: 크림 바탕의 파스텔 메시(그리드 카드) */
  variant?: 'glow' | 'mesh'
  /** 메시 덩어리 배치를 고르는 키(배지 이름 등). 없으면 색 목록으로 정한다 */
  seed?: string
}

export default function BadgeAuraBackground({ colors, gray = false, glowSize, variant = 'glow', seed }: BadgeAuraBackgroundProps) {
  const resolved = resolveAuraColors(colors)
  if (!resolved) return null
  if (variant === 'mesh') {
    return (
      <div
        aria-hidden="true"
        data-testid="badge-aura-background"
        data-variant="mesh"
        className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] isolate pointer-events-none"
        style={{ backgroundColor: auraMeshBase(resolved, { gray }), backgroundImage: auraMeshLayers(resolved, { gray, seed }).join(', ') }}
      >
        {/* 입자: 코드로 만든 노이즈를 곱하기로 얹는다. 루트가 isolate라 이 블렌딩은 위 그라데이션에만 닿는다 */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: AURA_GRAIN_URL, backgroundSize: `${AURA_GRAIN_SIZE_PX}px ${AURA_GRAIN_SIZE_PX}px`, mixBlendMode: 'multiply', opacity: AURA_GRAIN_OPACITY }}
        />
      </div>
    )
  }
  const m = auraGlowMetrics(glowSize)

  return (
    <div
      aria-hidden="true"
      data-testid="badge-aura-background"
      data-variant="glow"
      className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] isolate pointer-events-none"
      style={{ backgroundColor: AURA_GLOW_BASE_COLOR }}
    >
      <div
        className="absolute"
        style={{ top: m.negBleed, left: m.negBleed, right: m.negBleed, bottom: 0, backgroundImage: auraGlowLayers(resolved, { gray, bleed: m.bleed }).join(', '), filter: `blur(${m.blur})` }}
      />
      <div className="absolute inset-0 rounded-[inherit]" style={{ boxShadow: auraGlowInsetShadow(resolved, { gray, size: glowSize }) }} />
    </div>
  )
}
