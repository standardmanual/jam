# DB 마이그레이션 작성 규칙 — 단일 원천

> 아현(`jam-developer`)이 `db` 유형 티켓, 또는 마이그레이션 파일을 하나라도 추가하는 티켓에서
> **파일을 쓰기 전에** 읽는다. 민지 점검표 8번, `CLAUDE.md` 규칙 6, `orchestrator.md` §4가 이
> 문서를 가리킨다 — 서술을 옮겨 적지 않는다. (아현 정의 Hard rule 3에서 분리, 티켓 20260922_1800)
>
> 전제: Supabase는 staging·프로덕션 공용 단일 DB다. 마이그레이션은 카리나가 적용하는 순간
> 프로덕션에 반영된다(`docs/specs/DEV_PROCESS_GUARDRAILS.md` 패턴 2). 아현은 파일만 쓰고
> 절대 실행하지 않는다 — Supabase MCP도, `psql`도 없다.

## 1. 추가와 제거가 함께 있는 변경은 확장 → 전환 → 축소로 나눈다

컬럼·함수를 새로 만들면서 옛 것도 없애는 변경은 **세 개의 마이그레이션**으로 쪼갠다. 한 파일에
합치지 않는다.

1. **확장(Expand)** — 새 모양을 덧붙이기만 한다(nullable 컬럼, 새 함수 시그니처). 옛 모양은
   그대로 동작한다.
2. **전환(Switch)** — 새 모양을 읽고 쓰기 시작하는 코드 변경. 티켓의 일반 diff로 나간다.
3. **축소(Contract)** — 옛 모양을 참조하는 곳이 없어진 뒤, 별도 마이그레이션으로 지운다.

①과 ③을 같은 파일에 넣지 않는 이유: 배포 구간에는 옛 코드와 새 코드가 동시에 돈다. 없앤
모양을 아직 기대하는 쪽이 깨진다.

## 2. 기존 행에 새 모양을 채워야 하면 전환을 세 단계로 나눈다

각 단계가 단독으로 배포 가능해야 한다: **이중 쓰기**(코드가 옛·새 모양에 모두 쓴다) → **백필**
(기존 행 채우기) → **읽기 전환**.

- 백필은 별도 파일(`seed_*.sql` 또는 별도 마이그레이션)로 쓰고 **청크로 나눈다** — 큰 테이블에
  `UPDATE` 하나를 걸면 테이블이 잠긴다.
- 큰 인덱스는 `CREATE INDEX CONCURRENTLY`로 만들어 쓰기를 막지 않는다. 트랜잭션 블록 안에서
  실행할 수 없으므로 요약에 그 사실을 적는다 — 카리나가 단독으로 적용한다.

## 3. 함수 인자 수를 바꾸면 옛 시그니처를 먼저 지운다

`CREATE OR REPLACE FUNCTION` 바로 앞에 `DROP FUNCTION IF EXISTS public.<name>(<옛 인자 타입>);`을
명시한다. 없으면 Postgres가 두 시그니처를 오버로드로 함께 보관하고, 양쪽에 다 맞는 호출이
런타임에 `is not unique`로 실패한다(`DEV_PROCESS_GUARDRAILS.md` 패턴 14).

## 4. 모든 마이그레이션 파일은 되돌림 SQL을 함께 싣는다

되돌림이 없는 마이그레이션은 `/jam-ship`이 롤백할 수 없는 배포다. 파일을 넘기기 전에 되돌림
경로부터 쓴다. **표식은 기계가 검사한다** — 두 형식 중 하나:

1. 파일 끝 주석 블록. 첫 줄은 `-- 되돌림 SQL`(또는 `-- ROLLBACK`)로 시작하고, 되돌림 문장을
   그 아래 SQL 주석으로 둔다:

   ```sql
   -- 되돌림 SQL
   -- DROP INDEX IF EXISTS public.idx_example;
   ```

2. 같은 브랜치에 추가하는 짝 파일: `181_foo.sql` → `181_foo_down.sql`.

`scripts/deploy-gate.mjs check`가 번호 180 이상의 신규 마이그레이션마다 이 두 형식을 찾고(기준
번호의 단일 원천은 `docs/agents/contract.json`의 `deploy_gate.rollback_sql_required_from`), 둘 다
없으면 배포를 막는다. `seed_*.sql`은 세기만 하고 검사하지 않는다.

> 이식 출처: `deprecation-and-migration` 스킬 §Database Schema Migrations (Expand/Contract).
