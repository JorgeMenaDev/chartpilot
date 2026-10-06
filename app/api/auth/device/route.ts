import { cookies } from "next/headers";
import { fetchUser, pollDeviceToken, requestDeviceCode } from "@/lib/github";
import { setSession } from "@/lib/session";

const DEVICE_COOKIE = "device_code";

// Starts sign-in: returns the code the user types at github.com/login/device.
// The device code itself stays server-side in an httpOnly cookie.
export async function POST() {
  const code = await requestDeviceCode();
  if (!code.device_code) return Response.json({ error: "GitHub refused the device code request." }, { status: 502 });
  (await cookies()).set(DEVICE_COOKIE, code.device_code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: code.expires_in,
  });
  return Response.json({ userCode: code.user_code, verificationUri: code.verification_uri, interval: code.interval });
}

// Polled by the browser until the user approves on GitHub.
export async function GET() {
  const jar = await cookies();
  const deviceCode = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceCode) return Response.json({ status: "failed", message: "Sign-in expired. Start again." });

  const result = await pollDeviceToken(deviceCode);
  if (result.status !== "done") return Response.json(result);

  jar.delete(DEVICE_COOKIE);
  await setSession({ ...(await fetchUser(result.token)), token: result.token }, result.expiresIn);
  return Response.json({ status: "done" });
}
