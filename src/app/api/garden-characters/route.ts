import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { pinyin } from "pinyin-pro";
import { db } from "@/db";
import { gardenCharacters } from "@/db/schema";
import { requireAuth } from "@/lib/auth";

// GET 自定义字库：?childId= 必填，?tier= 可选
export async function GET(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(req.url);
  const childId = Number(searchParams.get("childId"));
  if (!childId) {
    return NextResponse.json({ error: "缺少 childId 参数" }, { status: 400 });
  }
  const conditions = [eq(gardenCharacters.childId, childId)];
  const tier = Number(searchParams.get("tier"));
  if (tier === 1 || tier === 2 || tier === 3) {
    conditions.push(eq(gardenCharacters.tier, tier));
  }
  const rows = db
    .select()
    .from(gardenCharacters)
    .where(and(...conditions))
    .all();
  return NextResponse.json(rows);
}

// POST 批量加字：服务端 pinyin-pro 自动注音；重复字跳过并返回 skipped
export async function POST(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) return unauthorized;
  const body = await req.json();
  const childId = Number(body.childId);
  const tier = Number(body.tier);
  const charsText = String(body.chars || "");
  const manualPinyin = typeof body.pinyin === "string" ? body.pinyin.trim() : "";
  const word = typeof body.word === "string" ? body.word.trim() : "";

  if (!childId || ![1, 2, 3].includes(tier)) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }

  // 只保留汉字，去重，单次最多 50 个
  const chars = Array.from(new Set(charsText.match(/[\u4e00-\u9fff]/g) || [])).slice(0, 50);
  if (chars.length === 0) {
    return NextResponse.json({ error: "没有识别到汉字，请粘贴要添加的字" }, { status: 400 });
  }

  const existingRows = db
    .select()
    .from(gardenCharacters)
    .where(eq(gardenCharacters.childId, childId))
    .all();
  const existingChars = new Set(existingRows.map((r) => r.char));

  const now = new Date().toISOString();
  const added: any[] = [];
  const skipped: string[] = [];
  for (const char of chars) {
    if (existingChars.has(char)) {
      skipped.push(char);
      continue;
    }
    // 手动注音仅支持单字添加；多字交给 pinyin-pro 自动标注
    const py = chars.length === 1 && manualPinyin ? manualPinyin : pinyin(char, { toneType: "symbol" });
    const row = db
      .insert(gardenCharacters)
      .values({ childId, char, pinyin: py, word, tier, createdAt: now })
      .returning()
      .get();
    added.push(row);
    existingChars.add(char);
  }

  return NextResponse.json({ added, skipped }, { status: 201 });
}
