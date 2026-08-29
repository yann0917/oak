export interface OptionItem {
  id: number;
  name: string;
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  opts: { redirectOn401?: boolean } = {}
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401 && opts.redirectOn401 !== false) {
    window.location.href = "/login";
    throw new Error("未登录");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "请求失败");
  }
  return res.json();
}

export function uploadFiles(files: FileList | File[]): Promise<string[]> {
  const formData = new FormData();
  for (const f of Array.from(files)) formData.append("files", f);
  return fetch("/api/upload", { method: "POST", body: formData }).then(async (res) => {
    if (!res.ok) throw new Error("上传失败");
    return (await res.json()).paths;
  });
}

export function calcAge(birthday: string): string {
  if (!birthday) return "";
  const birth = new Date(birthday);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  return years > 0 ? `${years} 岁 ${months} 个月` : `${months} 个月`;
}

export const STAGES = ["幼儿园", "小学", "初中", "高中", "大学", "培训机构"];
export const SCHOOL_TYPES = ["幼儿园", "小学", "初中", "高中", "大学", "培训机构"];
export const HEALTH_TYPES = ["体检", "疫苗", "用药", "病历"];

export function formatDate(d: string) {
  if (!d) return "";
  return d;
}
