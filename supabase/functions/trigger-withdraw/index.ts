// Edge function: trigger-withdraw (v2)
// Handles the full withdraw command lifecycle:
//   GET  ?action=poll&device_id=X     — Tampermonkey polls for newest pending command
//   GET  ?action=bat-poll              — .bat controller polls for newest pending all/test command
//   POST ?action=create               — Dashboard creates a withdraw command
//   POST ?action=cancel               — Dashboard cancels a command or all pending
//   POST ?action=ack                  — Tampermonkey reports picked_up/executed/failed
// Sweeps expired commands on every request.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Id",
};

const COMMAND_EXPIRY_HOURS = 168; // 7 days

async function sweepExpired(supabase: ReturnType<typeof createClient>): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("withdraw_commands")
    .update({ status: "expired" })
    .in("status", ["pending", "picked_up"])
    .lt("expires_at", now);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "poll";

    // Sweep expired commands on every request
    await sweepExpired(supabase);

    // ========================================================================
    // GET actions: poll (Tampermonkey) and bat-poll (.bat controller)
    // ========================================================================
    if (req.method === "GET") {
      // --- Tampermonkey poll: find newest pending command for this device ---
      if (action === "poll") {
        const deviceId = url.searchParams.get("device_id");
        if (!deviceId) {
          return new Response(
            JSON.stringify({ ok: false, error: "device_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Fetch pending commands: scope=all OR (scope=single AND target_device_id=deviceId)
        const { data: allCmds } = await supabase
          .from("withdraw_commands")
          .select("command_id, scope, target_device_id, status, created_at, expires_at, target_vms, device_id, vm")
          .in("status", ["pending", "picked_up"])
          .order("created_at", { ascending: false });

        const matching = (allCmds ?? []).filter((cmd: Record<string, unknown>) => {
          const scope = String(cmd.scope ?? "");
          const targetDid = String(cmd.target_device_id ?? "").trim().toLowerCase();
          const did = String(deviceId).trim().toLowerCase();
          if (scope === "all") return true;
          if (scope === "single") return targetDid === did;
          if (scope === "test") return false; // test commands are for .bat only
          return false;
        });

        if (matching.length === 0) {
          return new Response(
            JSON.stringify({ ok: true, command: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const cmd = matching[0] as Record<string, unknown>;
        const commandId = String(cmd.command_id);

        // Check if this device already acked this command
        const { data: existingAck } = await supabase
          .from("withdraw_command_acks")
          .select("status")
          .eq("command_id", commandId)
          .eq("device_id", deviceId)
          .maybeSingle();

        if (existingAck) {
          // Already acked — no new command to deliver
          return new Response(
            JSON.stringify({ ok: true, command: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, command: cmd }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // --- .bat controller poll: find newest pending all/test command ---
      if (action === "bat-poll") {
        const { data: batCmds } = await supabase
          .from("withdraw_commands")
          .select("command_id, scope, status, created_at, expires_at, target_vms, device_id, vm")
          .in("status", ["pending"])
          .in("scope", ["all", "test"])
          .order("created_at", { ascending: false });

        const newest = (batCmds ?? [])[0] as Record<string, unknown> | undefined;

        if (!newest) {
          // Record bat_controller heartbeat even if no command
          await supabase
            .from("controller_heartbeats")
            .upsert({ source: "bat_controller", last_seen_at: new Date().toISOString() }, { onConflict: "source" });

          return new Response(
            JSON.stringify({ ok: true, command: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Atomically mark it as picked_up
        const now = new Date().toISOString();
        const { data: pickedUp, error: pickErr } = await supabase
          .from("withdraw_commands")
          .update({ status: "picked_up", picked_up_at: now, updated_at: now })
          .eq("command_id", String(newest.command_id))
          .eq("status", "pending")
          .select();

        if (pickErr) {
          return new Response(
            JSON.stringify({ ok: false, error: "Failed to pick up command" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Record bat_controller heartbeat
        await supabase
          .from("controller_heartbeats")
          .upsert({ source: "bat_controller", last_seen_at: now }, { onConflict: "source" });

        const result = (pickedUp && pickedUp.length > 0) ? pickedUp[0] : newest;

        return new Response(
          JSON.stringify({ ok: true, command: result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Unknown GET action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ========================================================================
    // POST actions: create, cancel, ack
    // ========================================================================
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));

      // --- Create a withdraw command (from dashboard) ---
      if (action === "create") {
        const scope = String(body.scope ?? "all").toLowerCase();
        const targetDeviceId = body.target_device_id ? String(body.target_device_id) : null;
        const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const expiresAt = new Date(Date.now() + COMMAND_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

        let targetVms: unknown[] = [];
        if (body.target_vms) {
          targetVms = Array.isArray(body.target_vms) ? body.target_vms : [body.target_vms];
        } else if (scope === "all") {
          targetVms = ["ALL"];
        }

        const { data, error: insertErr } = await supabase
          .from("withdraw_commands")
          .insert({
            command_id: commandId,
            scope,
            target_device_id: targetDeviceId,
            status: "pending",
            target_vms: targetVms,
            created_by: "dashboard",
            expires_at: expiresAt,
          })
          .select();

        if (insertErr) {
          return new Response(
            JSON.stringify({ ok: false, error: "Failed to create command" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, command: data?.[0] ?? null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // --- Cancel a command or all pending commands ---
      if (action === "cancel") {
        const commandId = body.command_id ? String(body.command_id) : null;

        if (commandId) {
          // Cancel a single command
          const { error: cancelErr } = await supabase
            .from("withdraw_commands")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("command_id", commandId)
            .in("status", ["pending", "picked_up"]);

          if (cancelErr) {
            return new Response(
              JSON.stringify({ ok: false, error: "Failed to cancel command" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        } else {
          // Cancel ALL pending/picked_up commands
          const { error: cancelAllErr } = await supabase
            .from("withdraw_commands")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .in("status", ["pending", "picked_up"]);

          if (cancelAllErr) {
            return new Response(
              JSON.stringify({ ok: false, error: "Failed to cancel all commands" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // --- Ack a command (from Tampermonkey) ---
      if (action === "ack") {
        const commandId = String(body.command_id ?? "").trim();
        const deviceId = String(body.device_id ?? "").trim();
        const status = String(body.status ?? "").trim().toLowerCase();
        const message = body.message ? String(body.message) : null;

        if (!commandId || !deviceId || !status) {
          return new Response(
            JSON.stringify({ ok: false, error: "command_id, device_id, and status are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Upsert the ack (unique command_id + device_id)
        const { error: ackErr } = await supabase
          .from("withdraw_command_acks")
          .upsert(
            {
              command_id: commandId,
              device_id: deviceId,
              status,
              message,
              reported_at: new Date().toISOString(),
            },
            { onConflict: "command_id,device_id" },
          );

        if (ackErr) {
          return new Response(
            JSON.stringify({ ok: false, error: "Failed to record ack" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Update command status based on ack
        const now = new Date().toISOString();
        if (status === "executed") {
          await supabase
            .from("withdraw_commands")
            .update({ status: "executed", executed_at: now, updated_at: now })
            .eq("command_id", commandId)
            .in("status", ["pending", "picked_up"]);
        } else if (status === "failed") {
          // Don't fail the whole command for a single device failure;
          // just record the ack. The command stays pending/picked_up so
          // other devices can still process it.
        } else if (status === "picked_up") {
          await supabase
            .from("withdraw_commands")
            .update({ status: "picked_up", picked_up_at: now, updated_at: now })
            .eq("command_id", commandId)
            .eq("status", "pending");
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Unknown POST action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
