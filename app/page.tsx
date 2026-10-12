import { LiteratureApp } from "../components/literature-app";
import { LoginGate } from "../components/login-gate";
import { getAuthenticatedUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAuthenticatedUser();
  if (!user) return <LoginGate />;

  return (
    <LiteratureApp
      user={{
        displayName: user.displayName,
        email: user.email,
        provider: user.provider,
        signOutPath: user.signOutPath,
      }}
    />
  );
}
