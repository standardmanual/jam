'use client'

/**
 * 어드민 생성·수정·조회 화면 공용 2단 레이아웃 — 티켓 20260911_1454
 *
 * 원래 배지 화면 전용이던 `components/admin/badges/BadgeEditorLayout.tsx`(티켓 20260911_0901)
 * 에서 옮겨 왔다. 레이아웃 골격·상태 배지·필드 그리드·읽기 전용 그리드는 원래도 배지 전용
 * 식별자 타입에 묶여 있지 않았다. 섹션 카드·섹션 목차·섹션으로 스크롤하는 동작만 배지 전용
 * `BadgeSectionId`에 묶여 있었는데, 여기서는 그 자리를 제네릭 `Id extends string` +
 * `namespace`(화면별 DOM id 접두어)로 대체해 배지·투데이 등 여러 화면이 같은 부품을 쓴다.
 *
 * `BadgeEditorLayout.tsx`는 이 파일을 `namespace: 'badge'`로 감싼 하위 호환 래퍼로 남는다 —
 * 이미 검증된 배지 화면 3개 파일(BadgeForm·BadgeConditionSection·BadgeDetail)은 이름 그대로
 * 계속 그 파일에서 import하며, 이번 티켓에서 건드리지 않는다.
 *
 * 설계 원본은 `Service Plan/Assets/20260911_badge-form-renewal-prototype.html`이지만, 색·서체는
 * 목업이 아니라 어드민 shadcn 컴포넌트·테마 토큰을 쓴다(어드민은 MODULAR 적용 대상이 아니다).
 */
import type { ReactNode } from 'react'
import { Card } from '@/components/admin/ui/card'
import { cn } from '@/lib/utils'

/**
 * 폭 기준은 **뷰포트가 아니라 이 레이아웃이 실제로 받은 폭**(컨테이너 쿼리)이다.
 *
 * 어드민은 왼쪽 사이드바가 16rem을 차지해서, 뷰포트 `lg`(1024px)에서 2단으로 나누면 섹션 열이
 * 360px 남짓으로 쪼그라든다(사이드바 펼침 기준). 그래서 목업의 「lg 미만은 1단」을 본문 폭 기준
 * `@4xl`(56rem)로 옮겼다 — 사이드바를 접든 펴든 섹션 열이 최소 550px대를 유지한다.
 *
 * 어드민 헤더(`AdminHeader`, sticky h-14) 아래로 붙도록 레일 sticky 기준을 4.5rem으로 둔다.
 */
const RAIL_STICKY_CLASS = '@4xl:sticky @4xl:top-[4.5rem] @4xl:max-h-[calc(100vh-5.5rem)] @4xl:overflow-y-auto'

/**
 * `header`(뒤로 가기·페이지 제목)는 섹션 열 위에만 두고 레일은 페이지 맨 위에서 시작한다.
 * 레일이 제목 아래에서 시작하면 첫 화면에서 레일 끝(저장 버튼)이 화면 밖으로 밀린다 —
 * 레일 높이 상한이 `100vh - 5.5rem`(어드민 헤더 3.5rem + 페이지 위 여백 2rem)이라, 레일 윗변이
 * 그 5.5rem 지점에 있어야 첫 화면에서도 레일 전체가 화면 안에 든다(1440×900·1280×720 실측).
 * 좁은 폭에서는 제목 → 레일 → 섹션 순서로 쌓인다.
 */
export function EditorShell({
  header,
  main,
  rail,
  railLabel,
}: {
  header?: ReactNode
  main: ReactNode
  rail: ReactNode
  railLabel: string
}) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px] @4xl:items-start">
        {header && <div className="order-1 min-w-0 @4xl:col-start-1 @4xl:row-start-1">{header}</div>}
        <div
          className={cn(
            'order-3 flex min-w-0 flex-col gap-4 @4xl:col-start-1',
            header ? '@4xl:row-start-2' : '@4xl:row-start-1'
          )}
        >
          {main}
        </div>
        {/* 레일은 좁은 폭에서 섹션 열 위로 올라온다(order-2). 그 사이 폭에서는 2열로 펼친다 */}
        <aside
          aria-label={railLabel}
          className={cn(
            'order-2 grid grid-cols-1 content-start gap-4 @2xl:grid-cols-2 @4xl:col-start-2 @4xl:row-start-1 @4xl:grid-cols-1',
            header ? '@4xl:row-span-2' : undefined,
            RAIL_STICKY_CLASS
          )}
        >
          {rail}
        </aside>
      </div>
    </div>
  )
}

/**
 * 레일 액션 카드(저장·수정·삭제)에 붙이는 클래스 — 레일이 화면보다 길어 스크롤되더라도 이 카드는
 * 레일 아래쪽에 붙어 늘 보인다(레일은 `overflow-y-auto` 스크롤 컨테이너다). 1440×900 실측에서
 * 미리보기·목차 아래로 밀려 저장 버튼이 첫 화면에 보이지 않았다(티켓 20260911_0901).
 */
export const RAIL_ACTIONS_CLASS = '@4xl:sticky @4xl:bottom-0 @4xl:z-10'

