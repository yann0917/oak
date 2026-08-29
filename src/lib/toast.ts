"use client";

// 轻量 toast，API 与 animal-island-ui 的 Notification 保持一致（success/error/warning/info）。
// 不直接用库的 Notification：它内部通过自带 CJS shim 调 createRoot，在
// Turbopack（Next 16 默认打包器）下互操作失败抛 TypeError，会中断调用方的后续逻辑。
// toast 本质是过场提示，纯 DOM 实现不依赖 React 版本与打包器。
type ToastType = "success" | "error" | "warning" | "info";

const TYPE_COLOR: Record<ToastType, string> = {
  success: "var(--animal-success-color)",
  error: "var(--animal-error-color)",
  warning: "var(--animal-warning-color)",
  info: "var(--animal-primary-color)",
};

export function toast(message: string, type: ToastType = "info") {
  if (typeof document === "undefined") return;
  let root = document.querySelector<HTMLElement>("[data-app-toast-root]");
  if (!root) {
    root = document.createElement("div");
    root.setAttribute("data-app-toast-root", "");
    Object.assign(root.style, {
      position: "fixed",
      top: "18px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
      pointerEvents: "none",
    });
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  Object.assign(el.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#fff",
    color: "var(--animal-text-color)",
    border: `2px solid ${TYPE_COLOR[type]}`,
    borderRadius: "50px",
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "var(--animal-font-family, sans-serif)",
    boxShadow: "0 8px 24px rgba(61, 52, 40, 0.14)",
    opacity: "0",
    transform: "translateY(-8px)",
    transition: "opacity .2s var(--animal-motion-ease, ease), transform .2s var(--animal-motion-ease, ease)",
    pointerEvents: "auto",
    whiteSpace: "nowrap",
  });
  const dot = document.createElement("span");
  Object.assign(dot.style, {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: TYPE_COLOR[type],
    flexShrink: "0",
  } as CSSStyleDeclaration);
  el.appendChild(dot);
  el.appendChild(document.createTextNode(message));
  root.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-8px)";
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

export const Notification = {
  success: (message: string) => toast(message, "success"),
  error: (message: string) => toast(message, "error"),
  warning: (message: string) => toast(message, "warning"),
  info: (message: string) => toast(message, "info"),
};
