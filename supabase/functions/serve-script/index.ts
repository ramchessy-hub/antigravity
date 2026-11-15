import { script } from "./script.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return new Response(script, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
