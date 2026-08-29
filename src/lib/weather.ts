/** 今日诗词 /info 接口的天气数据 */
export interface JinrishiciWeather {
  temperature: number;
  windDirection: string;
  windPower: number;
  humidity: number;
  updateTime: string;
  weather: string;
  visibility: string;
  rainfall: number;
  pm25: number;
}

export interface JinrishiciInfo {
  token: string;
  /** 如 "浙江|杭州" */
  region: string;
  weatherData: JinrishiciWeather;
  tags: string[];
  beijingTime: string;
}

/**
 * 获取天气信息。不需要传 token：服务端会在响应里种下 X-User-Token cookie，
 * 带 credentials 请求时浏览器自动回传，服务端据此识别同一客户端
 * （与官方 SDK 的 withCredentials 做法一致）。
 */
export async function fetchWeather(): Promise<JinrishiciInfo> {
  const res = await fetch("https://v2.jinrishici.com/info?client=browser/edu", {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== "success") throw new Error(String(json.status));
  return json.data as JinrishiciInfo;
}
