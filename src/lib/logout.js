import { base44 } from "@/api/base44Client";

export async function signOutToHome() {
  const destination = `${window.location.origin}/`;
  try {
    await base44.auth.logout(destination);
  } catch {
    window.location.replace(destination);
  }
}
