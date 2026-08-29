"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * 多图灯箱预览。库的 Image 只有单张预览，没有多图切换，
 * 这里补充左右按钮、键盘导航和计数器，供 PhotoGrid 等多图场景使用。
 */
export function PhotoLightbox({
  photos,
  index,
  onNavigate,
  onClose,
}: {
  photos: string[];
  /** 当前查看的图片下标，null 表示关闭 */
  index: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // 打开期间锁定页面滚动，并把焦点移进灯箱，关闭时归还焦点
  useEffect(() => {
    if (index == null) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus();
    };
  }, [index == null]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (e.key === "ArrowRight" && index < photos.length - 1) onNavigate(index + 1);
      else if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, onClose, onNavigate, photos.length]);

  // 预加载相邻两张，切换时立即可见
  useEffect(() => {
    if (index == null) return;
    for (const i of [index - 1, index + 1]) {
      if (photos[i]) new window.Image().src = photos[i];
    }
  }, [index, photos]);

  if (index == null || photos.length === 0) return null;

  return createPortal(
    <div
      className="photo-fade-in fixed inset-0 z-[1200] flex items-center justify-center"
      // 与库 Image 单图预览的遮罩保持一致（看图需要比 Modal 更深的遮罩）
      style={{ background: "rgba(0, 0, 0, 0.55)" }}
      onClick={onClose}
    >
      {photos.length > 1 && (
        <>
          <NavButton
            side="left"
            disabled={index === 0}
            onClick={() => onNavigate(index - 1)}
          />
          <NavButton
            side="right"
            disabled={index === photos.length - 1}
            onClick={() => onNavigate(index + 1)}
          />
        </>
      )}

      <button
        ref={closeRef}
        type="button"
        aria-label="关闭预览"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: "#fff",
          color: "var(--animal-text-color-secondary)",
          boxShadow: "var(--animal-shadow-base)",
          outlineColor: "var(--animal-focus-yellow)",
        }}
      >
        {/* 关闭叉与库 Image 的画法一致：两根 45° 交叉的圆角短棒 */}
        <span aria-hidden className="relative block h-4 w-4">
          <span
            className="absolute left-1/2 top-1/2 block h-0.5 w-4 rounded-full"
            style={{ background: "currentColor", transform: "translate(-50%, -50%) rotate(45deg)" }}
          />
          <span
            className="absolute left-1/2 top-1/2 block h-0.5 w-4 rounded-full"
            style={{ background: "currentColor", transform: "translate(-50%, -50%) rotate(-45deg)" }}
          />
        </span>
      </button>

      <div className="flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img
          key={photos[index]}
          src={photos[index]}
          alt={`照片 ${index + 1}`}
          className="photo-zoom-in max-h-[80vh] max-w-[min(88vw,1100px)] rounded-[20px] object-contain"
          style={{ boxShadow: "var(--animal-shadow-lg)" }}
        />
        {photos.length > 1 && (
          <div
            className="photo-zoom-in mt-4 rounded-full px-4 py-1 text-sm font-bold"
            style={{
              background: "#fff",
              color: "var(--animal-text-color-secondary)",
              boxShadow: "var(--animal-shadow-sm)",
            }}
          >
            {index + 1} / {photos.length}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "上一张" : "下一张"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        ...(side === "left" ? { left: 12 } : { right: 12 }),
        background: "#fff",
        color: "var(--animal-text-color-secondary)",
        boxShadow: "var(--animal-shadow-base)",
        outlineColor: "var(--animal-focus-yellow)",
      }}
    >
      {/* 图标库没有箭头，用 CSS 画（边框角旋转 45°），与库关闭按钮同一画法 */}
      <span
        aria-hidden
        className="block h-3.5 w-3.5"
        style={
          side === "left"
            ? {
                borderLeft: "2.5px solid currentColor",
                borderBottom: "2.5px solid currentColor",
                transform: "rotate(45deg)",
              }
            : {
                borderRight: "2.5px solid currentColor",
                borderTop: "2.5px solid currentColor",
                transform: "rotate(45deg)",
              }
        }
      />
    </button>
  );
}
