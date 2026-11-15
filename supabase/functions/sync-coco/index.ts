import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Device-Token",
};

function todayDateString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
    const { device_id, bcd_balance } = body;
    const balance_text: string | null =
      typeof body.balance_text === "string" && body.balance_text
        ? body.balance_text
        : typeof bcd_balance === "number" || typeof bcd_balance === "string"
          ? `${bcd_balance} BCD`
          : null;

    if (!device_id || typeof device_id !== "string") {
      return new Response(
        JSON.stringify({ error: "device_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!balance_text) {
      return new Response(
        JSON.stringify({ error: "balance_text or bcd_balance is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const numericMatch = balance_text.match(/([0-9]+(?:\.[0-9]+)?)/);
    const balanceValue = numericMatch ? parseFloat(numericMatch[1]) : null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayDate = todayDateString();

    const { data: existing } = await supabase
      .from("coco_balances")
      .select("last_balance_value, today_change, change_date, lifetime_withdrawn, lifetime_earnings, peak_balance")
      .eq("device_id", device_id)
      .maybeSingle();

    // Detect withdrawal from balance drop since last sync
    let withdrawalAmount = 0;
    const previousValue = existing?.last_balance_value ?? null;

    if (balanceValue !== null && previousValue !== null) {
      const delta = Math.round((balanceValue - previousValue) * 100) / 100;
      if (delta < -0.01) {
        withdrawalAmount = Math.abs(delta);
      }
    }

    const istDayStart = new Date(todayDate + "T00:00:00+05:30").toISOString();
    const { data: firstReport } = await supabase
      .from("coco_balance_reports")
      .select("balance_value")
      .eq("device_id", device_id)
      .gte("reported_at", istDayStart)
      .order("reported_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Sum all withdrawals detected today (IST) so we can add them back.
    // Without this, a withdrawal makes today_change drop to 0 because
    // (balance - openingBalance) goes negative and gets clamped.
    const { data: todayWithdrawals } = await supabase
      .from("coco_balance_reports")
      .select("balance_value")
      .eq("device_id", device_id)
      .gte("reported_at", istDayStart)
      .order("reported_at", { ascending: true });

    // Track withdrawals by looking at negative jumps in the report history
    let withdrawalsToday = 0;
    if (todayWithdrawals && todayWithdrawals.length > 1) {
      for (let i = 1; i < todayWithdrawals.length; i++) {
        const prev = Number(todayWithdrawals[i - 1].balance_value ?? 0);
        const curr = Number(todayWithdrawals[i].balance_value ?? 0);
        const delta = Math.round((curr - prev) * 100) / 100;
        if (delta < -0.01) {
          withdrawalsToday += Math.abs(delta);
        }
      }
    }
    withdrawalsToday += withdrawalAmount;

    const openingBalance = firstReport?.balance_value ?? balanceValue ?? 0;
    const newTodayChange = balanceValue !== null
      ? Math.round(Math.max(0, (balanceValue - openingBalance) + withdrawalsToday) * 100) / 100
      : 0;
    const newLifetimeWithdrawn = Math.round(((existing?.lifetime_withdrawn ?? 0) + withdrawalAmount) * 100) / 100;
    const newLifetimeEarnings = balanceValue !== null
      ? Math.round((balanceValue + newLifetimeWithdrawn) * 100) / 100
      : (existing?.lifetime_earnings ?? 0);
    const newPeakBalance = Math.max(existing?.peak_balance ?? 0, balanceValue ?? 0);

    const { error: upsertError } = await supabase
      .from("coco_balances")
      .upsert({
        device_id,
        last_balance_text: balance_text,
        last_balance_value: balanceValue !== null ? Math.round(balanceValue * 100) / 100 : null,
        last_seen_at: now.toISOString(),
        is_online: true,
        today_change: newTodayChange,
        change_date: todayDate,
        lifetime_earnings: newLifetimeEarnings,
        lifetime_withdrawn: newLifetimeWithdrawn,
        peak_balance: newPeakBalance,
        last_withdrawal_at: withdrawalAmount > 0 ? now.toISOString() : existing?.last_withdrawal_at ?? null,
        last_withdrawal_amount: withdrawalAmount > 0 ? withdrawalAmount : existing?.last_withdrawal_amount ?? null,
      }, { onConflict: "device_id" });

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: "Failed to upsert coco balance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (balanceValue !== null) {
      await supabase.from("coco_balance_reports").insert({
        device_id,
        balance_value: Math.round(balanceValue * 100) / 100,
        reported_at: now.toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        device_id,
        balance_text,
        balance_value: balanceValue,
        today_change: newTodayChange,
        withdrawal_amount: withdrawalAmount,
        lifetime_earnings: newLifetimeEarnings,
        lifetime_withdrawn: newLifetimeWithdrawn,
        peak_balance: newPeakBalance,
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
