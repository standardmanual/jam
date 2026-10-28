'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { useToast } from '@/components/ui/Toast'
import { d } from '@/lib/i18n'
import { INVENTORY_FULL_CODE } from '@/lib/inventory/locked-item-block'

/**
 * 한 번의 «모두 해제하기» 요청 결과 — 서버 응답을 화면이 가를 세 가지로 줄인 값이다.
 * - `ok`: 모두 해제했다(장착이 이미 없었던 경우 포함)
 * - `full`: 인벤토리 빈칸이 모자라다. 한 개도 해제하지 못했거나 중간에 가득 차 일부만 해제했다. `message`가 둘을 가른 문장이다
 * - `error`: 그 밖의 실패(로그인·시간 초과·네트워크·서버 오류)
 */
export type UnslotAllOutcome = { kind: 'ok' } | { kind: 'full'; message: string } | { kind: 'error'; message: string }

/** 시트 푸터에 보이는 안내 한 블록. `inventoryLink`가 켜지면 «인벤토리 보기» 링크가 붙는다(빈칸이 모자란 경우만) */
export interface UnslotAllNotice {
  message: string
  inventoryLink: boolean
}

/**
 * `DELETE /api/itembooks/[id]/slots` 응답을 결과로 바꾼다. 문구는 서버가 완성해 `error`로 내려보내므로 그대로 쓰고,
 * 빈칸 부족은 409와 `code`로만 가른다(기존 해제와 같은 모양, `UNSLOT_ERROR_STATUS_MAP`).
 */
export function toUnslotAllOutcome(ok: boolean, status: number, body: unknown): UnslotAllOutcome {
  if (ok) return { kind: 'ok' }
  const data = (body && typeof body === 'object' ? body : {}) as { error?: unknown; code?: unknown }
  const message = typeof data.error === 'string' && data.error ? data.error : null
  if (status === 409 && data.code === INVENTORY_FULL_CODE) {
    return { kind: 'full', message: message ?? d.itembooks.unslotAll.shortNotice }
  }
  return { kind: 'error', message: message ?? d.itembooks.unslotAll.failed }
}

interface RunUnslotAllDeps {
  /** 진행 중인 요청이 있는지 — 렌더를 거치지 않고 바로 읽어야 해서 ref 모양이다(빠른 연속 탭 방지) */
  inFlight: { current: boolean }
  /** 던지지 않는다 — 실패는 `error` 결과로 돌려준다 */
  request: () => Promise<UnslotAllOutcome>
  setNotice: (notice: UnslotAllNotice | null) => void
  onSuccess: () => void
}

/**
 * 확정 버튼을 눌렀을 때의 흐름. 이미 진행 중이면 아무것도 하지 않는다(서버 호출은 한 번뿐).
 * 성공이면 `onSuccess`, 아니면 결과에 맞는 안내를 세운다. 다시 누르면 새 결과로 안내가 바뀐다 — 요청이 도는 동안은
 * 지난 안내를 지우지 않는다(시트 높이가 줄었다 늘면서 흔들린다).
 */
export async function runUnslotAll(deps: RunUnslotAllDeps): Promise<void> {
  if (deps.inFlight.current) return
  deps.inFlight.current = true
  try {
    const outcome = await deps.request()
    if (outcome.kind === 'ok') deps.onSuccess()
    else deps.setNotice({ message: outcome.message, inventoryLink: outcome.kind === 'full' })
  } finally {
    deps.inFlight.current = false
  }
}

interface UnslotAllSheetViewProps {
  open: boolean
  /** 서버 처리 중이면 취소가 막히고 확정이 loading이며 시트 닫기(바깥 탭·아래로 끌기·Escape)도 막힌다 */
  submitting: boolean
  /** 컬렉션 등급이 정해졌는지 — 켜지면 본문에 «등급도 풀려요» 줄이 붙는다 */
  tierFixed: boolean
  /** 완성한 컬렉션인지 — 켜지면 본문에 «완성 기록은 남아요» 줄이 붙는다 */
  completed: boolean
  notice: UnslotAllNotice | null
  onClose: () => void
  onConfirm: () => void
}

/** 버튼 한 쌍의 공통 클래스. `StravaDisconnectSheet`의 푸터와 같다 */
const FOOTER_BUTTON = 'px-3! whitespace-nowrap'

/**
 * «모두 해제하기» 확인 시트의 겉모습 (티켓 20261028_1420, 채원 사전 판정 2026-10-28).
 *
 * 재사용만 한다: BottomSheet(compact) + Button(secondary 취소, primary main 확정) + InlineNotice. 새 토큰·새 부품이 없다.
 * 확정을 danger로 칠하지 않는다 — 배지는 인벤토리로 돌아오고 완성 기록도 남아 잃는 것이 없다. 취소와 확정은 같은 폭·같은 높이다(가이드 5.2).
 * 본문은 1~3문장이라 가운데가 아니라 왼쪽 정렬이고 가장자리는 제목과 같은 px-6이다.
 *
 * 실패·빈칸 부족 안내는 푸터 맨 위에 InlineNotice 한 블록이다(`StravaDuplicateSheet` 선례). 안내가 보여도 확정은 계속 켜져 있다 —
 * 다른 탭에서 빈칸을 만들었을 수 있어 다시 누르면 재시도다. 링크는 빈칸이 모자란 안내에만 붙는다.
 * 제출 중에는 확정이 loading이고 라벨이 «해제하는 중»이며 취소와 시트 닫기가 막힌다. 닫힘 트랜지션은 BottomSheet가 DOM에 남겨 처리한다.
 */
