import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getAuthUser } from "@/lib/auth";

/**
 * 同步库媒体：GET /media/exercises/videos/0001-xxx.gif、/media/recipes/images/大排面.png
 * 文件由各同步器落盘到 data/<库名>/（可重新拉取的库内容，不放 uploads/，与 /uploads/[...path] 一样
 * 需要登录态）。文件名含上游 ID 或原名，内容不会变，可长期缓存。
 *
 * 只放行白名单里的一级目录：data/ 下还有 oak.db、backups/、tts/，不能整目录暴露。
 */
const DATA_ROOT = path.join(process.cwd(), "data");
const ALLOWED = new Set(["exercises", "recipes"]);
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { path: parts } = await ctx.params;
  if (!parts?.length || !ALLOWED.has(parts[0])) {
    return NextResponse.json({ error: "路径非法" }, { status: 400 });
  }
  const root = path.join(DATA_ROOT, parts[0]);
  const filePath = path.normalize(path.join(root, ...parts.slice(1)));
  if (!filePath.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "路径非法" }, { status: 400 });
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    // 还没同步（或正在重新拉取）时按缺失返回，前端回落到占位图
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
