---
id: "20260929_1636"
category: Infra
priority: P3
status: OPEN
created: 2026-09-29
closed:
---

# [Infra] poi-cleanup 크론 라우트에 테스트가 없고, CRON_SECRET이 비면 인증 비교가 통과할 수 있다

## 핵심 요약
- 요구사항: `CRON_SECRET`이 비어 있으면 무조건 401로 막고, 라우트 분기를 테스트로 고정한다.
- 관련 파일: `jam-web/src/app/api/cron/poi-cleanup/route.ts` L21-53(L22-24 인증 비교), `purge-logs.test.ts`

## 배경 / 문제 정의
2026-09-29 `/jam-ship` 민지 모드 ②(주의)·③(참고). 인증이 `authHeader !== `Bearer ${process.env.CRON_SECRET}``라서 변수가 없으면 "Bearer undefined"가 통과한다. 프로덕션에는 `CRON_SECRET`이 설정돼 있음을 카리나가 확인했다(`vercel env ls production`) — 현재 실제 위험은 없다. 이번 배포로 이 라우트가 `abusing_logs` 삭제까지 하므로 방어를 굳힌다. 다른 크론 라우트도 같은 비교 패턴인지 함께 본다.

## 완료 조건
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
