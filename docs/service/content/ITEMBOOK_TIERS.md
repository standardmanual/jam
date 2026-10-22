---
type: guideline
description: "컬렉션 4등급 구조(tier_mode)를 쓰는 컬렉션의 배지 이름 맞추기 규칙과, tier_mode를 켜기 전에 꽂힌 등급 분포를 점검하는 절차를 컨텐츠 입력자용으로 정리한 문서다."
tags: [컬렉션, 등급, 배지]
basis:
  - "docs/service/prd/02_DATA_MODEL.md"
---

# 컬렉션 4등급 구조 — 컨텐츠 입력 규칙

> 컨텐츠 입력자가 보는 짧은 규칙 문서다. 4등급 구조(칸 묶기, 컬렉션 등급, 완성·보상 기록, `tier_mode`)가
> 어떻게 작동하는지는 `docs/service/prd/02_DATA_MODEL.md` 4-2절이 단일 원천이고, 이 문서는 구조를 다시
> 적지 않는다. 티켓 20261016_2340.

## 1. 이름 맞추기

같은 컬렉션 안에서 **이름이 같은 아이템 배지**를 한 칸으로 본다. 한 칸에 들어가는 배지는 등급(Common·Rare·Epic·Mystic)만 다르다.

- 같은 칸에 넣을 배지는 이름이 글자 하나까지 같아야 한다. 띄어쓰기·접두어가 하나라도 다르면 다른 칸이다.
- 한 칸에는 같은 등급 배지를 두 개 넣지 않는다.
- 등급이 비어 있는 배지는 어느 등급의 칸에도 들지 않는다.
- 옛 아이템 배지 가운데 이름 앞에 접두어가 붙은 것이 있다(마이그레이션 055). 이런 배지는 이름을 맞추기 전에는 4등급이 한 칸으로 묶이지 않는다.
- 등급마다 칸 수(이름 수)가 같도록 맞춘다. 칸 수가 모자란 등급은 그 수만큼만 채우면 완성되고, 많은 등급은 그만큼 더 채워야 한다.

## 2. tier_mode를 켜기 전 점검

`tier_mode`를 켜기 전에 컬렉션에 이미 여러 등급의 배지를 꽂아 둔 유저가 있으면 그 컬렉션에 새로 꽂는 장착이 `tier_mismatch`로 거절될 수 있다. 켜기 전에 아래 세 가지를 확인한다.

1. **이름이 맞는지**: 컬렉션의 배지를 이름별로 묶어 등급이 몇 개씩 있는지 본다. 한 이름에 같은 등급이 둘 이상이거나, 이름마다 등급 수가 다르면 위 1절의 규칙대로 고친다.

```sql
select b.name, count(*) as 배지수, count(distinct b.rarity) as 등급수,
       array_agg(b.rarity order by b.rarity) as 등급
from badges b
where b.item_book_id = '<컬렉션 id>' and b.type = 'item' and b.deleted_at is null
group by b.name
order by b.name;
```

2. **꽂힌 등급 분포**: 그 컬렉션에 여러 등급을 꽂아 둔 유저가 있는지 본다. 결과가 한 줄이라도 있으면 켜기 전에 처리 방법을 정한다. 삭제된 배지(`deleted_at`이 있는 배지)에 꽂힌 슬롯도 세므로 `deleted_at` 조건을 걸지 않는다.

```sql
select s.user_id, count(distinct b.rarity) as 꽂힌등급수, array_agg(distinct b.rarity) as 등급
from user_item_book_slots s
join badges b on b.id = s.badge_id
where s.item_book_id = '<컬렉션 id>'
group by s.user_id
having count(distinct b.rarity) > 1;
```

3. **등급별 완성 기록 확인**: 이미 켠 컬렉션을 점검할 때는 `user_item_book_tier_completions`의 `item_book_id`로 거른 행을 본다. 이 행이 있으면 컬렉션을 삭제할 수 없고(삭제 가드) 4등급 방식을 끌 수도 없다.

어드민 컬렉션 수정 화면의 «4등급 방식» 패널(편집 폼 위)이 이 세 가지를 보여 주고 켜기·끄기를 한다(티켓 20261022_1139). 패널은 위 SQL 1번·2번과 같은 결과를 낸다. SQL은 패널과 값이 어긋날 때 대조하는 읽기 전용 조회로 남긴다.

- **켜기**: 2번(여러 등급을 장착한 유저)에 한 명이라도 있으면 서버가 거절한다. 화면에는 유저 수와 등급 조합만 보이고, 유저를 알아볼 수 있는 값은 없다. 어드민이 유저의 장착을 대신 풀어 주는 동작은 화면에 없다. 1번(이름 점검)은 경고로만 보이고 켜기를 막지 않는다.
- **끄기**: 3번(등급별 완성 기록)이 하나라도 있으면 서버가 거절한다. 없으면 끌 수 있다.
- **편집 폼**: 켜진 컬렉션은 «완성 보상 배지»·«포인트 보상» 칸을 접는다. 저장해 둔 값은 지우지 않는다.
