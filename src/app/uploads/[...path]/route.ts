import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAuthUser } from "@/lib/auth";

const uploadDir = path.join(process.cwd(), "uploads");
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  const filePath = path.normalize(path.join(uploadDir, rel));
  if (!filePath.startsWith(uploadDir) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: { "Content-Type": MIME[ext] || "application/octet-stream" },
  });
}
