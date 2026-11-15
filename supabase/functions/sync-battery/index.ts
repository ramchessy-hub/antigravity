import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const batteryPercent = Number(body.battery_percent);
    const isCharging = Boolean(body.is_charging);
    const deviceId = String(body.device_id || "laptop");

    // GPU temperature (existing field)
    const temperatureC = body.temperature_c !== undefined && body.temperature_c !== null
      ? Number(body.temperature_c)
      : null;

    // CPU temperature (new field, also accepts cpu_temp as alias)
    const cpuTemperatureC = body.cpu_temperature_c !== undefined && body.cpu_temperature_c !== null
      ? Number(body.cpu_temperature_c)
      : body.cpu_temp !== undefined && body.cpu_temp !== null
        ? Number(body.cpu_temp)
        : null;

    const heatStatus = typeof body.heat_status === "string"
      ? body.heat_status
      : (typeof body.device_heat === "string" ? body.device_heat : "cool");

    if (isNaN(batteryPercent) || batteryPercent < 0 || batteryPercent > 100) {
      return new Response(JSON.stringify({ error: "battery_percent must be 0-100" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("battery_reports").insert({
      device_id: deviceId,
      battery_percent: Math.round(batteryPercent),
      is_charging: isCharging,
      temperature_c: temperatureC,
      cpu_temperature_c: cpuTemperatureC,
      heat_status: heatStatus,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
