import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { setSession } from "@/lib/session";

type TokenResponse = { access_token?: string; error_description?: string };
type GitHubUser = { login: string; avatar_url: string };

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("oauth_state")?.value;
  jar.delete("oauth_state");
  if (!code || !state || state !== expected) return fail(req, "Sign-in expired. Try again.");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token, error_description } = (await tokenRes.json()) as TokenResponse;
  if (!access_token) return fail(req, error_description ?? "GitHub did not return a token.");

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "copilot-chat-poc" },
  });
  if (!userRes.ok) return fail(req, "Could not read your GitHub profile.");
  const user = (await userRes.json()) as GitHubUser;

  await setSession({ login: user.login, avatarUrl: user.avatar_url, token: access_token });
  return NextResponse.redirect(new URL("/", req.nextUrl.origin));
}

function fail(req: NextRequest, message: string) {
  const url = new URL("/", req.nextUrl.origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