/** 레일 카드 1장 — 작은 제목을 단다 */
export function RailCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-4', className)}>
      {title && <p className="mb-2.5 text-xs font-medium text-muted-foreground">{title}</p>}
      {children}
    </Card>
  )
}

export type SectionTone = 'ok' | 'bad' | 'set' | 'idle'
export interface SectionStatus {
  tone: SectionTone
  text: string
}

/**
 * 상태 톤별 색. shadcn `Badge`에 className으로 덮어쓰지 않고 직접 칠한다 — 이 저장소의 `cn`은
 * 클래스를 병합하지 않고 이어 붙이기만 해서(`lib/utils.ts`) 변형 색과 충돌하면 어느 쪽이
 * 이길지 보장되지 않는다.
 */
const TONE_CLASS: Record<SectionTone, string> = {
  ok: 'border-transparent bg-secondary text-secondary-foreground',
  bad: 'border-transparent bg-destructive/10 text-destructive',
  set: 'border-transparent bg-primary text-primary-foreground',
  idle: 'border-border bg-transparent text-muted-foreground',
}

/** 섹션 상태 배지 — 섹션 머리·목차·조건 그룹 머리가 같은 톤 규칙을 쓴다 */
export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums',
        TONE_CLASS[status.tone]
      )}
    >
      {status.text}
    </span>
  )
}

/**
 * 섹션 DOM id — 화면마다(`namespace`) 접두어를 달리 해 같은 페이지 안에서 겹치지 않게 한다.
 * 배지 화면은 `namespace: 'badge'`를 써서 기존 `badge-section-${id}` 문자열과 완전히 같다
 * (하위 호환 — `BadgeEditorLayout.tsx` 참고).
 */
export function sectionDomId(namespace: string, id: string): string {
  return `${namespace}-section-${id}`
}

/** 섹션 제목 요소의 DOM id — 목차로 이동한 뒤 포커스를 둔다 */
export function sectionHeadingId(namespace: string, id: string): string {
  return `${namespace}-section-${id}-heading`
}

export interface SectionCardProps<Id extends string> {
  namespace: string
  id: Id
  title: string
  description: string
  status?: SectionStatus
  children: ReactNode
}

/** 섹션 카드 — 제목·한 줄 설명·상태 배지를 머리에 두고, 목차 이동 대상이 된다 */
export function SectionCard<Id extends string>({ namespace, id, title, description, status, children }: SectionCardProps<Id>) {
  const headingId = sectionHeadingId(namespace, id)
  return (
    <Card id={sectionDomId(namespace, id)} className="scroll-mt-20">
      <section aria-labelledby={headingId}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            {/* 목차로 이동하면 여기에 포커스를 둔다(tabIndex -1) */}
            <h2 id={headingId} tabIndex={-1} className="text-base font-semibold text-foreground outline-none">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          {status && <SectionStatusBadge status={status} />}
        </div>
        <div className="flex flex-col gap-5 px-5 pb-5 pt-4">{children}</div>
      </section>
    </Card>
  )
}

/** 섹션으로 스크롤하고 제목에 포커스를 둔다 — 모션 감소 설정이면 즉시 이동 */
export function scrollToSection(namespace: string, id: string) {
  const el = document.getElementById(sectionDomId(namespace, id))
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  document.getElementById(sectionHeadingId(namespace, id))?.focus({ preventScroll: true })
}

export interface SectionNavProps<Id extends string> {
  namespace: string
  items: { id: Id; label: string; status?: SectionStatus }[]
}

/** 레일의 섹션 목차 — 상태를 보여 주고 누르면 해당 섹션으로 이동한다 */
export function SectionNav<Id extends string>({ namespace, items }: SectionNavProps<Id>) {
  return (
    <nav aria-label="섹션 목차">
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${sectionDomId(namespace, item.id)}`}
              onClick={(e) => {
                e.preventDefault()
                scrollToSection(namespace, item.id)
              }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{item.label}</span>
              {item.status && (
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    item.status.tone === 'bad' ? 'text-destructive' : item.status.tone === 'ok' ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {item.status.text}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * 섹션 안 입력·값 그리드의 열 규칙 — 1열 → 2열 → 3열.
 * 폭 기준은 그리드를 감싼 `@container`의 실제 폭이다(위 `EditorShell` 주석과 같은 이유).
 * 부모에 `@container` 클래스가 있어야 한다.
 */
export const FIELD_GRID_CLASS = 'grid grid-cols-1 gap-x-3.5 gap-y-4 @sm:grid-cols-2 @lg:grid-cols-3'

/** 그리드 칸 수 → 클래스. 3이면 한 줄 전체 */
export function fieldSpanClass(span?: 2 | 3): string {
  if (span === 3) return '@sm:col-span-2 @lg:col-span-3'
  if (span === 2) return '@sm:col-span-2'
  return ''
}

/** 읽기 전용 라벨-값 그리드(조회 화면) */
export function ReadOnlyGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <dl className={FIELD_GRID_CLASS}>{children}</dl>
    </div>
  )
}

export function ReadOnlyItem({
  label,
  children,
  span,
}: {
  label: string
  children: ReactNode
  /** 3열 그리드에서 차지하는 칸 수. 3이면 한 줄 전체 */
  span?: 2 | 3
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', fieldSpanClass(span))}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  )
}
