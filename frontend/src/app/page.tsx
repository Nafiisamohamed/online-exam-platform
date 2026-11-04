import { redirect } from "next/navigation";

/** The platform opens on the dashboard (the sign-in page arrives in a later phase). */
export default function Home() {
  redirect("/dashboard");
}
