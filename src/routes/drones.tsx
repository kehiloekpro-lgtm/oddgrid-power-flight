import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/drones")({
  beforeLoad: () => {
    throw redirect({ to: "/sub-zero", statusCode: 301 });
  },
});
