# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 11:01)

> **이 버전의 변경 내용:** 이미지 없는 배지(주로 아이템배지) 전량에 샘플 이미지 랜덤 배정 — 신규 마이그레이션 036 + public 이미지 애셋 372장 추가  
> 이전 버전: SERVICE_OPERATIONS_20260722_0927.md

---

## [데이터] 036_backfill_missing_badge_images.sql

### 배경

`badges.image_url IS NULL`인 배지(019 시드 시점부터 이미지 미설정이던 아이템배지 전량)에 실제 이미지가 하나도 없어 관리자/서비스 화면에서 빈 아이콘으로 표시되던 상태. `Reference/sample/`에 있던 배지 이미지 샘플 372장을 활용해 채웠다.

### 내용

- 원천 이미지 372장 → `jam-web/public/badges/sample/s001.png` ~ `s372.png`로 복사 (파일명에 공백·괄호가 섞여 있어 URL-safe하게 정규화)
- 마이그레이션 036: `image_url IS NULL`인 모든 배지 행에 대해 372장 중 **행마다 독립적으로 무작위 1장**을 배정 (`ORDER BY random() LIMIT 1` 상관 서브쿼리) — 중복 배정 허용
- 활동배지(160개)는 이미 공유 placeholder(`/badges/activity-placeholder.png`)를 보유해 `IS NULL` 조건에 걸리지 않으므로 이번 배정 대상에서 자동 제외됨

### 적용 방법

이전 마이그레이션들과 동일하게 Supabase Dashboard SQL Editor에서 `jam-web/supabase/migrations/036_backfill_missing_badge_images.sql` 실행. 검증:

```sql
SELECT count(*) FROM badges WHERE image_url IS NULL;  -- 0이어야 정상
```

### 운영 유의사항

- 배포(Vercel)에 `jam-web/public/badges/sample/` 372장이 함께 올라가야 이미지가 실제로 보인다 — 마이그레이션만 적용하고 배포가 안 되어 있으면 깨진 이미지로 표시됨.
- 이 샘플 이미지는 **임시 placeholder 용도** — 배지 이름·설명에 맞춘 전용 이미지로 추후 교체 필요 (관련 논의: AI 이미지 생성 규모/비용 산정 — 아이템배지 900개 기준 외부 이미지 API 사용 시 대략 $20~200 범위, 별도 진행 필요).
- 중복 배정은 의도된 동작(요청사항) — 같은 이미지가 여러 배지에 쓰여도 정상.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_0927.md)과 동일.
