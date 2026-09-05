/**
 * 정합성 검사 결과 패널 (티켓 20260905_0033)
 *
 * 판정은 전부 `checkGateMissionConsistency`(순수 함수)가 한다 — 이 파일은 그리기만 한다.
 * 서버 컴포넌트다(상호작용이 없다 — 클라이언트 번들에 넣을 이유가 없다).
 */
import type { GateIssueLevel, GateMissionIssue } from '@/lib/missions/gateMissions'

const LEVEL_STYLE: Record<GateIssueLevel, { box: string; chip: string; label: string }> = {
  error: {
    box: 'border-red-200 bg-red-50 text-red-700',
    chip: 'bg-red-100 text-red-700',
    label: '고쳐야 해요',
  },
  warn: {
    box: 'border-amber-200 bg-amber-50 text-amber-800',
    chip: 'bg-amber-100 text-amber-800',
    label: '확인해주세요',
  },
  info: {
    box: 'border-border bg-muted/40 text-muted-foreground',
    chip: 'bg-neutral-200 text-neutral-700',
    label: '참고',
  },
}

const LEVEL_ORDER: GateIssueLevel[] = ['error', 'warn', 'info']

export default function GateConsistencyPanel({ issues }: { issues: GateMissionIssue[] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        정합성 검사를 통과했어요. 축마다 두 단계가 하나씩 차 있고, 보상 배지와 노출 조건도 모두 살아 있어요.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold">정합성 검사</h2>
      {LEVEL_ORDER.flatMap((level) => {
        const list = issues.filter((i) => i.level === level)
        if (list.length === 0) return []
        const style = LEVEL_STYLE[level]
        return [
          <div key={level} className={`rounded-2xl border px-4 py-3 text-sm ${style.box}`}>
            <p className="font-bold mb-2">
              {style.label} {list.length}건
            </p>
            <ul className="space-y-1.5">
              {list.map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
                  <span className={`rounded px-1.5 py-px text-[11px] font-medium ${style.chip}`}>{issue.code}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </div>,
        ]
      })}
    </div>
  )
}
