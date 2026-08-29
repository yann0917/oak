// 学习园地语音助手（client 端）：
// 文字交给 /api/tts —— 服务端生成/命中缓存返回 MP3，浏览器再按 URL 做一层 HTTP 缓存，
// 同一句话第二次起直接播放。同一时刻只保留一个正在播放的 Audio，新语音自动打断旧语音。
"use client";

import { useEffect, useState } from "react";
import type { TtsVoice } from "@/lib/tts/voices";

const MUTE_KEY = "garden-voice-muted";
const CHANGE_EVENT = "garden-voice-change";

/** 语气参数（SSML prosody，拼进 /api/tts）：
 * rate 语速、pitch 音调、volume 音量；只有带了语气参数的语句才需要区分缓存 */
export interface SpeakTone {
  rate?: string;
  pitch?: string;
  volume?: string;
}

/** 有激情：音调上扬、音量略增（夸奖/庆祝时用） */
export const EXCITED_TONE: SpeakTone = { rate: "+0%", pitch: "+25Hz", volume: "+8%" };
/** 惋惜：语速放慢、音调下沉（答错/遗憾时用） */
export const SORRY_TONE: SpeakTone = { rate: "-20%", pitch: "-20Hz", volume: "-5%" };

let currentAudio: HTMLAudioElement | null = null;
let pendingResolve: (() => void) | null = null;

export function isVoiceMuted(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setVoiceMuted(muted: boolean): void {
  if (muted) stopSpeaking();
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // 隐私模式等存储不可用时静默跳过
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 静音开关状态（跨组件同步，挂载后才读 localStorage，避免 SSR 水合不一致） */
export function useVoiceMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const sync = () => setMuted(isVoiceMuted());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return [muted, setVoiceMuted];
}

export function ttsUrl(text: string, voice: TtsVoice = "xiaoyi", tone?: SpeakTone): string {
  const params = new URLSearchParams({ voice, text });
  if (tone) {
    if (tone.rate) params.set("rate", tone.rate);
    if (tone.pitch) params.set("pitch", tone.pitch);
    if (tone.volume) params.set("volume", tone.volume);
  }
  return `/api/tts?${params.toString()}`;
}

/** 朗读一句话，返回“播放结束（或被截断/失败）”的 Promise；静音时立即完成。
 * 调用方可用它决定何时推进下一步，避免反馈语音被提前截断。 */
export function speak(text: string, voice: TtsVoice = "xiaoyi", tone?: SpeakTone): Promise<void> {
  if (!text || isVoiceMuted()) return Promise.resolve();
  try {
    currentAudio ??= new Audio();
    const audio = currentAudio;
    return new Promise<void>((resolve) => {
      const done = () => {
        if (pendingResolve === resolve) pendingResolve = null;
        resolve();
      };
      // 上一段还没播完：视为已完成，避免它的回调挂到新音频上
      const prev = pendingResolve;
      pendingResolve = resolve;
      audio.onended = done;
      audio.onerror = done;
      prev?.();
      audio.pause();
      audio.src = ttsUrl(text, voice, tone);
      audio.load();
      void audio.play().catch(() => done());
    });
  } catch {
    return Promise.resolve();
  }
}

export function stopSpeaking(): void {
  pendingResolve?.();
  pendingResolve = null;
  currentAudio?.pause();
}

/**
 * 预热常用语音（鼓励语等）：后台逐条请求 /api/tts，服务端首次生成后落盘，
 * 之后所有设备播放这些固定语句都是即时命中。错开间隔避免首次并发打到 Edge 接口。
 */
let warmed = false;
export function prewarmGardenAudio(lines: [string, TtsVoice, SpeakTone?][]): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  lines.forEach(([text, voice, tone], i) => {
    window.setTimeout(() => fetch(ttsUrl(text, voice, tone)).catch(() => {}), i * 500);
  });
}
