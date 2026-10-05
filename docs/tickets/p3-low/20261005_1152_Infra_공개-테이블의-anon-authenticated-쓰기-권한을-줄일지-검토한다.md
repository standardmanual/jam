---
id: "20261005_1152"
category: Infra
priority: P3
status: OPEN
created: 2026-10-05
closed:
---

# [Infra] 공개 테이블의 anon·authenticated 쓰기 권한을 줄일지 검토한다

> 발견: 티켓 20261004_2041(E4) 게이트의 민지 범위 밖 발견물([보안/참고]). 이번 변경이 만든 문제는 아니고 Supabase 기본값이다.

## 핵심 요약

- 현상(확인한 사실, 2026-10-05 `information_schema.role_table_grants`): `item_books`에 `anon`·`authenticated`가 SELECT·INSERT·UPDATE·DELETE·TRUNCATE·REFERENCES·TRIGGER 권한을 모두 갖는다.
  쓰기 차단은 RLS가 켜져 있고 쓰기 정책이 없다는 사실 하나에 걸려 있다. 다른 공개 테이블도 같은 기본값일 가능성이 크다(확인 전).
- 요구사항: 앱의 모든 쓰기가 service 클라이언트라면(E4 조사에서 `item_books`는 그렇다), 쓰기를 받지 않는 테이블에서 `anon`·`authenticated`의 INSERT·UPDATE·DELETE·TRUNCATE를 회수해 이중 방어를 둘지 검토한다.
  RLS를 실수로 끄거나 넓은 쓰기 정책을 추가해도 바로 열리지 않게 하는 목적이다.
- 주의: 사용자 세션으로 쓰는 테이블(유저 소유 행 등)은 회수하면 안 된다. Supabase 기본 권한·새 테이블의 기본 권한(`ALTER DEFAULT PRIVILEGES`)과의 관계, 대시보드·Realtime 영향을 확인한다. DB 변경이므로 마이그레이션 파일·되돌림 SQL·사용자 승인 절차를 따른다.
- 관련 파일: `jam-web/supabase/migrations/`(권한을 다룬 기존 마이그레이션 유무), `docs/specs/prd/02_DATA_MODEL.md`.

## 완료 조건

- 테이블별로 「사용자 세션 쓰기 필요 여부」 표를 만들고(코드 근거), 회수할지와 범위를 사용자와 정한다. 회수한다면 마이그레이션과 되돌림 SQL을 남기고 적용 뒤 권한 조회로 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모
-

### 잔여 이슈
-
