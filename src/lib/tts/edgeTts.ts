// Edge TTS 合成引擎（Node 端专用）
// 参考 easyVoice 的 edgeTts 引擎思路：直连 Microsoft Edge "Read Aloud" WebSocket 接口，
// 无需任何 API Key。Sec-MS-GEC 鉴权算法与 rany2/edge-tts 对齐：
// Windows 文件时间向下取整到 5 分钟窗口后拼接 TrustedClientToken 做 SHA256（大写）。
// 注意：版本串 / UA / Sec-MS-GEC-Version 三者需保持一致且足够新，过旧会被服务端 403。
import crypto from "crypto";
import WebSocket, { type RawData } from "ws";
import { TTS_VOICES } from "./voices";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
// 24kHz 96kbps 单声道 MP3：体积与清晰度均衡，适合短句跟读音频
const OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";

export interface EdgeTtsOptions {
  voice?: string;
  rate?: string; // 语速，如 "-10%"
  pitch?: string; // 音调，如 "+0Hz"
  volume?: string; // 音量，如 "+0%"
  timeoutMs?: number; // 单次合成超时，默认 30s
}

function secMsGec(): string {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600; // 换算到 Windows 文件时间纪元
  ticks -= ticks % 300; // 向下取整到 5 分钟窗口
  ticks *= 1e7; // 秒 → 100ns tick
  return crypto
    .createHash("sha256")
    .update(`${ticks}${TRUSTED_CLIENT_TOKEN}`)
    .digest("hex")
    .toUpperCase();
}

function dateHeader(): string {
  return new Date()
    .toUTCString()
    .replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 合成一段文字，返回 MP3 Buffer（失败抛错） */
export function edgeTtsSynthesize(
  text: string,
  opts: EdgeTtsOptions = {}
): Promise<Buffer> {
  const {
    voice = TTS_VOICES.xiaoyi,
    rate = "-10%",
    pitch = "+0Hz",
    volume = "+0%",
    timeoutMs = 30_000,
  } = opts;
  const locale = voice.match(/^([a-z]{2}-[A-Z]{2})/)?.[1] ?? "zh-CN";

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(
      `${WSS_URL}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`,
      {
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
          Cookie: `muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
        },
      }
    );

    const chunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error("Edge TTS 合成超时")),
      timeoutMs
    );

    function finish(err: Error | null, buf?: Buffer) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
        // 忽略关闭异常
      }
      if (err) reject(err);
      else resolve(buf as Buffer);
    }

    ws.on("open", () => {
      // 连接建立后先发 speech.config 声明输出格式，再发 SSML 文本
      ws.send(
        `X-Timestamp:${dateHeader()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "true",
                  },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          })
      );
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
        `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
        `${escapeSsml(text)}</prosody></voice></speak>`;
      ws.send(
        `X-RequestId:${crypto.randomBytes(16).toString("hex")}\r\n` +
          `Content-Type:application/ssml+xml\r\nX-Timestamp:${dateHeader()}Z\r\n` +
          `Path:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on("message", (data: RawData, isBinary: boolean) => {
      if (!isBinary) {
        if (data.toString().includes("Path:turn.end")) {
          if (chunks.length === 0) finish(new Error("Edge TTS 返回空音频"));
          else finish(null, Buffer.concat(chunks));
        }
        return;
      }
      // 二进制帧：前 2 字节大端为头部长度，头部含 "Path:audio"，其后为音频数据
      const buf = data as Buffer;
      const headerLen = buf.readUInt16BE(0);
      chunks.push(buf.subarray(2 + headerLen));
    });

    ws.on("error", (err) => finish(err));
  });
}
