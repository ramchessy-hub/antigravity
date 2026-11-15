// Edge function: sync-device (handles balance reporting + batch cycle rotation)
// 7 batches (A-G), 6 devices each except G (5 devices), 8 rotations per day.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Token",
};

const DEVICE_ORDER: Record<string, number> = {
  "device-lk9e6b4": 1,
  "device-5wj3i1k": 2,
  "device-ebyrsyx": 3,
  "device-i0j769i": 4,
  "device-ioj769i": 4,
  "device-8n449x2": 5,
  "device-89y64u5": 6,
  "device-kss34ac": 7,
  "device-9mul0zf": 8,
  "device-qe7ratd": 9,
  "device-3r1x99m": 10,
  "device-dn4gzmh": 11,
  "device-y96qqpm": 12,
  "device-y96qqm": 12,
  "device-j5ubb69": 13,
  "device-yylmojo": 14,
  "device-in5rrr0": 15,
  "device-in5rr0": 15,
  "device-epkkrxg": 16,
  "device-fwj7x8c": 17,
  "device-qjhnrgm": 18,
  "device-a9ho4dl": 19,
  "device-bbp05wt": 20,
  "decice-bbp05wt": 20,
  "device-khkqdcv": 21,
  "device-2efmowx": 22,
  "device-4jbbng8": 23,
  "device-7zryt0f": 24,
  "device-h86smhy": 25,
  "device-y50tpn8": 26,
  "device-rv0hwaz": 27,
  "device-ug4hcy2": 28,
  "device-na5s6so": 29,
  "device-8lxebne": 30,
  "device-pzyq2x1": 31,
  "device-tpyqqbq": 32,
  "device-6pk79hn": 33,
  "device-ibzsb97": 34,
  "device-wmhoi13": 35,
  "device-j4u0omj": 36,
  "device-zj4x21j": 37,
  "device-0is7tlp": 38,
  "device-725d2xn": 39,
  "device-36ytkwb": 40,
  "device-fsqbmgp": 41,
  "1": 42,
  "device-m7p4j4d": 43,
  "device-5ufgras": 44,
  "device-r26zoa2": 45,
};

const TOTAL_BATCHES = 7;
const TOTAL_ROTATIONS = 8;
const BATCH_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function batchForSortOrder(sortOrder: number): string {
  if (sortOrder <= 6) return "A";
  if (sortOrder <= 12) return "B";
  if (sortOrder <= 18) return "C";
  if (sortOrder <= 24) return "D";
  if (sortOrder <= 30) return "E";
  if (sortOrder <= 36) return "F";
  if (sortOrder <= 45) return "G";
  return "A";
}

