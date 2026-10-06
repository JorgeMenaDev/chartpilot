import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// Starts GitHub OAuth. The returned token works with the user's own Copilot plan.
export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", new URL("/api/auth/callback", req.nextUrl.origin).toString());
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
