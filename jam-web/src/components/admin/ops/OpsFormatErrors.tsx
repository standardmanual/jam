'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/admin/ui/tooltip'
import { parseFormatErrorPath, splitFormatError } from '@/lib/admin/opsInbox/labels'

/**
 * 형식 오류 표시(티켓 20260930_1817, 채원 화면 설계 「S3 기획 상세」).
 *
 * 제출 문자열이 「경로: 사유」 해요체 문장이라 첫 「: 」에서 잘라 경로는 쉬운 이름표로 바꿔 작게, 사유를 본문으로 그린다.
 * 형식 오류는 승인을 막지 않는다(PRD §5) — 안내 문장이 그 사실을 알려 준다. 문자열은 React 텍스트 노드로만 그린다.
 * 「형식 오류」라는 말은 처음 나올 때 「제출 형식에 맞지 않는 곳」이라고 툴팁으로 풀어 준다.
 */

const SUMMARY_VISIBLE = 5

export const FORMAT_ERROR_HELP = '제출 형식에 맞지 않는 곳'

/** 「형식 오류」 용어 자리. 마우스를 올리거나 키보드로 focus하면 뜻을 풀어 준다. */
export function FormatErrorTerm() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4">
          형식 오류
        </span>
      </TooltipTrigger>
      <TooltipContent>{FORMAT_ERROR_HELP}</TooltipContent>
    </Tooltip>
  )
}

interface OpsFormatErrorSummaryProps {
  /** 묶음의 형식 오류 전체(묶음 + 항목). */
  errors: readonly string[]
  /** 「n번째 항목」을 누르면 그 항목을 선택한다(0부터 센 `position`). 없으면 글자로만 보인다. */
  onSelectItem?: (position: number) => void
}

/** 묶음 요약(알림 슬롯의 첫 줄). 오류가 없으면 아무것도 그리지 않는다. */
export function OpsFormatErrorSummary({ errors, onSelectItem }: OpsFormatErrorSummaryProps) {
  const [expanded, setExpanded] = useState(false)
  if (errors.length === 0) return null

  const visible = expanded ? errors : errors.slice(0, SUMMARY_VISIBLE)
  const hidden = errors.length - visible.length

  return (
    <Alert variant="warning">
      <IconAlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>
        <FormatErrorTerm /> {errors.length}건이 있어요
      </AlertTitle>
      <AlertDescription>
        <p>형식 오류가 있어도 승인할 수 있어요. 공개 준비에서 걸릴 수 있으니 고칠 수 있는 것은 먼저 고쳐 주세요.</p>
        <ul className="mt-2 space-y-1">
          {visible.map((message, index) => {
            const { path, reason } = splitFormatError(message)
            const { itemPosition, label } = parseFormatErrorPath(path)
            return (
              <li key={`${index}-${message}`} className="break-words text-sm">
                {itemPosition !== null &&
                  (onSelectItem ? (
                    <button
                      type="button"
                      onClick={() => onSelectItem(itemPosition)}
                      className="mr-1.5 rounded text-xs font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                    >
                      {itemPosition + 1}번째 항목
                    </button>
                  ) : (
                    <span className="mr-1.5 text-xs font-medium">{itemPosition + 1}번째 항목</span>
                  ))}
                {label && <span className="mr-1.5 text-xs opacity-80">{label}</span>}
                {reason}
              </li>
            )
          })}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 rounded text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            나머지 {hidden}건 더 보기
          </button>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** 항목 상세용 목록. 오류가 없으면 아무것도 그리지 않는다. */
export function OpsItemFormatErrors({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return null
  return (
    <Alert variant="warning">
      <IconAlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>
        <FormatErrorTerm /> {errors.length}건
      </AlertTitle>
      <AlertDescription>
        <ul className="space-y-1.5">
          {errors.map((message, index) => {
            const { path, reason } = splitFormatError(message)
            const label = parseFormatErrorPath(path).label
            return (
              <li key={`${index}-${message}`} className="break-words text-sm">
                {label && <span className="mb-0.5 block text-xs opacity-80">{label}</span>}
                {reason}
              </li>
            )
          })}
        </ul>
        <p className="mt-2 text-sm">
          형식 오류가 있어도 승인할 수 있어요. 공개 준비에서 걸릴 수 있으니 고칠 수 있는 것은 먼저 고쳐 주세요.
        </p>
      </AlertDescription>
    </Alert>
  )
}
