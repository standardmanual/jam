---
id: "20260929_1505"
category: Infra
priority: P3
status: OPEN
created: 2026-09-29
specs:
  - docs/service/legal/PRIVACY_POLICY.md
---

# [Infra] 부정 이용 탐지 기록 자동 파기가 실패하면 알림을 보낸다

## 핵심 요약
- 요구사항: 일일 크론 `/api/cron/poi-cleanup`의 `abusing_logs` 3개월 파기(티켓 20260929_1327)가 실패해도 크론은 200을 반환하고, 실패는 응답 JSON의 `abusingLogPurgeError`와 `console.error`에만 남는다. 파기가 계속 실패하면 개인정보 처리방침 3항의 보유기간(3개월)을 어기게 되는데 알아차릴 경로가 없다. 실패를 `#jam-alert` 등 기존 알림 경로로 알린다.
- 관련 파일: `jam-web/src/app/api/cron/poi-cleanup/route.ts`(43~52행 파기 호출·응답), `jam-web/src/lib/abusing/purge-logs.ts`, 알림 채널 정의는 `.claude/skills/jam-work/references/scheduled-jobs.md` 「Slack 알림」 절

## 배경 / 문제 정의
민지가 티켓 20260929_1327 게이트 리뷰에서 범위 밖 발견물([참고/운영])로 올렸다. 2026-09-29 기준 `abusing_logs`는 0행이라 당장 위험은 없고, 첫 파기 대상이 생기는 시점은 2026-10-01 이후 기록이 쌓이고 3개월이 지난 뒤다.

## 완료 조건
- 파기 함수가 오류를 반환하면 운영자가 볼 수 있는 알림이 한 번 이상 발생한다(재현: 테스트에서 삭제 오류를 주입).
- 파기가 성공하면 알림이 발생하지 않는다.
