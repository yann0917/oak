// 语音磁盘缓存：key = sha1(voice|rate|text)，文件落 data/tts/（与数据库同级的运行时数据目录，
// 部署时随 data/ 一起保留）。命中即直接回文件，未命中才请求 Edge 生成，实现"下次直接播放"。
import crypto from "crypto";
import fs from "fs";
import path from "path";

const TTS_DIR = path.join(process.cwd(), "data", "tts");

export function ttsCacheKey(
  text: string,
  voice: string,
  rate: string,
  pitch = "+0Hz",
  volume = "+0%"
): string {
  return crypto
    .createHash("sha1")
    .update(`${voice}|${rate}|${pitch}|${volume}|${text}`)
    .digest("hex");
}

/** 旧版 key（不含语气参数）：仅默认语气时兜底命中，避免历史缓存全部重新生成 */
export function ttsCacheKeyLegacy(text: string, voice: string, rate: string): string {
  return crypto.createHash("sha1").update(`${voice}|${rate}|${text}`).digest("hex");
}

export function ttsCachePath(key: string): string {
  return path.join(TTS_DIR, `tts-${key}.mp3`);
}

/** 命中缓存返回音频内容，未命中返回 null */
export function readTtsCache(key: string): Buffer | null {
  try {
    return fs.readFileSync(ttsCachePath(key));
  } catch {
    return null;
  }
}

export function saveTtsCache(key: string, buf: Buffer): void {
  fs.mkdirSync(TTS_DIR, { recursive: true });
  // 先写临时文件再原子改名，避免并发请求读到写了一半的音频
  const tmp = `${ttsCachePath(key)}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, ttsCachePath(key));
}
