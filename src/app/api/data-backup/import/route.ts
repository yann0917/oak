import { NextRequest, NextResponse } from "next/server";
import AdmZip from "adm-zip";
import { requirePerm } from "@/lib/auth";
import { importData, type ImportMode } from "@/lib/data-backup/import";

/** 数据导入：POST /api/data-backup/import（multipart：mode 合并/替换、file 为 JSON 备份、zip 可选附件包） */
export async function POST(req: NextRequest) {
  const { user, denied } = await requirePerm("data-backup", "import-post", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请选择 JSON 备份文件" }, { status: 400 });
  }
  const mode = form.get("mode") === "replace" ? "replace" : "merge";
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择 JSON 备份文件" }, { status: 400 });
  }

  // 支持两种上传：纯 JSON（可能附 zip 字段的附件包）或「含附件 zip 包」（PK 魔数，内含 oak_backup.json）
  const fileBuf = Buffer.from(await file.arrayBuffer());
  const isZip = fileBuf.length > 4 && fileBuf[0] === 0x50 && fileBuf[1] === 0x4b;
  let data: unknown;
  let zipBuf: Buffer | undefined;
  if (isZip) {
    const zip = new AdmZip(fileBuf);
    const entry = zip.getEntry("oak_backup.json");
    if (!entry) return NextResponse.json({ error: "附件包里没有 oak_backup.json（请使用本系统导出的 zip 备份）" }, { status: 400 });
    try {
      data = JSON.parse(entry.getData().toString("utf8"));
    } catch {
      return NextResponse.json({ error: "附件包内的数据文件不是合法 JSON" }, { status: 400 });
    }
    zipBuf = fileBuf;
  } else {
    try {
      data = JSON.parse(fileBuf.toString("utf8"));
    } catch {
      return NextResponse.json({ error: "文件不是合法 JSON（请使用本系统导出的备份文件）" }, { status: 400 });
    }
    const zipFile = form.get("zip");
    if (zipFile instanceof File && zipFile.size > 0) {
      if (zipFile.size > 50 * 1024 * 1024) {
        return NextResponse.json({ error: "附件包超过 50MB，请分次导入" }, { status: 400 });
      }
      zipBuf = Buffer.from(await zipFile.arrayBuffer());
    }
  }

  try {
    const summary = importData(user.id, data, mode as ImportMode, { zip: zipBuf });
    return NextResponse.json({
      ok: true,
      ...summary,
      note: "导入完成；RAG 记忆索引已重置，请到「设置 → AI 大模型 → 记忆检索」重建索引",
      warning:
        mode === "replace"
          ? `替换前已自动备份到 ${summary.backupFile ?? "data/backups/"}；原业务数据已清空。`
          : "合并导入已追加新记录（id 重新生成）。",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "导入失败" }, { status: 400 });
  }
}
