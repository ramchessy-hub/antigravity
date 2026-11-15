import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TG_BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const OFFLINE_THRESHOLD_HOURS = 6.2;

async function sendTelegramAlert(message: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase
      .from("device_offline_settings")
      .select("alerts_enabled")
      .eq("id", 1)
      .maybeSingle();
    const alertsEnabled = settings?.alerts_enabled ?? true;

    const now = Date.now();
    const thresholdMs = OFFLINE_THRESHOLD_HOURS * 60 * 60 * 1000;

    const { data: devices } = await supabase
      .from("devices")
      .select("device_id, display_name, last_seen_at");

    if (!devices || devices.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, checked: 0, alerts_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const offlineDevices = devices.filter((d) => {
      if (!d.last_seen_at) return true;
      return now - new Date(d.last_seen_at).getTime() >= thresholdMs;
    });

    if (offlineDevices.length === 0) {
      const { data: existing } = await supabase
        .from("device_offline_alerts")
        .select("device_id");

      if (existing && existing.length > 0) {
        await supabase.from("device_offline_alerts").delete().neq("device_id", "___none___");
      }

      return new Response(
        JSON.stringify({ ok: true, checked: devices.length, alerts_sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let alertsSent = 0;

    for (const device of offlineDevices) {
      const hours = device.last_seen_at
        ? ((now - new Date(device.last_seen_at).getTime()) / (60 * 60 * 1000))
        : 999;

      const { data: existing } = await supabase
        .from("device_offline_alerts")
        .select("id, last_reminder_at")
        .eq("device_id", device.device_id)
        .maybeSingle();

      const shouldSend = alertsEnabled;

      if (!existing) {
        if (shouldSend) {
          const message =
            `🚨 *DEVICE OFFLINE ALERT*\n\n` +
            `📱 *Device:* ${device.display_name ?? device.device_id}\n` +
            `⏰ *Offline for:* ${hours.toFixed(1)} hours\n` +
            `🕐 *Last seen:* ${device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "Never"}\n` +
            `⚠️ *Threshold:* ${OFFLINE_THRESHOLD_HOURS}h\n` +
            `🔁 Reminders sent every 2 minutes`;

          await sendTelegramAlert(message);
          alertsSent++;
        }

        await supabase.from("device_offline_alerts").insert({
          device_id: device.device_id,
          alerted_at: new Date().toISOString(),
          last_reminder_at: shouldSend ? new Date().toISOString() : null,
        });
      } else {
        if (!shouldSend) continue;

        const lastReminder = existing.last_reminder_at
          ? new Date(existing.last_reminder_at).getTime()
          : 0;
        const twoMinMs = 2 * 60 * 1000;

        if (now - lastReminder >= twoMinMs) {
          const message =
            `🔁 *DEVICE STILL OFFLINE*\n\n` +
            `📱 *Device:* ${device.display_name ?? device.device_id}\n` +
            `⏰ *Offline for:* ${hours.toFixed(1)} hours\n` +
            `🕐 *Last reminder:* ${existing.last_reminder_at ? new Date(existing.last_reminder_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "None"}`;

          await sendTelegramAlert(message);
          alertsSent++;

          await supabase
            .from("device_offline_alerts")
            .update({ last_reminder_at: new Date().toISOString() })
            .eq("device_id", device.device_id);
        }
      }
    }

    const offlineIds = new Set(offlineDevices.map((d) => d.device_id));
    const allAlerts = await supabase.from("device_offline_alerts").select("device_id");
    if (allAlerts.data) {
      const toDelete = allAlerts.data.filter((a) => !offlineIds.has(a.device_id));
      for (const row of toDelete) {
        await supabase.from("device_offline_alerts").delete().eq("device_id", row.device_id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: devices.length,
        offline_count: offlineDevices.length,
        alerts_sent: alertsSent,
        alerts_enabled: alertsEnabled,
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
