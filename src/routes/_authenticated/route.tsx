import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session?.user) throw redirect({ to: "/auth" });
    return { session };
  },
  component: () => <Outlet />,
});
