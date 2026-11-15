import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const WALLET_ADDRESS = "J1n3prFCVFdakCNS1y2gW1WDFS4wZnc4dAr1swXTkBTS";
const TG_BOT_TOKEN = Deno.env.get("TG_BOT_TOKEN")!;
const TG_CHAT_ID = Deno.env.get("TG_CHAT_ID")!;
const ALERT_THRESHOLD_USD = 100;

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function getSOLBalance(address: string): Promise<number> {
  const resp = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [address],
    }),
  });
  const data = await resp.json();
  // Balance is in lamports (1 SOL = 1,000,000,000 lamports)
  return (data?.result?.value ?? 0) / 1_000_000_000;
}

async function getTokenBalance(address: string, mint: string): Promise<number> {
  const resp = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        address,
        { mint: mint },
        { encoding: "jsonParsed" },
      ],
    }),
  });
  const data = await resp.json();
  const accounts = data?.result?.value ?? [];
  let total = 0;
  for (const account of accounts) {
    const amount = account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
    if (amount && typeof amount === "number") {
      total += amount;
    }
  }
  return total;
}

async function getSOLPriceUSD(): Promise<number> {
  try {
    const resp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await resp.json();
    return data?.solana?.usd ?? 0;
  } catch {
    return 0;
  }
}

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

    const solBalance = await getSOLBalance(WALLET_ADDRESS);
    const usdcBalance = await getTokenBalance(WALLET_ADDRESS, USDC_MINT);
    const solPrice = await getSOLPriceUSD();

    const solUsdValue = solBalance * solPrice;
    const totalUsdValue = Math.round((solUsdValue + usdcBalance) * 100) / 100;

    const { data: settings } = await supabase
      .from("solana_wallet_settings")
      .select("alerts_enabled")
      .eq("id", 1)
      .maybeSingle();
    const alertsEnabled = settings?.alerts_enabled ?? true;
    const alertTriggered = alertsEnabled && totalUsdValue > ALERT_THRESHOLD_USD;

    const { error: insertError } = await supabase.from("solana_wallet_checks").insert({
      wallet_address: WALLET_ADDRESS,
      sol_balance: Math.round(solBalance * 10000) / 10000,
      usdc_balance: Math.round(usdcBalance * 100) / 100,
      total_usd_value: totalUsdValue,
      sol_price_usd: solPrice,
      alert_triggered: alertTriggered,
      checked_at: new Date().toISOString(),
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to store check result" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (usdcBalance >= ALERT_THRESHOLD_USD) {
      // Wallet threshold met — send wallet alert only.
      if (alertTriggered) {
        const message =
          `🚨 *Solana Wallet Alert*\n\n` +
          `💰 *Total Value:* ${totalUsdValue.toFixed(2)}\n` +
          `🔵 *SOL:* ${solBalance.toFixed(4)} (${(solUsdValue).toFixed(2)})\n` +
          `💵 *USDC:* ${usdcBalance.toFixed(2)}\n` +
          `📈 *SOL Price:* ${solPrice.toFixed(2)}\n` +
          `📍 *Wallet:* \`${WALLET_ADDRESS}\`\n` +
          `⏰ *Checked:* ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`;

        await sendTelegramAlert(message);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        wallet: WALLET_ADDRESS,
        sol_balance: solBalance,
        usdc_balance: usdcBalance,
        sol_price_usd: solPrice,
        total_usd_value: totalUsdValue,
        alert_triggered: alertTriggered,
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
