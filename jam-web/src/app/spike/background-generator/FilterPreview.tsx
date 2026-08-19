'use client'

import { useState } from 'react'
import {
  FlutedGlass,
  ImageDithering,
  HalftoneDots,
  HalftoneCmyk,
  LensDistortion,
} from '@paper-design/shaders-react'
import type { FilterId } from './types'

interface FilterPreviewProps {
  filterId: FilterId
  /** 필터에 흘려보낼 이미지(URL 또는 data URL). null이면 아직 준비되지 않은 상태 */
  source: string | null
  size: number
  label?: string
}

const controlLabelClass = 'flex items-center justify-between gap-2 text-xs text-[#6b7280]'
const rangeClass = 'flex-1 accent-[#111111]'
const selectClass = 'bg-white border border-[#e5e7eb] rounded-lg px-2 py-1 text-xs text-[#111111]'

export default function FilterPreview({ filterId, source, size, label }: FilterPreviewProps) {
  // 필터별 파라미터 상태 — Paper Shaders 실제 prop명을 그대로 노출해 검증한다 (20260819_001 스파이크)
  const [flutedGlass, setFlutedGlass] = useState({
    size: 0.5,
    distortion: 0.5,
    blur: 0.1,
    angle: 0,
    shape: 'lines' as const,
    distortionShape: 'lens' as const,
  })
  const [imageDithering, setImageDithering] = useState({
    size: 4,
    colorSteps: 3,
    type: '4x4' as const,
    originalColors: true,
  })
  const [halftoneDots, setHalftoneDots] = useState({
    size: 0.3,
    radius: 1,
    grid: 'square' as const,
    type: 'classic' as const,
    contrast: 0.5,
    speed: 1,
  })
  const [halftoneCmyk, setHalftoneCmyk] = useState({
    size: 0.3,
    contrast: 1,
    softness: 0.2,
    type: 'dots' as const,
  })
  const [lensDistortion, setLensDistortion] = useState({
    spread: 0.3,
    dispersion: 0.3,
    lensBulge: 0.3,
    swirl: 0,
    count: 12,
  })

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-xs font-medium text-[#374151]">{label}</p>}

      <div
        className="rounded-xl border border-[#e5e7eb] bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] overflow-hidden flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {!source ? (
          <span className="text-xs text-[#9ca3af]">이미지 없음</span>
        ) : filterId === 'none' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={source} alt="필터 없음 미리보기" className="w-full h-full object-cover" />
        ) : filterId === 'fluted-glass' ? (
          <FlutedGlass image={source} width={size} height={size} {...flutedGlass} />
        ) : filterId === 'image-dithering' ? (
          <ImageDithering image={source} width={size} height={size} {...imageDithering} />
        ) : filterId === 'halftone-dots' ? (
          <HalftoneDots image={source} width={size} height={size} {...halftoneDots} />
        ) : filterId === 'halftone-cmyk' ? (
          <HalftoneCmyk image={source} width={size} height={size} {...halftoneCmyk} />
        ) : (
          <LensDistortion image={source} width={size} height={size} {...lensDistortion} />
        )}
      </div>

      {/* 필터별 파라미터 — prop명을 그대로 라벨로 노출 */}
      {filterId === 'fluted-glass' && (
        <div className="flex flex-col gap-1.5">
          <label className={controlLabelClass}>
            size ({flutedGlass.size.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={flutedGlass.size} className={rangeClass}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, size: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            distortion ({flutedGlass.distortion.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={flutedGlass.distortion} className={rangeClass}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, distortion: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            blur ({flutedGlass.blur.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={flutedGlass.blur} className={rangeClass}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, blur: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            angle ({flutedGlass.angle}°)
            <input type="range" min={0} max={180} step={1} value={flutedGlass.angle} className={rangeClass}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, angle: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            shape
            <select className={selectClass} value={flutedGlass.shape}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, shape: e.target.value as typeof p.shape }))}>
              {['lines', 'linesIrregular', 'wave', 'zigzag', 'pattern'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={controlLabelClass}>
            distortionShape
            <select className={selectClass} value={flutedGlass.distortionShape}
              onChange={(e) => setFlutedGlass((p) => ({ ...p, distortionShape: e.target.value as typeof p.distortionShape }))}>
              {['prism', 'lens', 'contour', 'cascade', 'flat'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {filterId === 'image-dithering' && (
        <div className="flex flex-col gap-1.5">
          <label className={controlLabelClass}>
            size ({imageDithering.size})
            <input type="range" min={0.5} max={20} step={0.5} value={imageDithering.size} className={rangeClass}
              onChange={(e) => setImageDithering((p) => ({ ...p, size: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            colorSteps ({imageDithering.colorSteps})
            <input type="range" min={1} max={7} step={1} value={imageDithering.colorSteps} className={rangeClass}
              onChange={(e) => setImageDithering((p) => ({ ...p, colorSteps: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            type
            <select className={selectClass} value={imageDithering.type}
              onChange={(e) => setImageDithering((p) => ({ ...p, type: e.target.value as typeof p.type }))}>
              {['random', '2x2', '4x4', '8x8'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={controlLabelClass}>
            originalColors
            <input type="checkbox" checked={imageDithering.originalColors}
              onChange={(e) => setImageDithering((p) => ({ ...p, originalColors: e.target.checked }))} />
          </label>
        </div>
      )}

      {filterId === 'halftone-dots' && (
        <div className="flex flex-col gap-1.5">
          <label className={controlLabelClass}>
            size ({halftoneDots.size.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={halftoneDots.size} className={rangeClass}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, size: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            radius ({halftoneDots.radius.toFixed(2)})
            <input type="range" min={0} max={2} step={0.01} value={halftoneDots.radius} className={rangeClass}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, radius: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            contrast ({halftoneDots.contrast.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={halftoneDots.contrast} className={rangeClass}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, contrast: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            grid
            <select className={selectClass} value={halftoneDots.grid}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, grid: e.target.value as typeof p.grid }))}>
              {['square', 'hex'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={controlLabelClass}>
            type
            <select className={selectClass} value={halftoneDots.type}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, type: e.target.value as typeof p.type }))}>
              {['classic', 'gooey', 'holes', 'soft'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className={controlLabelClass}>
            speed ({halftoneDots.speed.toFixed(1)}) — 유일하게 u_time을 실제로 사용하는 필터
            <input type="range" min={0} max={5} step={0.1} value={halftoneDots.speed} className={rangeClass}
              onChange={(e) => setHalftoneDots((p) => ({ ...p, speed: +e.target.value }))} />
          </label>
        </div>
      )}

      {filterId === 'halftone-cmyk' && (
        <div className="flex flex-col gap-1.5">
          <label className={controlLabelClass}>
            size ({halftoneCmyk.size.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={halftoneCmyk.size} className={rangeClass}
              onChange={(e) => setHalftoneCmyk((p) => ({ ...p, size: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            contrast ({halftoneCmyk.contrast.toFixed(2)})
            <input type="range" min={0} max={2} step={0.01} value={halftoneCmyk.contrast} className={rangeClass}
              onChange={(e) => setHalftoneCmyk((p) => ({ ...p, contrast: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            softness ({halftoneCmyk.softness.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={halftoneCmyk.softness} className={rangeClass}
              onChange={(e) => setHalftoneCmyk((p) => ({ ...p, softness: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            type
            <select className={selectClass} value={halftoneCmyk.type}
              onChange={(e) => setHalftoneCmyk((p) => ({ ...p, type: e.target.value as typeof p.type }))}>
              {['dots', 'ink', 'sharp'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {filterId === 'lens-distortion' && (
        <div className="flex flex-col gap-1.5">
          <label className={controlLabelClass}>
            spread ({lensDistortion.spread.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={lensDistortion.spread} className={rangeClass}
              onChange={(e) => setLensDistortion((p) => ({ ...p, spread: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            dispersion ({lensDistortion.dispersion.toFixed(2)})
            <input type="range" min={0} max={1} step={0.01} value={lensDistortion.dispersion} className={rangeClass}
              onChange={(e) => setLensDistortion((p) => ({ ...p, dispersion: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            lensBulge ({lensDistortion.lensBulge.toFixed(2)})
            <input type="range" min={-1} max={1} step={0.01} value={lensDistortion.lensBulge} className={rangeClass}
              onChange={(e) => setLensDistortion((p) => ({ ...p, lensBulge: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            swirl ({lensDistortion.swirl.toFixed(2)})
            <input type="range" min={-1} max={1} step={0.01} value={lensDistortion.swirl} className={rangeClass}
              onChange={(e) => setLensDistortion((p) => ({ ...p, swirl: +e.target.value }))} />
          </label>
          <label className={controlLabelClass}>
            count ({lensDistortion.count})
            <input type="range" min={2} max={50} step={1} value={lensDistortion.count} className={rangeClass}
              onChange={(e) => setLensDistortion((p) => ({ ...p, count: +e.target.value }))} />
          </label>
        </div>
      )}
    </div>
  )
}
