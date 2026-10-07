// GitHub OAuth device flow: the user types a short code on github.com, no client secret needed.
// The app's OAuth App must have "Enable Device Flow" ticked.

const CLIENT_ID = () => {
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) throw new Error("GITHUB_CLIENT_ID is not set");
  return id;
};

async function postForm<T>(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return (await res.json()) as T;
}

export type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

export function requestDeviceCode() {
  return postForm<DeviceCode>("https://github.com/login/device/code", { client_id: CLIENT_ID(), scope: "read:user" });
}

export type PollResult =
  | { status: "pending"; interval?: number }
  | { status: "done"; token: string; expiresIn?: number }
  | { status: "failed"; message: string };

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string; interval?: number };

export async function pollDeviceToken(deviceCode: string): Promise<PollResult> {
  const r = await postForm<TokenResponse>("https://github.com/login/oauth/access_token", {
    client_id: CLIENT_ID(),
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (r.access_token) return { status: "done", token: r.access_token, expiresIn: r.expires_in };
  if (r.error === "authorization_pending") return { status: "pending" };
  if (r.error === "slow_down") return { status: "pending", interval: r.interval };
  return { status: "failed", message: r.error_description ?? r.error ?? "Unknown error" };
}

export async function fetchUser(token: string) {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": "chartpilot" },
  });
  if (!res.ok) throw new Error(`GitHub /user returned ${res.status}`);
  const user = (await res.json()) as { login: string; avatar_url: string };
  return { login: user.login, avatarUrl: user.avatar_url };
}
