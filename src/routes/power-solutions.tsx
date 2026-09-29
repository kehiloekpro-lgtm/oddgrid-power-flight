import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/power-solutions")({
  beforeLoad: () => {
    throw redirect({ to: "/back-up-power", statusCode: 301 });
  },
});
