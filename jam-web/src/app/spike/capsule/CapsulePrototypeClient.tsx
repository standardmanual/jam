'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import Image from 'next/image'
import RadialCapsule from '@/components/capsule/RadialCapsule'

function subscribeHydration() {
  return () => {}
}

export default function CapsulePrototypeClient() {
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false
  )
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  // 조작 상태
  const [percent, setPercent] = useState<number>(45)
  const [replayKey, setReplayKey] = useState<number>(1)
  const [durationMs, setDurationMs] = useState<number>(1500)
  const [activeTab, setActiveTab] = useState<'interactive' | 'compare' | 'context'>('interactive')
  const [contextTab, setContextTab] = useState<'home' | 'profile'>('home')

  // 채우기 시뮬레이션 상태
  const [isFillModalOpen, setIsFillModalOpen] = useState(false)
  const [fillToast, setFillToast] = useState<string | null>(null)

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      setRuntimeError(event.message || '알 수 없는 스크립트 오류')
    }
    window.addEventListener('error', errorHandler)
    return () => window.removeEventListener('error', errorHandler)
  }, [])

  const handleReplay = () => {
    setReplayKey((prev) => prev + 1)
  }

  const handleFillAction = () => {
    setIsFillModalOpen(true)
  }

  const handleAddJam = (amount: number) => {
    setPercent((prev) => {
      const next = Math.min(100, prev + amount)
      setFillToast(`+${amount} JAM 충전 완료! (${next}%)`)
      setTimeout(() => setFillToast(null), 2500)
      return next
    })
    setIsFillModalOpen(false)
  }

  const updatePercent = (val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : val))
    setPercent(clamped)
  }

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-[#191919] pb-24">
      {/* 런타임 에러 경고 */}
      {runtimeError && (
        <div className="bg-red-600 text-white text-xs p-3 font-mono font-bold flex justify-between items-center sticky top-0 z-50">
          <span>⚠️ 브라우저 스크립트 오류: {runtimeError}</span>
          <button onClick={() => setRuntimeError(null)} className="underline cursor-pointer">
            닫기
          </button>
        </div>
      )}

      {/* 상단 헤더 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-black/5 px-4 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF2A00] animate-pulse" />
            <h1 className="text-base font-bold tracking-tight">JAM! 캡슐 프로토타입</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
                isHydrated ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isHydrated ? '● JS 정상 연결' : '○ 로딩 중...'}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('interactive')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'interactive'
                  ? 'bg-white shadow-xs text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              인터랙션
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compare')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'compare'
                  ? 'bg-white shadow-xs text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              이미지 비교
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('context')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'context'
                  ? 'bg-white shadow-xs text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              화면 프리뷰
            </button>
          </div>
        </div>
      </header>

      {/* 토스트 메시지 */}
      {fillToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-black/90 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span className="w-2 h-2 rounded-full bg-[#FF2A00]" />
          {fillToast}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* 수정 사항 반영 체크리스트 카드 */}
        <section className="bg-white rounded-2xl p-4 border border-black/5 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            수정 요구사항 반영 현황
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-neutral-700">
            <div className="flex items-start gap-2 bg-[#F9F9FA] p-2.5 rounded-xl border border-black/5">
              <span className="text-[#FF2A00] font-bold">✓</span>
              <div>
                <p className="font-semibold text-neutral-900">1. 두 그라데이션 동시 모션</p>
                <p className="text-neutral-500 text-xs">외곽 오라 + 중심 핫 코어 모두 감속 차오름</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-[#F9F9FA] p-2.5 rounded-xl border border-black/5">
              <span className="text-[#FF2A00] font-bold">✓</span>
              <div>
                <p className="font-semibold text-neutral-900">2. 100% 테두리 없이 완전 채움</p>
                <p className="text-neutral-500 text-xs">회색 테두리/음영 남김 없이 전체 붉은 잼 꽉 참</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-[#F9F9FA] p-2.5 rounded-xl border border-black/5">
              <span className="text-[#FF2A00] font-bold">✓</span>
              <div>
                <p className="font-semibold text-neutral-900">3. 중심 라인 완전 제거</p>
                <p className="text-neutral-500 text-xs">물결선·타원선 제거, 순수 잼 그라데이션만 노출</p>
              </div>
            </div>
          </div>
        </section>

        {/* 탭 1: 인터랙티브 검증 */}
        {activeTab === 'interactive' && (
          <div className="space-y-6">
            {/* 메인 캡슐 캔버스 */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-neutral-400">현재 캡슐 상태</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-black tracking-tight">{percent}%</span>
                    <span className="text-xs text-neutral-500">
                      {percent === 0
                        ? '(0% = 2% 코어 유지)'
                        : percent === 100
                        ? '(100% 완전 채움)'
                        : `(실제 렌더: ${Math.round(2 + (percent / 100) * 98)}%)`}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReplay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 active:scale-95 transition-all text-xs font-semibold text-neutral-700 cursor-pointer"
                  title="페이지 진입 시의 감속 채우기 모션을 다시 실행합니다"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  진입 모션 다시보기
                </button>
              </div>

              {/* 캡슐 렌더 영역 (높이 96px, 채우기 버튼 제거 - 캡슐 본체 터치) */}
              <div className="py-4 bg-[#F5F5F7] rounded-2xl p-6 flex flex-col items-center">
                <div className="w-full max-w-md">
                  <RadialCapsule
                    key={replayKey}
                    percent={percent}
                    height={96}
                    durationMs={durationMs}
                    actionText={percent >= 100 ? '열기' : '채우기'}
                    onClick={handleFillAction}
                  />
                </div>
              </div>

              {/* 빠른 프리셋 버튼 */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500">수치 프리셋 테스트</div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: '0% (코어 2%)', val: 0 },
                    { label: '25%', val: 25 },
                    { label: '50%', val: 50 },
                    { label: '75%', val: 75 },
                    { label: '100% (완전 채움)', val: 100 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        updatePercent(preset.val)
                        handleReplay()
                      }}
                      className={`px-2 py-2 rounded-xl text-xs font-bold transition-all text-center border cursor-pointer ${
                        percent === preset.val
                          ? 'bg-[#FF2A00] text-white border-[#FF2A00] shadow-sm'
                          : 'bg-white text-neutral-700 border-black/10 hover:border-black/25'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 세부 조작 컨트롤 */}
              <div className="pt-4 border-t border-black/5 space-y-4">
                {/* 슬라이더 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-neutral-700 font-bold">보유 JAM 실시간 슬라이더</span>
                    <span className="text-[#FF2A00] font-mono font-bold text-base">{percent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={percent}
                    onInput={(e) => updatePercent(Number(e.currentTarget.value))}
                    onChange={(e) => updatePercent(Number(e.currentTarget.value))}
                    className="w-full h-3 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#FF2A00]"
                    style={{ touchAction: 'manipulation' }}
                  />
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span>0% (2% 코어 은은히 유지)</span>
                    <span>50%</span>
                    <span>100% (캡슐 완전히 채움)</span>
                  </div>
                </div>

                {/* 모션 속도 */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-semibold text-neutral-600 block">
                    진입 모션 감속 속도 (뒤로 갈수록 천천히 감속)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: '빠르게 (1.0s)', ms: 1000 },
                      { label: '추천 (1.5s)', ms: 1500 },
                      { label: '여유있게 (2.0s)', ms: 2000 },
                    ].map((item) => (
                      <button
                        key={item.ms}
                        type="button"
                        onClick={() => {
                          setDurationMs(item.ms)
                          handleReplay()
                        }}
                        className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                          durationMs === item.ms
                            ? 'bg-black text-white border-black font-bold'
                            : 'bg-white text-neutral-600 border-black/10 hover:border-black/20'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* 탭 2: 원본 이미지 1:1 비교 */}
        {activeTab === 'compare' && (
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">첨부 원본 이미지와 1:1 대조</h2>
              <p className="text-xs text-neutral-500 mt-1">
                전달해주신 레퍼런스 이미지(높이 96px 비례)와 구현된 방사형 캡슐을 대조할 수 있습니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* 원본 이미지 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-neutral-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neutral-400" />
                  전달해주신 원본 레퍼런스 이미지
                </span>
                <div className="relative rounded-2xl overflow-hidden bg-[#3B3B3B] p-4 flex items-center justify-center min-h-[180px]">
                  <Image
                    src="/images/capsule-design-ref.jpg"
                    alt="Capsule Design Reference"
                    width={320}
                    height={160}
                    className="w-full max-w-[280px] h-auto object-contain rounded-xl drop-shadow-md"
                  />
                </div>
              </div>

              {/* 구현된 캡슐 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#FF2A00] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF2A00]" />
                  구현된 캡슐 (현재: {percent}%)
                </span>
                <div className="rounded-2xl overflow-hidden bg-[#3B3B3B] p-6 flex flex-col items-center justify-center min-h-[180px]">
                  <div className="w-full max-w-[280px]">
                    <RadialCapsule
                      key={`compare-${replayKey}`}
                      percent={percent}
                      height={96}
                      durationMs={durationMs}
                      actionText={percent >= 100 ? '열기' : '채우기'}
                      onAction={handleFillAction}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 비교 슬라이더 */}
            <div className="bg-[#F9F9FA] p-4 rounded-2xl border border-black/5 space-y-3">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-neutral-700">채움 비율 테스트</span>
                <span className="text-[#FF2A00] font-bold">{percent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={percent}
                onInput={(e) => updatePercent(Number(e.currentTarget.value))}
                onChange={(e) => updatePercent(Number(e.currentTarget.value))}
                className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#FF2A00]"
              />
            </div>
          </section>
        )}

        {/* 탭 3: 실제 화면 배치 프리뷰 (모바일 프레임) */}
        {activeTab === 'context' && (
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">실제 서비스 화면 내 배치 미리보기</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  높이 96px와 방사형 그라데이션 캡슐이 화면에 어떻게 자리잡는지 확인합니다.
                </p>
              </div>

              <div className="flex gap-1 bg-black/5 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setContextTab('home')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    contextTab === 'home' ? 'bg-white shadow-xs text-black font-bold' : 'text-neutral-500'
                  }`}
                >
                  홈피드
                </button>
                <button
                  type="button"
                  onClick={() => setContextTab('profile')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    contextTab === 'profile' ? 'bg-white shadow-xs text-black font-bold' : 'text-neutral-500'
                  }`}
                >
                  프로필
                </button>
              </div>
            </div>

            {/* 모바일 화면 목업 */}
            <div className="max-w-[390px] mx-auto rounded-[36px] bg-[#F4F4F6] border-4 border-black/10 overflow-hidden shadow-2xl">
              <div className="bg-white px-6 pt-3 pb-2 flex justify-between items-center text-xs font-semibold text-neutral-700">
                <span>9:41</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-xs border border-neutral-700 inline-block" />
                  <span className="text-xs">5G</span>
                </div>
              </div>

              {/* 홈피드 뷰 */}
              {contextTab === 'home' && (
                <div className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs font-bold text-neutral-400">TODAY</span>
                      <h3 className="text-lg font-black tracking-tight">오늘의 러닝</h3>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-neutral-200" />
                  </div>

                  {/* 현황 스트립 */}
                  <div className="bg-white rounded-2xl p-3 border border-black/5 shadow-xs flex justify-between text-xs">
                    <div>
                      <span className="text-neutral-400 block text-xs">오늘 누적</span>
                      <strong className="text-sm font-bold">5.2 km</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-neutral-400 block text-xs">잼 획득</span>
                      <strong className="text-sm font-bold text-[#FF2A00]">+45 JAM</strong>
                    </div>
                  </div>

                  {/* 캡슐 영역 (높이 96px, 채우기 버튼 제거 - 캡슐 본체 터치) */}
                  <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-xs space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-bold text-neutral-700">캡슐 게이지</span>
                      <span className="text-xs text-neutral-400 font-mono">
                        {Math.round(percent * 3)} / 300 JAM
                      </span>
                    </div>
                    <RadialCapsule
                      key={`home-${replayKey}`}
                      percent={percent}
                      height={96}
                      durationMs={durationMs}
                      actionText={percent >= 100 ? '열기' : '채우기'}
                      onClick={handleFillAction}
                    />
                  </div>

                  {/* 아래 카드 스택 모의 */}
                  <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-xs space-y-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      진행 중 미션
                    </span>
                    <h4 className="text-xs font-bold">한강 야간 러닝 5km 완주</h4>
                  </div>
                </div>
              )}

              {/* 프로필 뷰 */}
              {contextTab === 'profile' && (
                <div className="p-4 space-y-4">
                  <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-xs flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-orange-400 to-red-500 text-white font-bold flex items-center justify-center text-sm">
                      JAM
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">시현 러너</h3>
                      <p className="text-xs text-neutral-400">Chapter 3 · 러너 트라이브</p>
                    </div>
                  </div>

                  {/* 챕터 라인 */}
                  <div className="bg-white rounded-xl p-3 border border-black/5 flex justify-between items-center text-xs">
                    <span className="font-semibold text-neutral-700">다음 챕터까지</span>
                    <span className="font-mono text-neutral-500 text-xs">80 / 100 km</span>
                  </div>

                  {/* 프로필 캡슐 위젯 */}
                  <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-xs space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-bold text-neutral-700">내 캡슐</span>
                      <span className="text-xs text-[#FF2A00] font-bold">
                        {percent}% 충전됨
                      </span>
                    </div>
                    <RadialCapsule
                      key={`home-${replayKey}`}
                      percent={percent}
                      height={96}
                      durationMs={durationMs}
                      actionText={percent >= 100 ? '열기' : '채우기'}
                      onClick={handleFillAction}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* '채우기' 인터랙션 시뮬레이션 바텀시트 / 모달 */}
      {isFillModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-black/5 space-y-4 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#FF2A00]" />
                <h3 className="text-sm font-bold">캡슐에 JAM 채우기</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFillModalOpen(false)}
                className="text-neutral-400 hover:text-black text-xs font-semibold p-1 cursor-pointer"
              >
                닫기
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              보유한 잼을 캡슐에 채우면 안쪽에서부터 그라데이션이 차오르는 모션이 실행됩니다.
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleAddJam(10)}
                className="py-3 px-2 rounded-2xl bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-xs font-bold text-neutral-800 transition-all cursor-pointer"
              >
                +10 JAM
              </button>
              <button
                type="button"
                onClick={() => handleAddJam(25)}
                className="py-3 px-2 rounded-2xl bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-xs font-bold text-neutral-800 transition-all cursor-pointer"
              >
                +25 JAM
              </button>
              <button
                type="button"
                onClick={() => handleAddJam(50)}
                className="py-3 px-2 rounded-2xl bg-[#FF2A00] hover:bg-[#E02500] active:scale-95 text-xs font-bold text-white shadow-sm transition-all cursor-pointer"
              >
                +50 JAM
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setPercent(100)
                handleAddJam(0)
              }}
              className="w-full py-2.5 rounded-xl border border-black/10 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition-all cursor-pointer"
            >
              100% 가득 채우기 (완전 채움)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
