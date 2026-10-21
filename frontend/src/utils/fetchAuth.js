export async function fetchAuth(url, options = {}) {
  const token = localStorage.getItem("token");

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });

  if (response.status === 401 && token) {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth:logout"));
  }

  return response;
}
