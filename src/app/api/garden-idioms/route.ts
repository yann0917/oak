// 成语卡片数据接口：内置词库 + 服务端 pinyin-pro 自动注音兜底（数据文件已带拼音，
// 此处仅对个别多音字校正或缺失场景生效）。
import { NextRequest, NextResponse } from "next/server";
import { pinyin } from "pinyin-pro";
import { requirePerm } from "@/lib/auth";
import { BUILTIN_IDIOMS } from "@/data/garden/idioms";

export async function GET(req: NextRequest) {
  const { denied } = await requirePerm("garden-idioms", "list", req);
  if (denied) return denied;

  const list = BUILTIN_IDIOMS.map((i) => ({
    word: i.word,
    pinyin: i.pinyin || pinyin(i.word, { toneType: "symbol" }),
    meaning: i.meaning,
    example: i.example,
  }));
  return NextResponse.json(list);
}