async function maybeAutoRotateBatch(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: currents } = await supabase
    .from("cycle_batches")
    .select("batch, device_start, device_end, started_at")
    .eq("is_current", true);

  if (!currents || currents.length === 0) return null;

  let current = currents[0];
  if (currents.length > 1) {
    currents.sort((a, b) =>
      new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime());
    current = currents[0];
    const staleBatches = currents.slice(1).map((b) => b.batch);
    await supabase
      .from("cycle_batches")
      .update({ is_current: false, ended_at: new Date().toISOString() })
      .in("batch", staleBatches);
  }

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("devices")
    .select("device_id", { count: "exact", head: true })
    .gte("last_seen_at", fiveMinAgo)
    .gte("sort_order", current.device_start)
    .lte("sort_order", current.device_end);

  if (count && count > 0) return null;

  const currentIdx = BATCH_ORDER.indexOf(current.batch);
  const isLastBatch = currentIdx === BATCH_ORDER.length - 1;
  const nextBatch = BATCH_ORDER[(currentIdx + 1) % BATCH_ORDER.length];

  const now = new Date();
  const nowIso = now.toISOString();
  const startedAt = current.started_at ?? nowIso;
  const durationSeconds = Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000);

  const { data: counter } = await supabase
    .from("cycle_counter")
    .select("current_cycle, rotation_number, cycle_date, round_started_at")
    .eq("id", 1)
    .maybeSingle();

  const completedCycleNumber = counter?.current_cycle ?? 1;
  const currentRotation = counter?.rotation_number ?? 1;
  const cycleDate = counter?.cycle_date ?? null;
  const todayDate = todayDateString();

  let nextCycleNumber: number;
  let nextRotation: number;
  let newRoundStartedAt = counter?.round_started_at ?? nowIso;
  let newCycleDate = cycleDate;

  if (isLastBatch) {
    nextCycleNumber = 1;
    nextRotation = currentRotation >= TOTAL_ROTATIONS ? 1 : currentRotation + 1;
    if (cycleDate !== todayDate) {
      nextRotation = 1;
      newCycleDate = todayDate;
      newRoundStartedAt = nowIso;
    } else {
      newCycleDate = todayDate;
    }
  } else {
    nextCycleNumber = completedCycleNumber >= TOTAL_BATCHES ? 1 : completedCycleNumber + 1;
    nextRotation = currentRotation;
    if (cycleDate !== todayDate) {
      nextRotation = 1;
      nextCycleNumber = 1;
      newCycleDate = todayDate;
      newRoundStartedAt = nowIso;
    }
  }

  await supabase.from("cycle_history").insert({
    cycle_number: completedCycleNumber,
    batch: current.batch,
    device_start: current.device_start,
    device_end: current.device_end,
    started_at: startedAt,
    ended_at: nowIso,
    duration_seconds: durationSeconds,
  });

  await supabase
    .from("cycle_counter")
    .update({
      current_cycle: nextCycleNumber,
      rotation_number: nextRotation,
      cycle_date: newCycleDate ?? todayDate,
      round_started_at: newRoundStartedAt,
      total_batches: TOTAL_BATCHES,
      updated_at: nowIso,
    })
    .eq("id", 1);

  await supabase
    .from("cycle_batches")
    .update({ is_current: false, ended_at: nowIso })
    .eq("is_current", true);

  await supabase
    .from("cycle_batches")
    .update({ is_current: true, started_at: nowIso, ended_at: null })
    .eq("batch", nextBatch);

  await supabase.from("devices").update({ batch_active: false }).neq("device_id", "");
  await supabase.from("devices").update({ batch_active: true }).eq("batch", nextBatch);

  return nextBatch;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    let { device_id, balance, wait_seconds, wait_time_text } = body;

    if (!device_id || typeof device_id !== "string") {
      return new Response(
        JSON.stringify({ error: "device_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (balance === undefined || balance === null || typeof balance !== "number") {
      return new Response(
        JSON.stringify({ error: "balance is required and must be a number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawWaitText = typeof wait_time_text === "string" ? wait_time_text.trim().toLowerCase() : "";
    const isFinishFlip = rawWaitText.includes("finish") && rawWaitText.includes("flip");
    const isSleeping = rawWaitText === "sleeping" || rawWaitText === "sleeping — no withdraw button";

    // wait_seconds can legitimately be 0 (meaning "Ready to claim now").
    // Only treat null/undefined/NaN as "no wait data". A 0 must be preserved.
    let waitSeconds: number | null =
      typeof wait_seconds === "number" && !isNaN(wait_seconds) && wait_seconds >= 0
        ? Math.round(wait_seconds)
        : null;
    let waitTimeText: string | null =
      typeof wait_time_text === "string" && wait_time_text.length > 0 ? wait_time_text : null;

    // "Sleeping" means no withdraw button found on the page — device is idle.
    // Clear the countdown so the dashboard doesn't show it as ready or counting down.
    if (isSleeping) {
      waitSeconds = null;
      waitTimeText = "Sleeping";
    }

    // "finish to flip" / "flip to finish" means the device is in a long cooldown.
    // Apply a 3-hour (10800s) cooldown automatically so get-cooldowns and the UI
    // both show a real countdown instead of an indefinite spinner.
    if (isFinishFlip) {
      waitSeconds = 3 * 60 * 60;
      waitTimeText = waitTimeText ?? "Finish to flip";
    }

    const nextClaimAt: string | null = (waitSeconds && waitSeconds > 0 && !isSleeping)
      ? new Date(Date.now() + waitSeconds * 1000).toISOString()
      : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayDate = todayDateString();
    const sortOrder = DEVICE_ORDER[device_id] ?? 999;

    const { data: existing } = await supabase
      .from("devices")
      .select("last_balance, today_earnings, earnings_date, lifetime_earnings, lifetime_withdrawn, peak_balance")
      .eq("device_id", device_id)
      .maybeSingle();

    // Detect earnings/withdrawal from balance change since last sync
    let earningsDelta = 0;
    let withdrawalAmount = 0;
    const previousBalance = existing?.last_balance ?? null;

    // A single sync can never add this much; such readings are page glitches (e.g. 0 -> 669).
    if (previousBalance !== null && balance - previousBalance > 10) {
      balance = previousBalance;
    }

    // Right after a withdrawal the page can briefly show the old balance again.
    // Treat that reading as the post-withdrawal zero so it is not counted as a claim.
    if (previousBalance !== null && previousBalance < 0.01 && balance > 0) {
      const bounceWindowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentWithdrawals } = await supabase
        .from("device_withdrawals")
        .select("previous_balance")
        .eq("device_id", device_id)
        .gte("detected_at", bounceWindowStart);
      const isBounceBack = (recentWithdrawals ?? []).some(
        (w) => Math.abs(Number(w.previous_balance) - balance) < 0.01
      );
      if (isBounceBack) balance = previousBalance;
    }

    if (existing && previousBalance !== null) {
      const delta = Math.round((balance - previousBalance) * 100) / 100;
      if (delta > 0.01) {
        earningsDelta = delta;
      } else if (delta < -0.01 && balance < 0.001) {
        // A drop to zero is usually a page glitch. Only a withdraw command
        // confirmed as executed counts as a real withdrawal.
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentExecAck } = await supabase
          .from("withdraw_command_acks")
          .select("command_id")
          .eq("device_id", device_id)
          .eq("status", "executed")
          .gte("reported_at", tenMinAgo)
          .limit(1)
          .maybeSingle();
        if (recentExecAck) {
          withdrawalAmount = Math.abs(delta);
        } else {
          balance = previousBalance;
        }
      } else if (delta <= -0.1) {
        withdrawalAmount = Math.abs(delta);
      }
    }

    const istDayStart = new Date(todayDate + "T00:00:00+05:30").toISOString();
    // Use the last balance report BEFORE today's IST start as the opening balance.
    // This fixes the issue where the first report of a new day already includes
    // earnings, causing today_earnings to compute as 0. If there's no prior report
    // (first ever day), fall back to the first report of today.
    const { data: prevDayClose } = await supabase
      .from("balance_reports")
      .select("balance")
      .eq("device_id", device_id)
      .lt("reported_at", istDayStart)
      .order("reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let openingBalance: number;
    if (prevDayClose) {
      openingBalance = Number(prevDayClose.balance);
    } else {
      const { data: firstReportToday } = await supabase
        .from("balance_reports")
        .select("balance")
        .eq("device_id", device_id)
        .gte("reported_at", istDayStart)
        .order("reported_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      openingBalance = firstReportToday ? Number(firstReportToday.balance) : balance;
    }

    // Sum all withdrawals detected today (IST) so we can add them back.
    // Without this, a withdrawal makes today_earnings drop to 0 because
    // (balance - openingBalance) goes negative and gets clamped. This
    // mirrors the daily_earnings view: earnings = (last - first) + withdrawals.
    const { data: todayWithdrawals } = await supabase
      .from("device_withdrawals")
      .select("withdrawal_amount")
      .eq("device_id", device_id)
      .gte("detected_at", istDayStart);
    const withdrawalsToday = (todayWithdrawals ?? []).reduce(
      (sum, w) => sum + Number(w.withdrawal_amount ?? 0), 0
    );

    const newTodayEarnings = Math.round(Math.max(0, (balance - openingBalance) + withdrawalsToday + withdrawalAmount) * 100) / 100;
    const newLifetimeEarnings = Math.round((balance + (existing?.lifetime_withdrawn ?? 0) + withdrawalAmount) * 100) / 100;
    const newLifetimeWithdrawn = Math.round(((existing?.lifetime_withdrawn ?? 0) + withdrawalAmount) * 100) / 100;
    const newPeakBalance = Math.max(existing?.peak_balance ?? 0, balance);
    const batch = batchForSortOrder(sortOrder);

    const { data: currentBatch } = await supabase
      .from("cycle_batches")
      .select("batch")
      .eq("is_current", true)
      .maybeSingle();
    let batchActive = currentBatch?.batch === batch;

    const rotatedTo = await maybeAutoRotateBatch(supabase);
    if (rotatedTo) {
      batchActive = rotatedTo === batch;
    }

    const { error: upsertError } = await supabase
      .from("devices")
      .upsert({
        device_id,
        last_balance: Math.round(balance * 100) / 100,
        last_seen_at: now.toISOString(),
        is_online: true,
        today_earnings: newTodayEarnings,
        earnings_date: todayDate,
        sort_order: sortOrder,
        batch,
        batch_active: batchActive,
        lifetime_earnings: newLifetimeEarnings,
        lifetime_withdrawn: newLifetimeWithdrawn,
        peak_balance: newPeakBalance,
        last_withdrawal_at: withdrawalAmount > 0 ? now.toISOString() : existing?.last_withdrawal_at ?? null,
        last_withdrawal_amount: withdrawalAmount > 0 ? withdrawalAmount : existing?.last_withdrawal_amount ?? null,
        wait_seconds: waitSeconds,
        wait_time_text: waitTimeText,
        next_claim_at: nextClaimAt,
        updated_at: now.toISOString(),
      }, { onConflict: "device_id" });

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: "Failed to upsert device" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("controller_heartbeats")
      .upsert({ source: "tampermonkey", last_seen_at: now.toISOString() }, { onConflict: "source" });

    // Only insert a balance report when the balance actually changed,
    // so the history drawer doesn't flood with identical entries.
    if (previousBalance === null || Math.abs(balance - previousBalance) > 0.001) {
      await supabase.from("balance_reports").insert({
        device_id,
        balance: Math.round(balance * 100) / 100,
        reported_at: now.toISOString(),
      });
    }

    if (earningsDelta > 0 && previousBalance !== null && earningsDelta <= 0.08) {
      // Deduplicate: skip if a claim was already recorded for this device
      // in the last 60 seconds with the same increase_amount. This prevents
      // the claims feed from flooding when balance oscillates (e.g. 0.02 →
      // 0.04 → 0.02 → 0.04) across rapid syncs.
      const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentClaim } = await supabase
        .from("balance_claims")
        .select("id")
        .eq("device_id", device_id)
        .eq("increase_amount", earningsDelta)
        .gte("created_at", sixtySecAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!recentClaim) {
        await supabase.from("balance_claims").insert({
          device_id,
          previous_balance: Math.round(previousBalance * 100) / 100,
          new_balance: Math.round(balance * 100) / 100,
          increase_amount: earningsDelta,
          claimed: false,
          created_at: now.toISOString(),
        });
      }
    }

    if (withdrawalAmount > 0 && previousBalance !== null) {
      // A withdrawal can arrive as several rapid syncs; see the merge check below.
      const thirtySecAgo = new Date(Date.now() - 30 * 1000).toISOString();
      const { data: recentWithdrawal } = await supabase
        .from("device_withdrawals")
        .select("id, new_balance, withdrawal_amount")
        .eq("device_id", device_id)
        .gte("detected_at", thirtySecAgo)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!recentWithdrawal) {
        await supabase.from("device_withdrawals").insert({
          device_id,
          previous_balance: Math.round(previousBalance * 100) / 100,
          new_balance: Math.round(balance * 100) / 100,
          withdrawal_amount: withdrawalAmount,
          detected_at: now.toISOString(),
        });
      } else if (Math.abs(Number(recentWithdrawal.new_balance) - previousBalance) < 0.01) {
        // Merge only a drop that continues the recorded withdrawal (e.g. 0.51 -> 0.16 -> 0).
        await supabase
          .from("device_withdrawals")
          .update({
            withdrawal_amount: Math.round((Number(recentWithdrawal.withdrawal_amount) + withdrawalAmount) * 100) / 100,
            new_balance: Math.round(balance * 100) / 100,
          })
          .eq("id", recentWithdrawal.id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        device_id,
        balance,
        batch,
        batch_active: batchActive,
        earnings_delta: earningsDelta,
        withdrawal_amount: withdrawalAmount,
        today_earnings: newTodayEarnings,
        lifetime_earnings: newLifetimeEarnings,
        lifetime_withdrawn: newLifetimeWithdrawn,
        peak_balance: newPeakBalance,
        wait_seconds: waitSeconds,
        wait_time_text: waitTimeText,
        next_claim_at: nextClaimAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
