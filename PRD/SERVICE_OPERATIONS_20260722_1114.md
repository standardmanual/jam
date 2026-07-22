# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 11:14)

> **이 버전의 변경 내용:** 036 마이그레이션의 "전 배지 동일 이미지" 버그 수정 + 활동배지까지 확장한 균등 재랜덤 배정 마이그레이션(037) 추가  
> 이전 버전: SERVICE_OPERATIONS_20260722_1101.md

---

## [버그 수정 + 확장] 037_randomize_all_badge_images.sql

### 036의 버그

`036_backfill_missing_badge_images.sql`은 다음 형태였다:

```sql
UPDATE badges b
SET image_url = (SELECT path FROM sample_images ORDER BY random() LIMIT 1)
WHERE b.image_url IS NULL;
```

PostgreSQL은 **바깥 테이블(`b`)과 연관되지 않은(uncorrelated) 서브쿼리**를 행마다 재실행하지 않고 쿼리 전체에서 **단 한 번만 계산(InitPlan)**해 모든 대상 행에 동일한 결과를 재사용한다. `random()`이 서브쿼리 안에 있었기 때문에, 얼핏 무작위처럼 보이지만 실제로는 아이템배지 900개 전부가 그 한 번의 계산 결과인 **같은 이미지 한 장**으로 채워지는 결함이 발생했다.

### 037 수정 내용

1. **행별 무작위 배정 수정**: 스칼라 서브쿼리 대신 `row_number() OVER (ORDER BY random())` 기반의 진짜 다대다 JOIN으로 교체 (035의 피드 백필 마이그레이션에서 검증된 것과 동일한 패턴). 이미지 풀과 대상 배지를 각각 셔플한 뒤 순번으로 순환 매칭 — 372장이 1060개 대상 행에 걸쳐 근접하게 균등 사용(장당 약 2~3회)되면서도 매칭 자체는 무작위.
2. **대상 확장**: 기존 036이 잘못 채운 아이템배지(`image_url LIKE '/badges/sample/%'`)뿐 아니라, 그동안 공유 placeholder(`/badges/activity-placeholder.png`)를 쓰던 **활동배지 160개도 포함**해 함께 재배정.

### 적용 방법

Supabase Dashboard SQL Editor에서 `jam-web/supabase/migrations/037_randomize_all_badge_images.sql` 실행 (036 위에 덧씌우는 형태 — 036 실행 여부와 무관하게 안전하게 실행 가능).

검증:
```sql
-- 372개 행, 각 count가 2~3 근처로 고르게 분포해야 정상 (한 값에 몰리면 재발)
SELECT image_url, count(*) FROM badges WHERE image_url LIKE '/badges/sample/%' GROUP BY image_url ORDER BY count(*) DESC;

-- 0이어야 정상 (활동배지도 전부 교체됨)
SELECT count(*) FROM badges WHERE image_url = '/badges/activity-placeholder.png';
```

### 운영 유의사항

- **일반 원칙**: 이후 유사한 "행마다 다른 무작위 값" 배정 마이그레이션을 작성할 때는 `UPDATE ... SET x = (SELECT ... ORDER BY random() LIMIT 1)` 패턴을 쓰지 말 것 — 반드시 row_number 기반 JOIN 또는 SET 절에 `random()`을 직접 노출하는 방식(서브쿼리로 감싸지 않음)을 사용한다.
- 배포된 public 이미지 372장은 036 커밋에서 이미 반영되어 있어 이번엔 코드 변경 없이 DB 마이그레이션만 추가로 적용하면 된다.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_1101.md)과 동일.
