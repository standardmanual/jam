'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconInfoCircle,
  IconPalette,
  IconLayout,
  IconDimensions,
} from '@tabler/icons-react'

// ── 모양 정의 및 스타일 ──────────────────────────────────────────────────────────

export type CardShapeType =
  | 'rect'
  | 'dome'
  | 'arch'
  | 'pill'
  | 'flag'
  | 'hex'
  | 'ticket-v'
  | 'scallop'
  | 'triangle'

interface ShapeMeta {
  id: CardShapeType
  name: string
  source: 'ShapeTag' | 'BadgeFrame' | 'Hybrid'
  description: string
  feasibility: 'High' | 'Medium' | 'Low'
  pros: string
  cons: string
  recommendedFor: string
}

const SHAPE_METAS: ShapeMeta[] = [
  {
    id: 'rect',
    name: 'Rect (현재 표준)',
    source: 'ShapeTag',
    description: '반경 24px(var(--radius-2xl))의 표준 직사각형 서피스',
    feasibility: 'High',
    pros: '가장 안정적인 콘텐츠 가독성 및 1px 기본 테두리 완벽 지원',
    cons: '형태적 개성이 적음',
    recommendedFor: '모든 피드 카드',
  },
  {
    id: 'dome',
    name: 'Dome (아치 돔)',
    source: 'ShapeTag',
    description: '상단은 둥근 아치(140px), 하단은 24px 직각 유지',
    feasibility: 'High',
    pros: '포스터나 히어로 이미지에 건축적이고 고급스러운 느낌 부여. 하단 텍스트 영역 손실 전혀 없음',
    cons: '이미지 상단 좌우가 일부 크롭되므로 중심 구도 이미지 권장',
    recommendedFor: 'PosterCard, HeroCard, 스페셜 이벤트 카드',
  },
  {
    id: 'arch',
    name: 'Arch (완전 둥근 상단)',
    source: 'ShapeTag',
    description: '상단 완전 반원(rounded-t-full), 하단 24px',
    feasibility: 'High',
    pros: '전시회 브로슈어, 기념 티켓 같은 독창적인 실루엣 형성',
    cons: '가로폭 대비 높이에 따라 아치 곡률이 달라짐',
    recommendedFor: 'SquareCard, PosterCard',
  },
  {
    id: 'flag',
    name: 'Flag (깃발 / 배너)',
    source: 'ShapeTag',
    description: 'clip-path를 이용해 우측에 쉐브론 꼬리가 있는 깃발 형태',
    feasibility: 'Medium',
    pros: '주목도 높은 이벤트성 배너 실루엣 형성',
    cons: '우측 뾰족한 부분으로 인해 우측 텍스트 여백이 36px 이상 필요하며, 일반 CSS border 대신 SVG 필터 필요',
    recommendedFor: 'BriefCard, 공지/속보형 배너',
  },
  {
    id: 'hex',
    name: 'Hex (육각 챔퍼)',
    source: 'ShapeTag',
    description: '상하좌우 모서리가 대각선으로 깎인 챔퍼 육각형',
    feasibility: 'Medium',
    pros: '게이미피케이션/퀘스트 느낌이 강한 볼드한 외형',
    cons: '4개 모서리가 잘려나가 텍스트 및 버튼의 안전 마진(Safe Area)을 크게 확보해야 함',
    recommendedFor: '게이미피케이션 퀘스트 카드, 도전 과제',
  },
  {
    id: 'ticket-v',
    name: 'Ticket (수직 티켓)',
    source: 'BadgeFrame',
    description: '상하 또는 좌우 중앙에 반원 펀칭 아치가 파인 티켓 실루엣',
    feasibility: 'High',
    pros: '쿠폰, 입장권, 보상 획득 카드에 가장 직관적이고 감성적인 형태',
    cons: 'SVG path clip-path 또는 pseudo-element로 펀칭 구현 필요',
    recommendedFor: '보상 카드, 레시피 공개, 이벤트 티켓',
  },
  {
    id: 'pill',
    name: 'Pill (초대형 캡슐)',
    source: 'ShapeTag',
    description: '완전 캡슐형태(rounded-full)',
    feasibility: 'Medium',
    pros: '부드럽고 친근한 잼(JAM!) 브랜드 정체성 반영',
    cons: '세로가 긴 카드에서는 좌우 여백 낭비가 매우 심함. 높이가 낮은 카드에만 유효',
    recommendedFor: 'BriefCard (한 줄 요약 카드)',
  },
  {
    id: 'scallop',
    name: 'Scallop (우표 가리비)',
    source: 'BadgeFrame',
    description: '외곽선에 연속된 둥근 톱니가 새겨진 우표 실루엣',
    feasibility: 'Medium',
    pros: '컬렉션, 우표, 아카이빙 느낌을 극대화',
    cons: 'SVG 클리핑 패스 연산 필요, 엣지가 화려해 본문이 단순한 카드에만 적합',
    recommendedFor: '컬렉션 달성 카드, 마일스톤',
  },
  {
    id: 'triangle',
    name: 'Triangle (삼각형)',
    source: 'ShapeTag',
    description: '정삼각형 polygon clip-path',
    feasibility: 'Low',
    pros: '실루엣 자체는 매우 파격적',
    cons: '상단 꼭짓점과 좌하/우하단 모서리로 인해 직사각형 이미지나 다단 텍스트 수용 불가',
    recommendedFor: '피드 카드로는 비권장 (단독 아이콘/엠블럼 위젯 전용)',
  },
]

