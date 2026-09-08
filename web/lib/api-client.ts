const endpointKey = "bundle-import-api-endpoint";
const tokenKey = "bundle-import-api-token";

export function apiConfiguration() {
  return { endpoint: localStorage.getItem(endpointKey) || "", token: sessionStorage.getItem(tokenKey) || "" };
}

export function configureApi(endpoint: string, token: string) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("ใช้ URL เซิร์ฟเวอร์ HTTPS ที่ไม่มีรหัสผ่านหรือ query");
  localStorage.setItem(endpointKey, url.href.replace(/\/$/, ""));
  sessionStorage.setItem(tokenKey, token.trim());
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const { endpoint, token } = apiConfiguration();
  if (!endpoint && window.location.hostname.endsWith("github.io")) throw new Error("เชื่อมต่อเซิร์ฟเวอร์ด้านบนก่อนใช้งาน");
  const headers = new Headers(options.headers);
  if (endpoint && token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(endpoint + path, { ...options, headers });
  } catch (error) {
    if (endpoint) throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจ URL และสิทธิ์เข้าถึง");
    throw error;
  }
}

export async function downloadApiFile(path: string, filename: string) {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error("ดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาตรวจสิทธิ์เข้าถึง");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
