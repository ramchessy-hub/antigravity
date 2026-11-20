// Edge function: assign-hcaptcha
// Strict 1->N rotation from the hcaptcha_links table, advanced atomically.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Id",
};

const ACTIVE_COOLDOWN_MS = 65 * 1000; // only for "running now" display, never blocks assignment

function todayStart(): string {
  const now = new Date();
  const istDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(istDate + "T00:00:00+05:30").toISOString();
}

async function assignUrl(supabase: ReturnType<typeof createClient>, deviceId: string) {
  const { data, error } = await supabase.rpc("assign_hcaptcha_link", { p_device_id: deviceId });
  if (error || !data) {
    return { error: error?.message || "assignment failed" };
  }
  return data;
}

async function completeAssignment(supabase: ReturnType<typeof createClient>, deviceId: string, label: string) {
  const now = new Date().toISOString();
  const { data: latest } = await supabase
    .from("hcaptcha_assignments")
    .select("id")
    .eq("device_id", deviceId)
    .eq("url_label", label)
    .eq("status", "assigned")
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id) {
    await supabase
      .from("hcaptcha_assignments")
      .update({ completed_at: now, status: "completed" })
      .eq("id", latest.id);
  }
  return { ok: true };
}

async function getCountToday(supabase: ReturnType<typeof createClient>) {
  const todayStartIso = todayStart();
  const [linksRes, assignmentsRes] = await Promise.all([
    supabase.from("hcaptcha_links").select("position, label, is_active").order("position", { ascending: true }),
    supabase
      .from("hcaptcha_assignments")
      .select("url_label, status, assigned_at")
      .gte("assigned_at", todayStartIso)
      .order("assigned_at", { ascending: false }),
  ]);

  const links = linksRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];

  const usage: Record<string, { assigned: number; completed: number; active: boolean }> = {};
  const labels: string[] = [];
  const nowMs = Date.now();

  links.forEach((l) => {
    labels.push(l.label);
    usage[l.label] = { assigned: 0, completed: 0, active: false };
  });

  let totalCount = 0;
  let completedCount = 0;
  let lastAssignedLabel = links[0]?.label ?? "URL_1";

  if (assignments.length > 0 && assignments[0].url_label) {
    lastAssignedLabel = String(assignments[0].url_label).trim();
  }

  assignments.forEach((r) => {
    const label = String(r.url_label || "").trim();
    if (usage[label]) {
      usage[label].assigned++;
      totalCount++;
      if (r.status === "completed") {
        usage[label].completed++;
        completedCount++;
      } else if (
        r.status === "assigned" &&
        r.assigned_at &&
        nowMs - new Date(r.assigned_at).getTime() < ACTIVE_COOLDOWN_MS
      ) {
        usage[label].active = true;
      }
    }
  });

  const { data: state } = await supabase
    .from("hcaptcha_rotation_state")
    .select("next_position")
    .eq("id", 1)
    .maybeSingle();
  const nextLabel = links.find((l) => l.position === state?.next_position)?.label ?? labels[0];

  return {
    count_today: totalCount,
    completed_today: completedCount,
    total_available: links.filter((l) => l.is_active).length,
    cycle: Math.floor(totalCount / Math.max(1, links.length)) + 1,
    last_label: lastAssignedLabel,
    next_label: nextLabel,
    labels,
    usage,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "request";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (action === "count") {
      const data = await getCountToday(supabase);
      return new Response(
        JSON.stringify({ ok: true, ...data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    if (action === "request") {
      const { device_id } = body;
      if (!device_id || typeof device_id !== "string") {
        return new Response(
          JSON.stringify({ error: "device_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const result = await assignUrl(supabase, device_id);
      const hasError = "error" in result && result.error;
      return new Response(
        JSON.stringify(result),
        { status: hasError ? 503 : 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "complete") {
      const { device_id, label } = body;
      if (!device_id || !label) {
        return new Response(
          JSON.stringify({ error: "device_id and label are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const result = await completeAssignment(supabase, device_id, label);
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