// ── 클리핑 및 스타일 헬퍼 ─────────────────────────────────────────────────────────

function getShapeStyle(shape: CardShapeType): {
  borderRadius?: string
  clipPath?: string
  paddingExtra?: string
} {
  switch (shape) {
    case 'rect':
      return { borderRadius: '24px' }
    case 'dome':
      return { borderRadius: '140px 140px 24px 24px' }
    case 'arch':
      return { borderRadius: '180px 180px 24px 24px' }
    case 'pill':
      return { borderRadius: '9999px', paddingExtra: 'px-8' }
    case 'flag':
      return {
        clipPath: 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)',
        paddingExtra: 'pr-10',
      }
    case 'hex':
      return {
        clipPath: 'polygon(6% 0%, 94% 0%, 100% 50%, 94% 100%, 6% 100%, 0% 50%)',
        paddingExtra: 'px-6',
      }
    case 'triangle':
      return {
        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        paddingExtra: 'pt-16 pb-6 px-12',
      }
    case 'ticket-v':
      // 티켓 상하 노치 (SVG mask 또는 clip-path)
      return {
        borderRadius: '24px',
        clipPath:
          'polygon(0 0, calc(50% - 16px) 0, 50% 16px, calc(50% + 16px) 0, 100% 0, 100% 100%, calc(50% + 16px) 100%, 50% calc(100% - 16px), calc(50% - 16px) 100%, 0 100%)',
      }
    case 'scallop':
      return { borderRadius: '32px' }
    default:
      return { borderRadius: '24px' }
  }
}

// ── 프로토타입 메인 화면 ─────────────────────────────────────────────────────────

