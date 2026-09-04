import fs from "fs";
import path from "path";
import crypto from "crypto";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/** 按文件头识别真实类型（OSS 等常见返回 application/octet-stream，不能只信 Content-Type） */
function detectImageExt(buf: Buffer): string | null {
  if (buf.length > 11 && buf.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return ".png";
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.length > 5 && buf.subarray(0, 6).toString("latin1").match(/^GIF8[79]a$/)) return ".gif";
  if (
    buf.length > 11 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return ".webp";
  return null;
}

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * 下载远程图片并保存到本地 uploads（与 /api/upload 同目录），返回 /uploads/xxx。
 * 用于快记粘贴图片链接：本地留存不依赖外链长期可用，AI 识图只读本地文件。
 */
export async function downloadRemotePhoto(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("下载内容为空");
  if (buf.length > MAX_BYTES) throw new Error("图片超过 15MB 限制");
  const ext = detectImageExt(buf) ?? MIME_EXT[(res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("仅支持 jpg / png / gif / webp 图片链接");
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  return `/uploads/${name}`;
}
