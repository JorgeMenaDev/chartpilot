import { getModelCatalog } from "@/lib/models";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("Not signed in", { status: 401 });
  return Response.json(await getModelCatalog(session.login, session.token));
}
