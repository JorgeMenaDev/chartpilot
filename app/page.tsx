import { getSession } from "@/lib/session";
import { Chat } from "./chat";
import { Connect } from "./connect";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="landing">
        <h1>Copilot Chat</h1>
        <p>Connect your GitHub Copilot subscription and chat with an agent about anything.</p>
        <Connect />
        <p className="fine">Your token stays in an encrypted cookie. Usage counts against your own Copilot plan.</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <span className="who">
          <img src={session.avatarUrl} alt="" width={24} height={24} />
          {session.login}
        </span>
        <form action="/api/auth/logout" method="post">
          <button className="link">Disconnect</button>
        </form>
      </header>
      <Chat />
    </main>
  );
}
