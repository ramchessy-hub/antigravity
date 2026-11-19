// Edge function: assign-hcaptcha
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Id",
};

const HCAPTCHA_URLS: { label: string; url: string }[] = [
  { label: "URL_1",  url: "https://accounts.hcaptcha.com/verify_email/e1e7ee0a-d569-48ea-a826-dd0dda0d438a" },
  { label: "URL_2",  url: "https://accounts.hcaptcha.com/verify_email/fb44ffdf-d83c-4a43-892a-e5bb8bd54027" },
  { label: "URL_3",  url: "https://accounts.hcaptcha.com/verify_email/43361230-bf41-4ba9-9041-5f0d53056ae8" },
  { label: "URL_4",  url: "https://accounts.hcaptcha.com/verify_email/302f6237-c995-46ce-ae10-33e83be3baf0" },
  { label: "URL_5",  url: "https://accounts.hcaptcha.com/verify_email/cb076e26-7e02-4021-a008-e6a8b2375906" },
  { label: "URL_6",  url: "https://accounts.hcaptcha.com/verify_email/f64f66ba-ceaa-430d-951d-913ab2497fa9" },
  { label: "URL_7",  url: "https://accounts.hcaptcha.com/verify_email/9f50283e-d840-40b4-a675-82dd142921cc" },
  { label: "URL_8",  url: "https://accounts.hcaptcha.com/verify_email/401a44ac-d296-456f-9167-ed167fa7913d" },
  { label: "URL_9",  url: "https://accounts.hcaptcha.com/verify_email/14246df8-bba3-4d8a-9466-08e2d457bfd5" },
  { label: "URL_10", url: "https://accounts.hcaptcha.com/verify_email/6a533eb7-0dd9-583a-aa4e-f549f387761f" },
  { label: "URL_11", url: "https://accounts.hcaptcha.com/verify_email/3d52861f-1195-4df7-b370-184f5157b4c7" },
  { label: "URL_12", url: "https://accounts.hcaptcha.com/verify_email/c45951ab-5c2e-4c02-81ca-8a1cad9b290f" },
  { label: "URL_13", url: "https://accounts.hcaptcha.com/verify_email/d713d486-c973-4263-8892-d8285542a1a4" },
  { label: "URL_14", url: "https://accounts.hcaptcha.com/verify_email/63fd95b5-0851-4ef9-9c68-aab84627aeac" },
  { label: "URL_15", url: "https://accounts.hcaptcha.com/verify_email/0ac3f3e5-8e1a-4fbe-8df2-25a5a5428aa1" },
  { label: "URL_16", url: "https://accounts.hcaptcha.com/verify_email/8650b147-1ed8-46a8-9464-9179e9d088b4" },
  { label: "URL_17", url: "https://accounts.hcaptcha.com/verify_email/6adc58eb-0bc5-f526-040a-8df54193ba82" },
  { label: "URL_18", url: "https://accounts.hcaptcha.com/verify_email/ba244034-c494-4790-8d80-f35b57d6aa16" },
  { label: "URL_19", url: "https://accounts.hcaptcha.com/verify_email/f33c2027-21aa-442f-91dd-45006c593a67" },
  { label: "URL_20", url: "https://accounts.hcaptcha.com/verify_email/8e35bc66-3907-4c65-9e59-d44374508daf" },
  { label: "URL_21", url: "https://accounts.hcaptcha.com/verify_email/954250c0-ea58-4e66-aad4-9127e90eb160" },
  { label: "URL_22", url: "https://accounts.hcaptcha.com/verify_email/f1a4760f-8bf1-4e2e-928e-5576f9a232df" },
  { label: "URL_23", url: "https://accounts.hcaptcha.com/verify_email/1de3b9c0-6087-443b-9d7d-25159a2d6e79" },
  { label: "URL_24", url: "https://accounts.hcaptcha.com/verify_email/6af4f57b-3139-e3a8-e05e-2860d887aecd" },
  { label: "URL_25", url: "https://accounts.hcaptcha.com/verify_email/ac173a84-82ef-47e3-b4ca-f88d5e1df109" },
  { label: "URL_26", url: "https://accounts.hcaptcha.com/verify_email/9ec84a95-e41e-4960-b699-235250c589a3" },
  { label: "URL_27", url: "https://accounts.hcaptcha.com/verify_email/6af50e79-6101-02be-2f91-82241ed50883" },
  { label: "URL_28", url: "https://accounts.hcaptcha.com/verify_email/d7884703-ac06-4115-ae94-47c4af363b88" },
  { label: "URL_29", url: "https://accounts.hcaptcha.com/verify_email/6af77c7c-e263-4fd4-58c2-f894ad730456" },
  { label: "URL_30", url: "https://accounts.hcaptcha.com/verify_email/6af90d1d-1a25-cef5-3f0a-ecb65d840f68" },
  { label: "URL_31", url: "https://accounts.hcaptcha.com/verify_email/6b268b70-cb1e-4bdb-b9ae-7a75ac67c45d" },
  { label: "URL_32", url: "https://accounts.hcaptcha.com/verify_email/0c71af4f-8b61-4f4b-962c-d08235d8b2e9" },
  { label: "URL_33", url: "https://accounts.hcaptcha.com/verify_email/ec4533c8-b91a-4a0f-90c8-df98d6c3ca6d" },
  { label: "URL_34", url: "https://accounts.hcaptcha.com/verify_email/b1e66167-da72-4e07-bd3a-af09ebe9da19" },
  { label: "URL_35", url: "https://accounts.hcaptcha.com/verify_email/ad572904-0415-4a14-9818-f21e303150f7" },
  { label: "URL_36", url: "https://accounts.hcaptcha.com/verify_email/c37aa11d-1291-4e40-8a83-8e7a13c9ccb6" },
  { label: "URL_37", url: "https://accounts.hcaptcha.com/verify_email/f1e18359-b4a8-45b7-877d-70b6e9667049" },
  { label: "URL_38", url: "https://accounts.hcaptcha.com/verify_email/6aebcd63-8921-5b09-3ff6-55c0e53653f6" },
  { label: "URL_39", url: "https://accounts.hcaptcha.com/verify_email/3c4347dc-9bc3-49b2-a95e-77257e349901" },
  { label: "URL_40", url: "https://accounts.hcaptcha.com/verify_email/7f42fe13-9445-4516-a0b5-7547832fce83" },
];

