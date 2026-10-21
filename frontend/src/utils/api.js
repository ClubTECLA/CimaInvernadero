const configuredApiUrl = process.env.REACT_APP_API_URL;

export const API_URL = (
  configuredApiUrl !== undefined
    ? configuredApiUrl
    : process.env.NODE_ENV === "development"
      ? "http://localhost:4000"
      : ""
).replace(/\/$/, "");

export function getAssetUrl(assetPath) {
  if (!assetPath || /^https?:\/\//i.test(assetPath)) return assetPath;
  return `${API_URL}${assetPath.startsWith("/") ? assetPath : `/${assetPath}`}`;
}

export async function fetchJson(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("No fue posible conectar con el servidor");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `La solicitud falló (${response.status})`);
  }

  return data;
}
