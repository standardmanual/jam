# JAM! 서비스 운영 문서 — 변경분 (2026-07-23 14:35)

> **이 버전의 변경 내용:** 배포가 안 되던 근본 원인(Vercel Hobby 플랜 cron 빈도 제한) 해결 — `ambient-drop-monitor`를 매시간에서 매일 05:00으로 하향. 부수적으로 `wandering` 크론의 stale한 "매시간" 주석/문서 표기를 실제 스케줄(매일 03:00)에 맞게 정정.
> 이전 버전: SERVICE_OPERATIONS_20260723_1417.md

---

## [수정] 배포 실패 근본 원인 — Vercel Hobby 플랜 cron 빈도 제한

**증상**: `main` 브랜치에 푸시해도 프로덕션에 반영되지 않음. Git 연동 자체는 "already connected"로 정상 확인됐으나, GitHub 커밋 상태(`Vercel` context)가 계속 `failure`였고 첨부 링크가 [Vercel cron job 요금제 문서](https://vercel.com/docs/cron-jobs/usage-and-pricing)로 연결됨.

**근본 원인**: Vercel Hobby 플랜은 **하루 1회보다 자주 도는 cron 표현식을 배포 시점에 거부**한다("Hobby accounts are limited to daily cron jobs. This cron expression would run more than once per day."). `vercel.json`에 `ambient-drop-monitor`(`0 * * * *`, 매시간)가 있었고, 이 항목 하나 때문에 **배포 자체가 통째로 실패** — 해당 커밋의 다른 변경사항(POI 검색 버그 수정 등)도 전부 함께 막혀 있었음.

**정정 사항**: 조사 과정에서 `wandering` 크론의 코드 주석("매 시간 실행")과 이전 SERVICE_OPERATIONS 문서(§14)의 "매시간" 표기가 **실제 `vercel.json` 스케줄(`0 3 * * *`, 매일 03:00)과 어긋나 있던 것도 함께 발견** — `wandering`은 이미 Hobby 제한을 준수하고 있었고 배포 실패의 원인이 아니었음(주석만 stale했던 것). 이번에 코드 주석을 실제 동작에 맞게 정정.

### 조치

- `vercel.json`: `ambient-drop-monitor` 스케줄 `0 * * * *` → `0 5 * * *`(매일 05:00, 기존 크론들과 시간대 겹치지 않게 배치: sync 12:00 / wandering 03:00 / poi-cleanup 00:00 / ambient-drop-monitor 05:00)
- `src/app/api/cron/ambient-drop-monitor/route.ts`, `src/app/api/cron/wandering/route.ts`: 주석을 실제 스케줄에 맞게 정정
- `PRD/badge/BADGE_ENGINE_UNIFIED.md` §3.12: "매시간" → "매일 05:00"으로 정정

### 참고 — 부수적으로 발견·정리한 것

Git 연동 재확인 과정에서 `vercel git connect`를 `jam-web` 서브디렉토리(모노레포 내 실제 배포 루트)에서 실행했다가 `.git`이 없어 신규 프로젝트 `jam-web`이 잘못 생성됨 — 즉시 삭제하고, `vercel link --project jam`으로 기존 프로젝트에 올바르게 재연결함. 최종적으로 Git 연동 자체는 이상 없었던 것으로 확인(연동 문제가 아니라 cron 제한이 원인).

### 향후 참고

앰비언트 드랍 보충 주기가 매시간 → 매일로 줄어든 만큼, `ambient_drop_policy.replenish_batch_size`(현재 기본 30)가 목표 수량 대비 너무 낮으면 목표치 도달까지 여러 날이 걸릴 수 있음 — POI 수가 많은 지역에서 체감 발견 밀도가 낮다는 피드백이 오면 `/admin/ambient-drop-policy`에서 이 값을 올려 보정.

---

기타 섹션은 이전 버전과 동일.