export function UnslotAllSheetView({
  open,
  submitting,
  tierFixed,
  completed,
  notice,
  onClose,
  onConfirm,
}: UnslotAllSheetViewProps) {
  const copy = d.itembooks.unslotAll
  const lines = [copy.bodyReturn, ...(tierFixed ? [copy.bodyTier] : []), ...(completed ? [copy.bodyCompleted] : [])]

  return (
    <BottomSheet
      open={open}
      // 제출 중에는 어떤 경로로도 닫히지 않는다 — 서버 처리 중에 시트가 사라지면 결과를 알 수 없다
      onClose={submitting ? () => {} : onClose}
      detent="compact"
      title={copy.title}
      footer={
        <div className="flex flex-col gap-4">
          {notice && (
            <InlineNotice
              action={
                notice.inventoryLink ? (
                  <Link
                    href="/inventory"
                    className="inline-flex min-h-11 items-center self-start break-keep wrap-break-word whitespace-nowrap text-base text-[color:var(--link)]"
                  >
                    {copy.inventoryLink}
                  </Link>
                ) : undefined
              }
            >
              {notice.message}
            </InlineNotice>
          )}
          <div className="flex gap-4">
            <Button fullWidth variant="secondary" className={FOOTER_BUTTON} onClick={onClose} disabled={submitting}>
              {copy.cancel}
            </Button>
            <Button
              fullWidth
              variant="primary"
              surface="main"
              className={FOOTER_BUTTON}
              loading={submitting}
              onClick={onConfirm}
            >
              {submitting ? copy.confirming : copy.confirm}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-2 px-6 pb-6 text-left">
        {lines.map((line) => (
          <p key={line} className="text-base text-foreground break-keep wrap-break-word text-pretty">
            {line}
          </p>
        ))}
      </div>
    </BottomSheet>
  )
}

interface UnslotAllSheetProps {
  open: boolean
  /** 요청이 도는 중 — 요청 함수가 SlotGrid에 있어 그 상태를 받는다 */
  submitting: boolean
  tierFixed: boolean
  completed: boolean
  onClose: () => void
  /** 해제 요청. SlotGrid의 `requestUnslotAll`이다(해제 API 호출과 화면 새로고침은 거기서 한다) */
  request: () => Promise<UnslotAllOutcome>
  /** 모두 해제에 성공해 시트를 닫은 직후 — SlotGrid가 포커스를 격자로 옮긴다 */
  onUnslotted: () => void
}

/**
 * 컬렉션 상세의 «모두 해제하기» 확인 시트.
 *
 * 확정은 `requestUnslotAll`(SlotGrid, `DELETE /api/itembooks/[id]/slots`)이다. 성공이면 시트를 닫고 토스트를 띄운 뒤 `onUnslotted`를 부른다.
 * 실패·빈칸 부족이면 시트를 연 채 안내를 푸터에 세운다 — 실패는 화면 밖일 수 있는 배너가 아니라 사용자가 보고 있는 시트에서 알린다
 * (SlotGrid `sheetError`와 같은 원칙). 호출 흐름·중복 탭 막기는 `runUnslotAll`이 맡는다(단위 시험으로 고정).
 *
 * 안내는 시트를 «다시 열 때» 지우고 «닫을 때»는 지우지 않는다 — 닫힘 트랜지션 동안 내용이 툭 사라지기 때문이다. 본문의 등급·완성 줄도
 * 같은 이유로 여는 순간의 값을 닫히는 동안 쓴다(성공한 새로고침이 먼저 도착해 등급이 풀려 있어도 내려가는 시트의 문장은 그대로다).
 */
export default function UnslotAllSheet({
  open,
  submitting,
  tierFixed,
  completed,
  onClose,
  request,
  onUnslotted,
}: UnslotAllSheetProps) {
  const copy = d.itembooks.unslotAll
  const [notice, setNotice] = useState<UnslotAllNotice | null>(null)
  const [opened, setOpened] = useState({ wasOpen: open, tierFixed, completed })
  const inFlight = useRef(false)
  const { toast } = useToast()

  // 닫힘에서 열림으로 바뀌는 렌더에서 안내를 지우고 본문 값을 붙잡는다(effect 없이 렌더 중에 맞춘다)
  if (open !== opened.wasOpen) {
    setOpened({ wasOpen: open, tierFixed: open ? tierFixed : opened.tierFixed, completed: open ? completed : opened.completed })
    if (open) setNotice(null)
  }

  function handleConfirm() {
    void runUnslotAll({
      inFlight,
      request,
      setNotice,
      onSuccess: () => {
        onClose()
        toast(copy.successToast, 'success')
        onUnslotted()
      },
    })
  }

  return (
    <UnslotAllSheetView
      open={open}
      submitting={submitting}
      tierFixed={open ? tierFixed : opened.tierFixed}
      completed={open ? completed : opened.completed}
      notice={notice}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  )
}
