import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    // mediapipe 生成在 public/wasm 的 Emscripten 胶水代码不是项目源码
    ignores: ["public/wasm/**"],
  },
  ...coreWebVitals,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "warn",
      // Next 16 / React Compiler 新增规则，对存量代码先降级提示，后续按提示逐步优化
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      // 动画循环/事件处理器中调用 Date.now/performance.now/Math.random 是规范用法，
      // purity/immutability 对这类异步回调存在误报，先降级为提示
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
