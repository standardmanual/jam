import { DotmHex8 } from '@/components/ui/dotm-hex-8'

export default function Loading() {
  return (
    <div className="jam-loader-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-jam-cream/90 backdrop-blur-sm">
      <DotmHex8
        size={89}
        dotSize={14}
        speed={1.35}
        pattern="full"
        colorPreset="grad-fire"
        animated
        opacityBase={0.12}
        opacityMid={0.42}
        opacityPeak={1}
      />
    </div>
  )
}
