"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  // forceMount — Radix Presence의 keyframe 기반 언마운트 감지를 우회한다. data-state는
  // forceMount 여부와 무관하게 항상 실제 open/closed를 반영하므로, t-panel-backdrop이
  // 그 값을 그대로 읽어 트랜지션한다(transitions.css 프로젝트 확장 섹션).
  <DialogPrimitive.Overlay
    ref={ref}
    forceMount
    className={cn("fixed inset-0 z-50 bg-black/80 t-panel-backdrop", className)}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  // Portal 자체도 Radix Presence로 감싸여 있어(react-dialog 내부), forceMount를
  // Overlay/Content에만 주면 Portal 레벨에서 먼저 즉시 언마운트될 수 있다.
  // 루트에도 forceMount를 둬 하위 Presence가 실제 트랜지션 종료를 기다리게 한다.
  <DialogPortal forceMount>
    <DialogOverlay />
    {/* t-dialog-panel(transitions.css 프로젝트 확장) — 원본 t-panel-slide는 슬라이드
        패널 전용(Y축 이동)이라 중앙 모달에는 맞지 않아, scale+opacity 변형을 새로 뒀다.
        keyframe 대신 transition이라 애니메이션 도중 상태가 뒤집혀도(열림 중 닫힘 등)
        현재 값에서 이어진다. */}
    <DialogPrimitive.Content
      ref={ref}
      forceMount
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg gap-4 border border-neutral-200 bg-white text-neutral-900 p-6 shadow-lg sm:rounded-lg t-dialog-panel",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-neutral-900 opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-neutral-100 data-[state=open]:text-neutral-500">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
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
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-neutral-900",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-neutral-500", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