const ACTIVE_COOLDOWN_MS = 65 * 1000; // only used for "running now" display, never blocks assignment

function todayStart(): string {
  const now = new Date();
  const istDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(istDate + "T00:00:00+05:30").toISOString();
}

async function assignUrl(supabase: ReturnType<typeof createClient>, deviceId: string) {
  const todayStartIso = todayStart();
  const { data: rows } = await supabase
    .from("hcaptcha_assignments")
    .select("url_label, status, assigned_at")
    .gte("assigned_at", todayStartIso)
    .order("assigned_at", { ascending: true });

  const stats = new Map<
    string,
    { count: number; lastAssignedMs: number; index: number }
  >();

  HCAPTCHA_URLS.forEach((u, idx) => {
    stats.set(u.label, { count: 0, lastAssignedMs: 0, index: idx });
  });

  for (const r of rows ?? []) {
    const label = String(r.url_label || "").trim();
    const entry = stats.get(label);
    if (!entry) continue;
    entry.count++;
    const ts = r.assigned_at ? new Date(r.assigned_at).getTime() : 0;
    if (ts > entry.lastAssignedMs) entry.lastAssignedMs = ts;
  }

  // Least-assigned first, ties broken by least-recently-used, then natural 1->40 order.
  const ranked = [...HCAPTCHA_URLS].sort((a, b) => {
    const sa = stats.get(a.label)!;
    const sb = stats.get(b.label)!;
    if (sa.count !== sb.count) return sa.count - sb.count;
    if (sa.lastAssignedMs !== sb.lastAssignedMs) return sa.lastAssignedMs - sb.lastAssignedMs;
    return sa.index - sb.index;
  });

  const nowIso = new Date().toISOString();

  // Double-check: try the top candidates in order until the insert is confirmed saved.
  for (let i = 0; i < Math.min(3, ranked.length); i++) {
    const candidate = ranked[i];
    const { error } = await supabase.from("hcaptcha_assignments").insert({
      device_id: deviceId,
      url_label: candidate.label,
      assigned_at: nowIso,
      status: "assigned",
    });
    if (!error) {
      return {
        url: candidate.url,
        label: candidate.label,
        cycle: stats.get(candidate.label)!.count + 1,
        total_available: HCAPTCHA_URLS.length,
      };
    }
  }

  // Last resort: serve the top-ranked link even if logging failed, so a device is never left waiting.
  const fallback = ranked[0];
  return {
    url: fallback.url,
    label: fallback.label,
    cycle: stats.get(fallback.label)!.count + 1,
    total_available: HCAPTCHA_URLS.length,
  };
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
  const { data: assignments } = await supabase
    .from("hcaptcha_assignments")
    .select("url_label, status, assigned_at")
    .gte("assigned_at", todayStartIso)
    .order("assigned_at", { ascending: false });

  const usage: Record<string, { assigned: number; completed: number; active: boolean }> = {};
  const labels: string[] = [];
  const nowMs = Date.now();

  HCAPTCHA_URLS.forEach((u) => {
    labels.push(u.label);
    usage[u.label] = { assigned: 0, completed: 0, active: false };
  });

  let totalCount = 0;
  let completedCount = 0;
  let lastAssignedLabel = "URL_1";

  if (assignments && assignments.length > 0 && assignments[0].url_label) {
    lastAssignedLabel = String(assignments[0].url_label).trim();
  }

  (assignments ?? []).forEach((r) => {
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

  return {
    count_today: totalCount,
    completed_today: completedCount,
    total_available: HCAPTCHA_URLS.length,
    cycle: Math.floor(totalCount / HCAPTCHA_URLS.length) + 1,
    last_label: lastAssignedLabel,
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
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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