export default function CardShapesSpikePage() {
  const [selectedShape, setSelectedShape] = useState<CardShapeType>('dome')
  const [cardType, setCardType] = useState<'hero' | 'poster' | 'square' | 'brief'>('hero')
  const [tone, setTone] = useState<'default' | 'tint' | 'accent' | 'inverse'>('default')
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false)
  const [borderStyle, setBorderStyle] = useState<'solid' | 'drop-shadow' | 'none'>('solid')

  const meta = SHAPE_METAS.find((s) => s.id === selectedShape) ?? SHAPE_METAS[0]
  const shapeStyle = getShapeStyle(selectedShape)

  // 톤에 따른 카드 배경 및 텍스트 스타일
  const toneClasses = {
    default: 'bg-white text-slate-900 border-slate-200',
    tint: 'bg-[#f4efe6] text-slate-900 border-transparent',
    accent: 'bg-[#e8f5e9] text-emerald-950 border-emerald-200',
    inverse: 'bg-[#1e2022] text-white border-slate-800',
  }[tone]

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-slate-900 font-sans pb-24">
      {/* 상단 네비게이션 헤더 */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <IconArrowLeft className="size-4" />
            어드민
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-base font-bold">홈 피드 카드 쉐이프(Shape) 스케일 프로토타입</h1>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            실험실 (Spike)
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* 안내 배너 */}
        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-950">
          <div className="flex items-start gap-3">
            <IconInfoCircle className="size-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">
                디자인 시스템 ShapeTag 및 BadgeFrame의 형태를 홈 피드 카드 스케일로 확장하는 실험입니다.
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                현재 JAM! 2.0 카드는 고정 반경 24px(<code>--radius-2xl</code>)을 사용합니다.
                카드에 특수 쉐이프(Dome, Flag, Hex, Ticket 등)를 적용할 때 발생하는 <b>콘텐츠 안전 영역(Safe Area)</b>,{' '}
                <b>1px 테두리(Border) 구현 제약</b>, <b>이미지 마스킹 효과</b>를 인터랙티브하게 검증합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 2열 메인 레이아웃: 좌측 컨트롤러 / 우측 모바일 뷰포트 프리뷰 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ── 좌측 컨트롤 패널 (5 cols) ─────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-6">
            {/* 1. 쉐이프 선택기 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <IconDimensions className="size-4 text-emerald-600" />
                적용할 카드 모양 (Shape)
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {SHAPE_METAS.map((s) => {
                  const active = s.id === selectedShape
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedShape(s.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                        active
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/30'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold">{s.name.split(' ')[0]}</span>
                      <span className="text-[10px] text-slate-600 mt-0.5">{s.source}</span>
                    </button>
                  )
                })}
              </div>

              {/* 선택된 형태 상세 메타 정보 */}
              <div className="rounded-xl bg-slate-50 p-4 text-xs space-y-2 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">{meta.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold ${
                      meta.feasibility === 'High'
                        ? 'bg-emerald-100 text-emerald-800'
                        : meta.feasibility === 'Medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    피드 적용성: {meta.feasibility}
                  </span>
                </div>
                <p className="text-slate-600">{meta.description}</p>
                <div className="pt-2 border-t border-slate-200/60 space-y-1">
                  <p>
                    <b className="text-emerald-700">장점:</b> {meta.pros}
                  </p>
                  <p>
                    <b className="text-rose-700">주의점:</b> {meta.cons}
                  </p>
                  <p>
                    <b className="text-slate-700">추천 카드:</b> {meta.recommendedFor}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. 카드 콘텐츠 유형 선택기 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <IconLayout className="size-4 text-emerald-600" />
                카드 콘텐츠 유형 (Layout)
              </h2>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'hero' as const, label: '히어로 (16:9 와이드)' },
                  { id: 'poster' as const, label: '포스터 (4:5 버티컬)' },
                  { id: 'square' as const, label: '스퀘어 (1:1 정사각형)' },
                  { id: 'brief' as const, label: '브리프 (텍스트 요약)' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setCardType(t.id)}
                    className={`p-2.5 rounded-xl border font-medium text-left transition-colors ${
                      cardType === t.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 시각 옵션 & 테두리 기법 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 text-xs">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <IconPalette className="size-4 text-emerald-600" />
                카드 스타일 & 테두리 모드
              </h2>

              <div className="space-y-2">
                <span className="font-semibold text-slate-700">배경 톤 (Surface Tone)</span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'default' as const, label: '흰 면' },
                    { id: 'tint' as const, label: '크림 틴트' },
                    { id: 'accent' as const, label: '민트 엑센트' },
                    { id: 'inverse' as const, label: '다크 반전' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      className={`p-2 rounded-lg border text-center font-medium ${
                        tone === t.id
                          ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-900'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-700">테두리 렌더링 방식</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'solid' as const, label: 'CSS 1px Border' },
                    { id: 'drop-shadow' as const, label: 'Drop Shadow 선' },
                    { id: 'none' as const, label: '테두리 없음' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBorderStyle(b.id)}
                      className={`p-2 rounded-lg border text-center font-medium ${
                        borderStyle === b.id
                          ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-900'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-600">
                  * <code>clip-path</code>(Flag, Hex, Triangle)를 쓸 때는 일반 CSS border가 잘려나가므로,
                  외곽선 유지를 위해 <code>filter: drop-shadow(...)</code> 선 기법이 필요합니다.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showSafeArea}
                    onChange={(e) => setShowSafeArea(e.target.checked)}
                    className="size-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-medium text-slate-800">
                    콘텐츠 안전 영역(Safe Area) 가이드 오버레이 보기
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* ── 우측 모바일 뷰포트 프리뷰 (7 cols) ────────────────────────── */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="text-center mb-3">
              <span className="text-xs font-semibold text-slate-600">
                JAM! 홈 피드 모바일 뷰포트 (390px 폭 기준)
              </span>
            </div>

            {/* 모바일 쉘 디바이스 목업 */}
            <div className="w-[390px] min-h-[640px] rounded-[44px] border-[8px] border-slate-900 bg-[#f7f5f0] shadow-2xl overflow-hidden flex flex-col">
              {/* 스마트폰 노치/헤더 영역 */}
              <div className="h-7 bg-slate-900 flex items-center justify-between px-6">
                <span className="text-[11px] font-bold text-white">9:41</span>
                <div className="w-20 h-4 bg-slate-800 rounded-full" />
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2 bg-white rounded-xs" />
                </div>
              </div>

              {/* 홈 피드 상단 헤더 */}
              <div className="px-5 py-3 border-b border-slate-200/60 bg-white/60 backdrop-blur-sm flex items-center justify-between">
                <span className="text-sm font-black tracking-tight text-slate-900">JAM! TODAY</span>
                <span className="text-xs text-slate-600">서울 성수동</span>
              </div>

              {/* 피드 스크롤 캔버스 */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                <div className="text-xs font-bold text-slate-600 px-1 uppercase tracking-wider">
                  TODAY PICKS
                </div>

                {/* ── 실제 쉐이프 적용 카드 래퍼 ── */}
                <div
                  className={`relative transition-all duration-300 ${
                    borderStyle === 'drop-shadow'
                      ? 'filter drop-shadow-[0_0_1px_rgba(0,0,0,0.35)]'
                      : ''
                  }`}
                  style={{
                    borderRadius: shapeStyle.borderRadius,
                    clipPath: shapeStyle.clipPath,
                  }}
                >
                  {/* 카드 컨테이너 */}
                  <div
                    className={`relative overflow-hidden ${
                      borderStyle === 'solid' && !shapeStyle.clipPath ? 'border' : ''
                    } ${toneClasses} transition-colors`}
                    style={{
                      borderRadius: shapeStyle.borderRadius,
                    }}
                  >
                    {/* 안전 영역 가이드 오버레이 */}
                    {showSafeArea && (
                      <div className="absolute inset-0 pointer-events-none z-20 border-2 border-dashed border-rose-400 bg-rose-500/10 flex items-center justify-center">
                        <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          콘텐츠 영역
                        </span>
                      </div>
                    )}

                    {/* 카드 내부 콘텐츠 */}
                    {cardType === 'hero' && (
                      <div>
                        {/* 16:9 이미지 슬롯 */}
                        <div className="relative aspect-video w-full bg-slate-200 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element -- spike 페이지 외부 Unsplash 프로토타입 이미지 렌더링 */}
                          <img
                            src="https://images.unsplash.com/photo-1551632811-561732d1e306?q=80&w=800&auto=format&fit=crop"
                            alt="등산 트레일"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-800">
                            스포트라이트
                          </div>
                        </div>

                        {/* 본문 */}
                        <div className={`p-6 space-y-2.5 ${shapeStyle.paddingExtra ?? ''}`}>
                          <div className="text-xs font-semibold text-emerald-700">
                            체크인 챌린지 · 북한산 둘레길
                          </div>
                          <h3 className="text-lg font-bold leading-snug">
                            바위 능선을 넘어 가을 숲길로 떠나는 하이킹
                          </h3>
                          <div className="text-xs font-semibold text-slate-800">
                            기간: 10월 22일 ~ 11월 05일 · 보상: 2,500P
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            가을 단풍이 절정인 이번 주말, 둘레길을 걸으며 숨겨진 가을 한정 배지와 포인트를 모아보세요.
                          </p>
                          <div className="pt-2 flex items-center justify-between text-xs font-bold text-emerald-800">
                            <span>자세히 보기 →</span>
                            <span className="text-[10px] text-slate-600 font-normal">3일 남음</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {cardType === 'poster' && (
                      <div>
                        {/* 4:5 버티컬 이미지 슬롯 */}
                        <div className="relative aspect-[4/5] w-full bg-slate-200 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element -- spike 페이지 외부 Unsplash 프로토타입 이미지 렌더링 */}
                          <img
                            src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop"
                            alt="호수와 산"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 text-white space-y-2">
                            <span className="text-xs font-bold text-emerald-300">SPECIAL EDITION</span>
                            <h3 className="text-xl font-bold leading-tight">
                              새벽 안개를 뚫고 달리는 브리즈 런
                            </h3>
                            <p className="text-xs text-slate-200 line-clamp-2">
                              호숫가를 따라 달리는 러너들을 위한 특별한 러닝 코스
                            </p>
                            <div className="pt-2 text-xs font-bold text-emerald-300">
                              코스 보러가기 →
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {cardType === 'square' && (
                      <div className={`p-5 space-y-4 ${shapeStyle.paddingExtra ?? ''}`}>
                        <div className="relative aspect-square w-full rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center border border-slate-200/50">
                          {/* eslint-disable-next-line @next/next/no-img-element -- spike 페이지 외부 Unsplash 프로토타입 이미지 렌더링 */}
                          <img
                            src="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop"
                            alt="요가 세션"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-emerald-700">데일리 퀘스트</span>
                          <h4 className="font-bold text-base">아침 15분 스트레칭 완성하기</h4>
                          <p className="text-xs text-slate-600">몸을 깨우는 가벼운 스트레칭으로 하루를 시작해요</p>
                        </div>
                      </div>
                    )}

                    {cardType === 'brief' && (
                      <div className={`p-6 space-y-3 ${shapeStyle.paddingExtra ?? ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-emerald-800">실시간 피드 알림</span>
                        </div>
                        <h3 className="text-base font-bold leading-snug">
                          성수동 아틀리에 근처에서 새로운 한정 드랍 배지가 발견되었어요!
                        </h3>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          지금 반경 500m 이내에 계신가요? 탐색하고 100P와 배지를 획득해 보세요.
                        </p>
                        <div className="text-xs font-bold text-emerald-700">바로 확인하기 →</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 다음 피드 카드 (비교용 표준 카드) */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 text-xs opacity-70">
                  <span className="text-[10px] font-bold text-slate-600">비교용 표준 카드 (24px Rect)</span>
                  <p className="font-medium text-slate-800">
                    다른 일반 피드 카드는 이와 같은 표준 직사각형으로 배열됩니다.
                  </p>
                </div>
              </div>

              {/* 모바일 쉘 하단 홈 바 */}
              <div className="h-6 bg-white flex items-center justify-center">
                <div className="w-32 h-1 bg-slate-300 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* ── 하단 심층 분석 보고서 ───────────────────────────────────────── */}
        <section className="mt-16 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900">
            ShapeTag의 카드 스케일 확장: 종합 분석 및 실무 권장안
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {/* 1. Dome & Arch 계열 */}
            <div className="rounded-2xl bg-emerald-50/50 border border-emerald-200/80 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                  ✓
                </span>
                <h3 className="font-bold text-emerald-950">1위 추천: Dome (아치 돔)</h3>
              </div>
              <p className="text-xs text-emerald-900/80 leading-relaxed">
                • <b>시각적 완성도:</b> 상단 이미지에 아치형 돔 곡률을 주고 하단 텍스트는 24px 사각형을
                유지할 때 가장 심미적이고 완성도가 높습니다.
                <br />• <b>기술적 구현:</b> <code>borderRadius: 140px 140px 24px 24px</code>로
                표준 CSS <code>border</code>와 <code>overflow-hidden</code>이 100% 정상 작동합니다.
                <br />• <b>적합 카드:</b> PosterCard, 기획전 HeroCard.
              </p>
            </div>

            {/* 2. Flag & Hex 계열 */}
            <div className="rounded-2xl bg-amber-50/50 border border-amber-200/80 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-amber-600 text-white text-xs font-bold">
                  !
                </span>
                <h3 className="font-bold text-amber-950">조건부 추천: Flag / Ticket</h3>
              </div>
              <p className="text-xs text-amber-900/80 leading-relaxed">
                • <b>시각적 완성도:</b> 이벤트 배너나 쿠폰/티켓형 카드에 강력한 인상을 줍니다.
                <br />• <b>주의점:</b> <code>clip-path</code> 사용 시 일반 <code>border: 1px</code>가
                적용되지 않으므로, <code>drop-shadow</code> 필터나 SVG 마스크를 동반해야 테두리가 생깁니다.
                우측 꼬리 부분에 텍스트가 침범하지 않도록 내부 우측 패딩을 40px 이상 넓혀야 합니다.
                <br />• <b>적합 카드:</b> BriefCard(단문 배너), 이벤트 알림.
              </p>
            </div>

            {/* 3. Triangle 계열 */}
            <div className="rounded-2xl bg-rose-50/50 border border-rose-200/80 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-rose-600 text-white text-xs font-bold">
                  ✕
                </span>
                <h3 className="font-bold text-rose-950">비권장: Triangle (삼각형)</h3>
              </div>
              <p className="text-xs text-rose-900/80 leading-relaxed">
                • <b>한계점:</b> 4각형 규격의 사진이나 2줄 이상의 제목, 필수 정보(날짜, 보상 등)가 모서리에
                잘려나가 가독성을 심각하게 해칩니다.
                <br />• <b>결론:</b> 카드가 아닌 <b>독립 엠블럼 태그(ShapeTag 원래 용도)</b>로만
                유지하는 것이 적합합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
