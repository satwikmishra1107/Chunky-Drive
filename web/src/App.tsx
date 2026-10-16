import { useRef } from "react";
import Drive from "./Drive";
import AuthPage from "./components/AuthPage";
import Logo from "./components/Logo";
import { authClient } from "./lib/auth";

// Shows the drive to signed-in users and the sign-in / sign-up page to everyone else.
export default function App() {
  const { data: session, isPending } = authClient.useSession();
  // Better Auth re-checks the session after sign-up, sign-in, etc. Only the first check
  // shows the loading screen; later ones must not unmount the page (it would lose
  // whatever step the sign-up form was on).
  const checkedOnce = useRef(false);
  if (!isPending) checkedOnce.current = true;

  if (isPending && !checkedOnce.current) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Logo className="size-12 animate-pulse text-accent" />
      </div>
    );
  }

  return session ? <Drive user={session.user} /> : <AuthPage />;
}
