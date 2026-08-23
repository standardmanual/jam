"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  // forceMount — BottomSheet가 쓰는 t-panel-backdrop과 동일 패턴으로 통일. Radix Presence는
  // keyframe(animationName)만 감지하므로 순수 transition 기반인 t-panel-backdrop에서는
  // forceMount 없이 present=false가 되는 즉시 DOM이 사라져 트랜지션이 재생되지 않는다.
  <SheetPrimitive.Overlay
    forceMount
    className={cn("fixed inset-0 z-50 bg-black/80 t-panel-backdrop", className)}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-white text-neutral-900 p-6 shadow-lg t-panel-slide",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b",
        bottom: "inset-x-0 bottom-0 border-t",
        left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm jam-panel-slide-x",
        right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm jam-panel-slide-x",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

/** 방향별 `--panel-translate-x`/`--panel-translate-y` — t-panel-slide(원본, Y축)와
 *  jam-panel-slide-x(프로젝트 확장, X축)에서 읽는 값. */
const sheetTranslate: Record<NonNullable<VariantProps<typeof sheetVariants>['side']>, React.CSSProperties> = {
  top: { '--panel-translate-y': '-100%' } as React.CSSProperties,
  bottom: { '--panel-translate-y': '100%' } as React.CSSProperties,
  left: { '--panel-translate-x': '-100%' } as React.CSSProperties,
  right: { '--panel-translate-x': '100%' } as React.CSSProperties,
}

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, style, children, ...props }, ref) => (
  <SheetPortal forceMount>
    <SheetOverlay />
    {/* t-panel-slide/jam-panel-slide-x(transitions.css) — BottomSheet와 동일한 패널
        모션 패턴. keyframe이 아니라 transition이므로 열림 도중 닫힘 등 상태 반전 시
        현재 값에서 자연스럽게 이어진다. */}
    <SheetPrimitive.Content
      ref={ref}
      forceMount
      className={cn(sheetVariants({ side }), className)}
      style={{ ...sheetTranslate[side ?? 'right'], ...style }}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm text-neutral-900 opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-neutral-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-neutral-900", className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-neutral-500", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
