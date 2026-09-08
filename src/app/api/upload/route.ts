import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { requirePerm } from "@/lib/auth";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const EXT_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 与 src/lib/quick/download.ts 的外链归档上限一致
const MAX_FILES = 9;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 9 × 15MB + 表单开销

export async function POST(req: NextRequest) {
  const { denied } = await requirePerm("upload", "upload", req);
  if (denied) return denied;

  // formData() 会把整个请求体读进内存，必须先按声明长度拦截
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "上传内容过大" }, { status: 413 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "没有文件" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `一次最多上传 ${MAX_FILES} 个文件` }, { status: 400 });
  }

  const paths: string[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "单个文件不能超过 15MB" }, { status: 413 });
    }
    const ext = EXT_MAP[file.type] || path.extname(file.name) || "";
    const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(uploadDir, name), buf);
    paths.push(`/uploads/${name}`);
  }
  return NextResponse.json({ paths });
}
