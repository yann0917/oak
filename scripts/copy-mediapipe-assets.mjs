// 把 @mediapipe/tasks-vision 自带的 wasm 运行时复制到 public/wasm/
// 运行时机：npm install 之后（postinstall），CI 与本地开发都自动生效。
// wasm 体积大（34M），不入库，靠这个脚本从 npm 包同步。
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = path.join(root, "public", "wasm");

if (!existsSync(src)) {
  console.warn("[mediapipe] node_modules/@mediapipe/tasks-vision/wasm 不存在，跳过复制");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[mediapipe] wasm 运行时已复制到 ${dest}`);
