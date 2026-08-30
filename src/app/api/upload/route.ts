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

export async function POST(req: NextRequest) {
  const { denied } = await requirePerm("upload", "upload", req);
  if (denied) return denied;

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "没有文件" }, { status: 400 });

  const paths: string[] = [];
  for (const file of files) {
    const ext = EXT_MAP[file.type] || path.extname(file.name) || "";
    const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(uploadDir, name), buf);
    paths.push(`/uploads/${name}`);
  }
  return NextResponse.json({ paths });
}
