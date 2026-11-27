import type { CSSProperties } from 'react'

/**
 * 등급 UP 가차머신의 시각 값 (티켓 20261127_2225).
 * 사용자 지시(2026-11-27)로 가차머신 색·그림자·투시는 DS에 넣지 않고 이 서비스 전용 모듈에 하드코딩한다 — 정본 후보가 아니다.
 * 수치의 출처는 `docs/assets/prototypes/20261127_tier-up-gacha-prototype.html`이다.
 * `scripts/check-ui-rules.mjs`는 파일 단위 예외가 없어 색 리터럴이 있는 줄마다 `ui-allow` 주석을 단다. 마크업·그리기 코드는 이 값을 변수로 읽는다.
 */

/** 화면 배경: 어두운 원형 그라데이션 */
export const TIER_UP_PAGE_STYLE: CSSProperties = {
  background: 'radial-gradient(120% 60% at 50% 45%, #0b1a30 0%, transparent 70%), #04060b', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
}

/** TopNav를 네거티브로: 배경은 비우고 글자·뒤로가기를 흰색으로 만든다(DS TopNavBar는 `--foreground`를 읽는다) */
export const TIER_UP_NAV_STYLE = {
  background: 'transparent',
  '--foreground': '#ffffff', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
} as CSSProperties

export const GACHA = {
  /** 글자색 */
  muted: '#8b97ab', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  accent: '#2bdc78', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 돔 유리 */
  domeFill: ['#06162b', '#071a33', '#0c3463', '#1a5aa8'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  rim: ['#6fb6ff', '#2a6fd6'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  rimInner: '#000000', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  crescent: ['#7cc4ff', '#2f86ff'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  reflect: '#4a9dff', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  glint: ['#ffffff', '#d9ecff'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 레드 받침 */
  baseSide: ['#a5111d', '#e0303c', '#9a0f1a'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  baseShine: '#ffffff', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  baseLip: '#5e0810', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  knob: ['#ff7a82', '#c41a27'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  knobBar: '#ffe1e3', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 레드 몸통 */
  cabinetBg:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, transparent 35%, rgba(40, 0, 6, 0.28) 100%), linear-gradient(90deg, #a5111d 0%, #e0303c 50%, #9a0f1a 100%)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  cabinetShadow: '0 18px 40px -18px rgba(224, 48, 60, 0.5)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  cabinetSheen:
    'linear-gradient(118deg, transparent 54%, rgba(255,255,255,0.07) 54%, rgba(255,255,255,0.07) 68%, transparent 68%)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  cabinetFoot: 'rgba(80, 0, 10, 0.4)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 메탈 JAM 로고 */
  logoShadow:
    'drop-shadow(0 -1px 0 rgba(255, 255, 255, 0.35)) drop-shadow(0 1.5px 0 rgba(70, 0, 8, 0.6)) drop-shadow(0 3px 4px rgba(50, 0, 6, 0.45))', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  logoMetal:
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 1px, rgba(0,0,0,0.06) 1px 2px, transparent 2px 3px), linear-gradient(180deg, #fbfcfd 0%, #d4d8de 24%, #8e949d 47%, #eef0f3 53%, #b3b8c0 76%, #f2f4f6 100%)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 블랙 «배지 넣기» 버튼 */
  ctaShadow: '0 4px 0 rgba(70, 0, 8, 0.6), inset 0 1px 0 rgba(255,255,255,0.12)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 돔 안 행운 문구·개수 상자 */
  luckGradient: 'linear-gradient(180deg, #a9d2ff 0%, #4f9bff 100%)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  countBg: 'rgba(5, 10, 20, 0.38)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** «한 번 더» 작은 버튼 */
  againBorder: 'rgba(255,255,255,0.22)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  /** 가차볼(캔버스) 바탕 색 4가지 */
  ball: ['#22d36b', '#ffd23f', '#ff5a4e', '#3b6cff'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballGlass: 'rgba(255,255,255,0.05)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballSmoke: ['#4a5876', '#1b2336', '#0a0f1b', '#05080f'], // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballEdgeClear: 'rgba(255,255,255,0)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballEdgeRim: 'rgba(225,240,255,0.42)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballShineLow: 'rgba(255,255,255,0.12)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballShineTop: 'rgba(255,255,255,0.7)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballShineDot: 'rgba(255,255,255,0.55)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
  ballRing: 'rgba(210,232,255,0.55)', // ui-allow: 가차머신 하드코딩(티켓 20261127_2225 사용자 승인)
} as const
