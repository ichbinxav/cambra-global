// DEPRECATED — kept for backward compatibility only.
// All auth + logging is now handled inline by /functions/apiV1 and /functions/mcpServer.
// This endpoint returns 410 Gone to surface any stale callers.
Deno.serve(() => {
  return new Response(
    JSON.stringify({
      error: "gone",
      message: "/functions/apiAuth is deprecated. Use /functions/apiV1 (REST) or /functions/mcpServer (MCP) directly. Auth is handled per request via the Authorization header.",
      successor: "/functions/apiV1",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
});