// 자동 생성 파일 — 손으로 고치지 않는다.
// 원천: .claude/skills/jam-work/references/scheduled-jobs.md
// 생성: node scripts/gen-scheduled-jobs.mjs   (검사만: --check)
// (티켓 20260924_0905)

/** 요일은 cron 표준과 동일하게 0=일 1=월 ... 6=토 */
export type ScheduledJobSchedule =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number }
  | { type: 'weekdays'; weekdays: number[]; hour: number; minute: number }
  | { type: 'weekly-labeled'; weekday: number; labels: { label: string; hour: number; minute: number }[] }
  | { type: 'monthly'; day: number; hour: number; minute: number }

export interface ScheduledJobDef {
  name: string
  enabled: boolean
  schedule: ScheduledJobSchedule
}

export const SCHEDULED_JOBS: ScheduledJobDef[] = [
  { name: '주간', enabled: false, schedule: { type: 'weekly', weekday: 2, hour: 9, minute: 0 } },
  { name: '선별', enabled: false, schedule: { type: 'daily', hour: 6, minute: 0 } },
  { name: '주간 배포 승인', enabled: false, schedule: { type: 'weekly-labeled', weekday: 4, labels: [{ label: '확인', hour: 15, minute: 0 }, { label: '실행', hour: 23, minute: 59 }] } },
  { name: '월간', enabled: false, schedule: { type: 'monthly', day: 1, hour: 9, minute: 0 } },
  { name: '데일리 미팅', enabled: false, schedule: { type: 'weekdays', weekdays: [1, 3, 5], hour: 20, minute: 0 } },
]
