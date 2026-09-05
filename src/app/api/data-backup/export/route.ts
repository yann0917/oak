import { NextRequest, NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { exportExcel, exportJson } from "@/lib/data-backup/export";

/** 数据导出：GET /api/data-backup/export?format=excel|json&attachments=1 */
export async function GET(req: NextRequest) {
  const { user, denied } = await requirePerm("data-backup", "export-get", req);
  if (denied) return denied;
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "excel";
  const withAttachments = req.nextUrl.searchParams.get("attachments") === "1";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (format === "excel") {
    const buf = await exportExcel(user.id);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="oak_export_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { json, zip } = exportJson(user.id, { attachments: withAttachments });
  if (zip) {
    return new NextResponse(zip as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="oak_export_${stamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="oak_export_${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
