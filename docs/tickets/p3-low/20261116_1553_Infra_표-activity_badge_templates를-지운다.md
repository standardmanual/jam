---
id: "20261116_1553"
category: Infra
priority: P3
status: OPEN
created: 2026-11-16
closed:
parent: "20261115_2353"
---

# [Infra] 쓰지 않는 표 activity_badge_templates를 지운다

## 핵심 요약
- 요구사항: 액티비티 배지 템플릿을 코드로 정의하는 방식으로 바꾸면서(티켓 20261116_1513) 표 `activity_badge_templates`를 읽고 쓰는 코드가 없어졌다. 표와 그 정책·함수를 지운다. 프로덕션·staging 공용 DB의 변경이라 메인 세션이 실행 전 점검(되돌림 SQL, 백업)을 거쳐 실행한다.
- 관련 파일: `jam-web/supabase/migrations/344_*.sql`(표를 만든 마이그레이션), `jam-web/src/types/database.ts`·`database.generated.ts`의 `activity_badge_templates` 타입

## 배경 / 문제 정의
표에 1줄이 남아 있다(`metric`, 2026-11-16 11:47에 사용자가 올린 SVG 51KB). 이 SVG는 사용자의 옛 템플릿 시도이고, 새 템플릿은 코드에 있다. 지우기 전에 이 1줄을 백업한다.

## 상세 요구사항
- 확장→전환→축소 중 마지막(축소) 단계다. 쓰는 코드가 없다는 것을 `grep -rn activity_badge_templates jam-web/src jam-web/scripts`로 다시 확인한다.
- 지우는 SQL과 되돌림 SQL(표 정의와 백업한 1줄)을 `jam-web/supabase/migrations/`에 남긴다.

## 완료 조건
- 표가 없고, 타입 파일이 다시 생성돼 있고, `npm run typecheck`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 잔여 이슈
-
