// 通用语音合成接口：GET /api/tts?text=…&voice=xiaoyi|yunxia|xiaoxiao|ana
//                       &rate=-10%&pitch=+25Hz&volume=+8%
// 音色按入口选择（见 src/lib/tts/voices.ts 的分配表），语气由 rate/pitch/volume 调节：
// 夸奖可以音调上扬更有激情，答错可以放慢下沉更有惋惜感。不存在的音频现场用 Edge TTS
// 生成并落盘缓存（data/tts/），之后命中缓存直接回文件；同时带一年的浏览器缓存头，
// 前端 Audio 元素第二次起也不再发请求。
import { NextRequest, NextResponse } from "next/server";
import { requirePerm } from "@/lib/auth";
import { edgeTtsSynthesize } from "@/lib/tts/edgeTts";
import { TTS_VOICES, type TtsVoice } from "@/lib/tts/voices";
import {
  readTtsCache,
  saveTtsCache,
  ttsCacheKey,
  ttsCacheKeyLegacy,
} from "@/lib/tts/cache";

const MAX_TEXT_LEN = 200;
const RATE_RE = /^[+-]\d{1,3}%$/;
const PITCH_RE = /^[+-]\d{1,3}Hz$/;
const VOLUME_RE = /^[+-]\d{1,3}%$/;

export async function GET(req: NextRequest) {
  const { denied: denied } = await requirePerm("tts", "synthesize", req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") || "").trim();
  const voiceKey = searchParams.get("voice") || "xiaoyi";
  const rate = searchParams.get("rate") || "-10%"; // 默认稍慢，方便孩子跟读
  const pitch = searchParams.get("pitch") || "+0Hz";
  const volume = searchParams.get("volume") || "+0%";

  if (!text) {
    return NextResponse.json({ error: "缺少 text 参数" }, { status: 400 });
  }
  if ([...text].length > MAX_TEXT_LEN) {
    return NextResponse.json({ error: "文本过长" }, { status: 400 });
  }
  if (!RATE_RE.test(rate) || !PITCH_RE.test(pitch) || !VOLUME_RE.test(volume)) {
    return NextResponse.json({ error: "语速/音调/音量格式无效" }, { status: 400 });
  }
  if (!(voiceKey in TTS_VOICES)) {
    return NextResponse.json({ error: "voice 无效" }, { status: 400 });
  }

  const voice = TTS_VOICES[voiceKey as TtsVoice];
  const key = ttsCacheKey(text, voice, rate, pitch, volume);

  // 老版本缓存 key 不含语气参数：仅默认语气时兜底命中
  let cached =
    readTtsCache(key) ??
    (pitch === "+0Hz" && volume === "+0%" ? readTtsCache(ttsCacheKeyLegacy(text, voice, rate)) : null);
  if (cached) return audioResponse(cached);

  try {
    const buf = await edgeTtsSynthesize(text, { voice, rate, pitch, volume });
    saveTtsCache(key, buf);
    return audioResponse(buf);
  } catch (e) {
    console.error("tts 合成失败:", e);
    return NextResponse.json({ error: "语音生成失败，请稍后再试" }, { status: 502 });
  }
}

function audioResponse(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      // 内容只与文本+音色+语速相关，永不变化，可长期缓存
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
