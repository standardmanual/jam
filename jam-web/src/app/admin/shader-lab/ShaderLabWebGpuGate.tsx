'use client'

/**
 * 쉐이더 랩 — WebGPU 미지원 브라우저 안내 (티켓 20260912_1951)
 *
 * `navigator.gpu` 존재 여부를 클라이언트에서 확인한다. 서버 컴포넌트에서는 판단할 수 없어
 * `useEffect`로 마운트 후 확인 — 짧은 깜빡임(우선 자식을 그리고 곧바로 대체)을 막기 위해
 * 판정 전에는 아무것도 그리지 않는다.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { isWebGpuSupported } from '@/lib/admin/shaderLab/webgpu'

export default function ShaderLabWebGpuGate({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    // 이펙트 본문에서 곧바로 setState를 동기 호출하면 react-hooks/set-state-in-effect에
    // 걸린다 — 마이크로태스크로 한 틱 미룬다.
    Promise.resolve().then(() => setSupported(isWebGpuSupported()))
  }, [])

  if (supported === null) return null

  if (!supported) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-muted/30 p-8 text-center">
        <IconAlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium text-foreground">이 브라우저는 쉐이더 랩을 지원하지 않아요</p>
        <p className="text-sm text-muted-foreground">
          쉐이더 랩은 WebGPU가 필요해요. Chrome 또는 Edge 최신 버전에서 이용해주세요.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
