---
id: "20260929_1636"
category: Infra
priority: P1
status: OPEN
created: 2026-09-29
closed:
---

# [Infra] poi-cleanup 크론 라우트에 테스트가 없고, CRON_SECRET이 비면 인증 비교가 통과할 수 있다

## 핵심 요약
- 요구사항: `CRON_SECRET`이 비어 있으면 무조건 401로 막고, 라우트 분기를 테스트로 고정한다. **2026-10-06 범위를 기존 크론 4종으로 넓히고 P1로 올렸다**(아래 배경 마지막 단락).
  새 크론 2종(`ops-reconcile`·`ops-stop-signals`)처럼 `!secret ||`를 먼저 검사한다.
- 관련 파일: `jam-web/src/app/api/cron/poi-cleanup/route.ts` L21-53(L22-24 인증 비교), `ambient-drop/route.ts` 30, `notifications/route.ts` 21, `external-inputs/route.ts` 17,
  본보기 `ops-reconcile/route.ts` 21–22, `purge-logs.test.ts`

## 배경 / 문제 정의
2026-09-29 `/jam-ship` 민지 모드 ②(주의)·③(참고). 인증이 `authHeader !== `Bearer ${process.env.CRON_SECRET}``라서 변수가 없으면 "Bearer undefined"가 통과한다. 프로덕션에는 `CRON_SECRET`이 설정돼 있음을 카리나가 확인했다(`vercel env ls production`) — 현재 실제 위험은 없다. 이번 배포로 이 라우트가 `abusing_logs` 삭제까지 하므로 방어를 굳힌다. 다른 크론 라우트도 같은 비교 패턴인지 함께 본다.

- 2026-10-06 `/jam-ship` 민지 모드 ② 1번 [보안/주의]과 카리나 확인: **jam-stage 프로젝트에는 `CRON_SECRET`이 없다**(프로덕션 환경변수 목록, 값은 열람하지 않음).
  staging에는 Vercel 접근 보호가 없고 `/api/cron`은 로그인 없이 닿는 경로라(`src/proxy.ts` 65), 누구나 `stage.j-a-m.app/api/cron/ambient-drop` 등에 `Authorization: Bearer undefined`를 보내면
  인증을 통과해 공용 DB에서 앰비언트 드랍 생성·알림 발송·POI 정리·외부 입력 수집이 돈다(코드와 변수 목록으로 확인, 실제 호출은 하지 않음). 사용자 결정으로 P1, 배포 직후 처리.
  jam-stage에 `CRON_SECRET`을 넣지 않는 이유는 티켓 20260906_1142(같은 값이면 양쪽에서 이중 발사)다. 이 수정은 값이 없을 때 막는 것이라 그 결정과 충돌하지 않는다.

## 구현 계획

> 2026-10-06 카리나 규모 사전 판정: 라우트 4·테스트 4~5파일, 약 150줄(poi-cleanup 라우트 테스트 신규와 `purge-logs.test.ts` 경계 케이스 포함). 아래 표에 파일·줄 위치가 있어 첫 호출부터 계획 반환 면제로 진행한다.

| 경로 | 위치 | 변경 |
|---|---|---|
| `jam-web/src/app/api/cron/ambient-drop/route.ts` | 29–30 | `const secret = process.env.CRON_SECRET` 뒤 `if (!secret \|\| authHeader !== \`Bearer ${secret}\`)` — 본보기 `ops-reconcile/route.ts` 21–22 |
| `jam-web/src/app/api/cron/notifications/route.ts` | 20–21 | 같음 |
| `jam-web/src/app/api/cron/external-inputs/route.ts` | 16–17 | 같음 |
| `jam-web/src/app/api/cron/poi-cleanup/route.ts` | 20–21 | 같음 |
| 테스트 | `ambient-drop`·`notifications`·`external-inputs`의 `__tests__/route.test.ts`, 새 `poi-cleanup/__tests__/route.test.ts`, `purge-logs.test.ts` | 라우트마다 「`CRON_SECRET` 미설정 + `Bearer undefined` 헤더 → 401, 핸들러 미호출」. poi-cleanup은 아래 완료 조건의 나머지(불일치 401, RPC 오류 500, 파기 실패 200)와 `purge-logs.test.ts` 경계 케이스 |

- 새 크론 2종과 같은 모양으로 맞추되 공용 함수로 묶지는 않는다(이번 범위는 구멍 막기).
- 배포: staging push만으로 staging의 구멍이 닫힌다(jam-stage가 이 코드를 서빙한다). 프로덕션은 값이 설정돼 있어 다음 `/jam-ship`에서 함께 나간다.

## 완료 조건
- 크론 4종(`ambient-drop`·`notifications`·`external-inputs`·`poi-cleanup`) 모두 `CRON_SECRET` 미설정 시 401이고 `Bearer undefined`가 통과하지 않는다(라우트마다 테스트).
- `CRON_SECRET` 미설정 시 401(테스트).
- 불일치 401, RPC 오류 500·파기 미호출, 파기 실패 시 200과 `abusingLogPurgeError`, 응답의 `purgedAbusingLogs` 필드 테스트.
- `purge-logs.test.ts`에 연도 경계·윤년·정확히 경계 시각(`lt`) 케이스 추가.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```
