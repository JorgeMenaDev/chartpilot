import { AppHeader } from "@/components/app-header";
import { SignIn } from "@/components/sign-in";
import { getSession } from "@/lib/session";
import { Chat } from "./chat";

export default async function Home() {
  const session = await getSession();
  if (!session) return <SignIn />;

  return (
    <main className="flex h-dvh flex-col">
      <AppHeader session={session} tab="chat" />
      <Chat login={session.login} />
    </main>
  );
}
