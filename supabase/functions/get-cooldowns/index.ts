// Edge function: get-cooldowns
// GET  — returns cooldown data for all devices + withdraw target VMs + network-restricted VMs
// POST — two actions:
//   { action: "complete_withdraw", vm: 46 }  → Tampermonkey marks a VM's withdraw as done
//   { action: "request_withdraw", vms: [46] | "ALL" }  → Dashboard triggers a withdraw
// Also auto-creates a scope='all' withdraw command when all 3 conditions are met.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Token",
};

const DEVICE_THRESHOLD = 0.5;
const SOL_BALANCE_THRESHOLD = 1;
const USDC_BALANCE_THRESHOLD = 1;
const MAX_VMS = 46;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ========================================================================
    // POST: Mark withdraw completed OR create withdraw request
    // ========================================================================
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));

      // Case A: Tampermonkey finished withdraw on a VM
      if (body.action === "complete_withdraw") {
        const doneVm = body.vm ? Number(body.vm) : null;
        const doneDid = String(body.device_id ?? "").trim().toLowerCase();

        const { data: pendingCmds } = await supabase
          .from("withdraw_commands")
          .select("*")
          .in("status", ["pending", "picked_up"]);

        for (const cmd of pendingCmds ?? []) {
          let targets: number[] = Array.isArray(cmd.target_vms) ? cmd.target_vms : [];
          if (cmd.vm && !targets.includes(Number(cmd.vm))) targets.push(Number(cmd.vm));

          const remaining = targets.filter(
            (t) => Number(t) !== doneVm && String(t).toLowerCase() !== doneDid
          );

          const cmdMatches =
            remaining.length === 0 ||
            Number(cmd.vm) === doneVm ||
            (cmd.device_id && String(cmd.device_id).toLowerCase() === doneDid);

          if (cmdMatches) {
            await supabase
              .from("withdraw_commands")
              .update({ status: "completed", target_vms: remaining, updated_at: new Date().toISOString() })
              .eq("command_id", cmd.command_id);
          } else {
            await supabase
              .from("withdraw_commands")
              .update({ target_vms: remaining, updated_at: new Date().toISOString() })
              .eq("command_id", cmd.command_id);
          }
        }

        return new Response(
          JSON.stringify({ success: true, message: "Withdraw marked completed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Case B: Website triggers a withdraw for specific VM(s)
      if (body.action === "request_withdraw") {
        const vms: (number | string)[] =
          body.vms === "ALL"
            ? ["ALL"]
            : Array.isArray(body.vms)
              ? body.vms
              : body.vm
                ? [body.vm]
                : ["ALL"];

        const commandId = `manual-${Date.now()}`;
        const { data, error } = await supabase
          .from("withdraw_commands")
          .insert({
            command_id: commandId,
            scope: "all",
            status: "pending",
            target_vms: vms,
            created_by: "dashboard",
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          })
          .select();

        if (error) throw error;
        return new Response(
          JSON.stringify({ success: true, command: data }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Case C: Tampermonkey reports a network restriction
      if (body.action === "report_network_error") {
        const deviceId = String(body.device_id ?? "").trim();
        const vm = body.vm ? Number(body.vm) : null;
        if (!deviceId) {
          return new Response(
            JSON.stringify({ error: "device_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        await supabase.from("network_errors").insert({
          device_id: deviceId,
          vm: vm,
          error_message: String(body.error_message ?? "Access restricted from this network"),
          element_html: body.element_html ? String(body.element_html) : null,
        });
        return new Response(
          JSON.stringify({ success: true, message: "Network error reported" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Case D: Tampermonkey resolves a network restriction
      if (body.action === "resolve_network_error") {
        const deviceId = String(body.device_id ?? "").trim();
        const vm = body.vm ? Number(body.vm) : null;
        let query = supabase.from("network_errors").update({ resolved: true, updated_at: new Date().toISOString() });
        if (deviceId) query = query.eq("device_id", deviceId);
        if (vm) query = query.eq("vm", vm);
        await query.eq("resolved", false);
        return new Response(
          JSON.stringify({ success: true, message: "Network error resolved" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================================================
    // GET: Cooldowns + withdraw VMs + network-restricted VMs
    // ========================================================================
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: devicesRaw, error: devErr } = await supabase
      .from("devices")
      .select("device_id, sort_order, last_balance, last_seen_at, wait_seconds, wait_time_text, updated_at, next_claim_at")
      .order("sort_order", { ascending: true });

    if (devErr) throw devErr;

    const devicesList = devicesRaw ?? [];

    // Fetch active network errors
    const { data: netErrors } = await supabase
      .from("network_errors")
      .select("device_id, vm, error_message, updated_at")
      .eq("resolved", false);

    const restrictedDidSet = new Set<string>();
    const restrictedVmSet = new Set<number>();
    for (const ne of netErrors ?? []) {
      if (ne.device_id) restrictedDidSet.add(String(ne.device_id).trim().toLowerCase());
      if (ne.vm) restrictedVmSet.add(Number(ne.vm));
    }

    // Fetch active withdraw commands
    const { data: activeWithdraws } = await supabase
      .from("withdraw_commands")
      .select("*")
      .in("status", ["pending", "picked_up"])
      .order("created_at", { ascending: false });

    let withdrawAll = false;
    const withdrawVmSet = new Set<number>();
    const withdrawDidSet = new Set<string>();

    for (const cmd of activeWithdraws ?? []) {
      if (cmd.device_id) {
        const d = String(cmd.device_id).trim().toLowerCase();
        if (d === "all") withdrawAll = true;
        else withdrawDidSet.add(d);
      }
      if (cmd.vm) withdrawVmSet.add(Number(cmd.vm));
      if (Array.isArray(cmd.target_vms)) {
        for (const item of cmd.target_vms) {
          if (String(item).toUpperCase() === "ALL") {
            withdrawAll = true;
          } else if (!isNaN(Number(item)) && Number(item) >= 1 && Number(item) <= MAX_VMS) {
            withdrawVmSet.add(Number(item));
          } else {
            withdrawDidSet.add(String(item).trim().toLowerCase());
          }
        }
      }
    }

    // Enrich devices with network_restricted and withdraw_requested flags
    const enrichedDevices = devicesList.map((d: Record<string, unknown>) => {
      const vmNum = d.sort_order ? Number(d.sort_order) : 0;
      const did = String(d.device_id ?? "").trim().toLowerCase();
      const waitText = String(d.wait_time_text ?? "");
      const normalizedWaitRaw = waitText.trim().toLowerCase();

      const isNetRestricted =
        restrictedVmSet.has(vmNum) ||
        (did && restrictedDidSet.has(did)) ||
        waitText.toLowerCase().includes("access restricted from this network");

      if (isNetRestricted && vmNum >= 1 && vmNum <= MAX_VMS) {
        restrictedVmSet.add(vmNum);
      }

      const isWithdrawRequested =
        withdrawAll ||
        withdrawVmSet.has(vmNum) ||
        (did && withdrawDidSet.has(did));

      if (isWithdrawRequested && vmNum >= 1 && vmNum <= MAX_VMS) {
        withdrawVmSet.add(vmNum);
      }

      const lastSyncEpoch = d.last_seen_at
        ? Math.floor(new Date(d.last_seen_at as string).getTime() / 1000)
        : null;
      const waitSeconds = (d.wait_seconds as number | null) ?? null;
      const normalizedWait = normalizedWaitRaw;
      const isReadyText =
        normalizedWait === 'ready' ||
        normalizedWait === 'ready now' ||
        normalizedWait === 'claim your drop' ||
        normalizedWait === '' ||
        normalizedWait === 'none' ||
        normalizedWait === 'null' ||
        normalizedWait === 'n/a' ||
        normalizedWait === 'no data' ||
        (waitSeconds === null && !normalizedWait) ||
        (d.wait_time_text === null && waitSeconds === null);
      const isFinishFlip = normalizedWait.includes('finish') && normalizedWait.includes('flip');
      const isSleeping = normalizedWait === 'sleeping';
      const nowEpoch = Math.floor(Date.now() / 1000);

      // Primary signal: next_claim_at timestamp (set by sync-device)
      const nextClaimAtStr = d.next_claim_at as string | null;
      let readyAtEpoch: number | null = null;
      if (isReadyText || waitSeconds === 0) {
        readyAtEpoch = 0;
      } else if (nextClaimAtStr) {
        readyAtEpoch = Math.floor(new Date(nextClaimAtStr).getTime() / 1000);
      } else if (lastSyncEpoch !== null && waitSeconds !== null && waitSeconds > 0) {
        readyAtEpoch = lastSyncEpoch + waitSeconds;
      }

      // Any device that is currently offline is treated as ready to claim
      // so the Tampermonkey script will attempt a claim and wake it back up.
      const lastSeenMs = d.last_seen_at
        ? new Date(d.last_seen_at as string).getTime()
        : null;
      const isOffline = lastSeenMs !== null && (Date.now() - lastSeenMs) >= 3 * 3600 * 1000; // offline after 3h

      const timerExpired = readyAtEpoch !== null && readyAtEpoch <= nowEpoch;
      const isReady = !isSleeping && !isFinishFlip && (isReadyText || waitSeconds === 0 || timerExpired) || isOffline;

      return {
        vm: vmNum,
        device_id: d.device_id,
        balance: d.last_balance ?? 0,
        last_sync_epoch: lastSyncEpoch,
        wait_seconds: waitSeconds,
        wait_text: d.wait_time_text ?? null,
        ready_at_epoch: readyAtEpoch,
        is_ready: isReady,
        finish_flip: isFinishFlip,
        sleeping: isSleeping,
        network_restricted: isNetRestricted,
        withdraw_requested: isWithdrawRequested,
        offline_ready: isOffline,
      };
    });

    // Auto-withdraw: check the 3 conditions
    const deviceReady = enrichedDevices.some((d) => d.balance >= DEVICE_THRESHOLD);

    const { data: latestSolCheck } = await supabase
      .from("solana_wallet_checks")
      .select("sol_balance, usdc_balance, sol_price_usd")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const solUsdValue = latestSolCheck
      ? (latestSolCheck.sol_balance ?? 0) * (latestSolCheck.sol_price_usd ?? 0)
      : 0;
    const usdcBalance = latestSolCheck?.usdc_balance ?? 0;

    const usdcReady = usdcBalance >= USDC_BALANCE_THRESHOLD;
    const solReady = solUsdValue >= SOL_BALANCE_THRESHOLD;
    const allReady = deviceReady && usdcReady && solReady;

    let autoWithdrawTriggered = false;

    if (allReady && !withdrawAll && withdrawVmSet.size === 0) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentCmd } = await supabase
        .from("withdraw_commands")
        .select("command_id")
        .eq("scope", "all")
        .in("status", ["pending", "picked_up"])
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!recentCmd) {
        const commandId = `auto-${Date.now()}`;
        await supabase.from("withdraw_commands").insert({
          command_id: commandId,
          scope: "all",
          status: "pending",
          target_vms: ["ALL"],
          created_by: "auto-get-cooldowns",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        autoWithdrawTriggered = true;
        withdrawAll = true;
      }
    }

    // Final arrays
    if (withdrawVmSet.size >= MAX_VMS) withdrawAll = true;

    const withdrawVmsArray = withdrawAll
      ? Array.from({ length: MAX_VMS }, (_, i) => i + 1)
      : Array.from(withdrawVmSet).sort((a, b) => a - b);

    const restrictedVmsArray = Array.from(restrictedVmSet).sort((a, b) => a - b);
    const anyWithdraw = withdrawAll || withdrawVmsArray.length > 0 || withdrawDidSet.size > 0;

    const { data: cocoBalances, error: cocoErr } = await supabase
      .from("coco_balances")
      .select("device_id, last_balance_text, last_balance_value, last_seen_at, is_online")
      .order("created_at", { ascending: true });

    if (cocoErr) throw cocoErr;

    return new Response(
      JSON.stringify({
        auto_withdraw_triggered: autoWithdrawTriggered || anyWithdraw,
        withdraw_all: withdrawAll,
        withdraw_vms: withdrawVmsArray,
        withdraw_device_ids: Array.from(withdrawDidSet),
        network_restricted_vms: restrictedVmsArray,
        conditions: {
          device_ready: deviceReady,
          usdc_ready: usdcReady,
          sol_ready: solReady,
          all_ready: allReady,
        },
        devices: enrichedDevices,
        coco_balances: cocoBalances ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
