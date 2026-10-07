import { AppHeader } from "@/components/app-header";
import { SignIn } from "@/components/sign-in";
import { VisualizePage } from "@/components/visualize/visualize-page";
import { getSession } from "@/lib/session";
import { builderInput } from "@/lib/visualize/data";

export const metadata = { title: "Visualize · Chartpilot" };

export default async function Visualize() {
  const session = await getSession();
  if (!session) return <SignIn />;

  return (
    // The window scrolls under a sticky header; the composer floats at its foot.
    <main className="min-h-dvh">
      <div className="sticky top-0 z-30 bg-background">
        <AppHeader session={session} tab="visualize" />
      </div>
      <VisualizePage input={builderInput()} />
    </main>
  );
}
