"use client";

import { useEffect, useState } from "react";
import { fetchWeather, type JinrishiciInfo } from "@/lib/weather";

/** 顶部栏的天气徽标（今日诗词接口），AppShell 挂载时请求一次，失败时静默隐藏 */
export function WeatherBadge() {
  const [info, setInfo] = useState<JinrishiciInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWeather()
      .then((d) => {
        if (!cancelled) setInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info) return null;
  const city = info.region.split("|").pop();
  const w = info.weatherData;
  return (
    <div
      className="hidden sm:flex items-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap cursor-default"
      title={`PM2.5 ${w.pm25} · 能见度 ${w.visibility} · ${w.updateTime} 更新`}
      style={{
        background: "var(--animal-primary-color-bg)",
        color: "var(--animal-primary-color-active)",
      }}
    >
      <span>
        {city} · {w.weather} {w.temperature}°C
      </span>
      {/* 窄屏下头部放不下，风向湿度从大屏起逐段显示 */}
      <span className="hidden lg:inline">
        {" · "}
        {w.windDirection}
        {w.windPower}级
      </span>
      <span className="hidden lg:inline">
        {" · "}
        湿度{w.humidity}%
      </span>
    </div>
  );
}
