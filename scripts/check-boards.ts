/**
 * Checks candidate company board tokens against the public Greenhouse, Lever
 * and Ashby posting APIs and prints the ones that respond with open jobs.
 * Run: npx tsx scripts/check-boards.ts
 */
type Source = "greenhouse" | "lever" | "ashby";

const candidates: Record<Source, string[]> = {
  greenhouse: [
    "monzo", "gocardless", "skyscanner", "deliveroo", "octopusenergy", "darktrace",
    "cloudflare", "stripe", "airbnb", "figma", "discord", "databricks", "gitlab",
    "robinhood", "coinbase", "dropbox", "reddit", "pinterest", "lyft", "instacart",
    "asana", "twilio", "duolingo", "elastic", "mongodb", "datadog", "okta", "samsara",
    "brex", "gusto", "airtable", "intercom", "checkoutcom", "thoughtmachine", "starlingbank",
    "graphcore", "improbable", "wise", "transferwise", "tide", "paddle", "cleoai",
    "bumble", "oakbranch", "anthropic", "scaleai", "vercel", "hubspot", "affirm",
    "chime", "squarespace", "etsy", "grammarly", "zscaler", "nubank", "canonical",
    "gymshark", "trainline", "moneybox", "zilch", "marshmallow", "lendable", "unitary",
    "oxa", "faculty", "palantir", "cera", "multiverse", "babylonhealth", "mubi",
  ],
  lever: [
    "spotify", "palantir", "plaid", "mistral", "kraken", "attentive", "veeva", "zopa",
    "matillion", "tractable", "pleo", "multiverse", "cera", "ocadogroup", "netflix",
    "lever", "wealthsimple", "binance", "outreach", "dnb", "huggingface", "secondfront",
    "nium", "sennder", "trade-republic", "gorillas", "pipedrive", "bolt", "kpmg",
  ],
  ashby: [
    "openai", "notion", "linear", "ramp", "cursor", "synthesia", "elevenlabs", "deel",
    "supabase", "posthog", "replit", "perplexity", "cohere", "runway", "lovable", "n8n",
    "zapier", "snyk", "wayve", "cleo", "granola", "tldraw", "incident", "multiverse",
    "onfido", "monzo", "hex", "vanta", "mercury", "retool", "anyscale", "modal", "clay",
    "attio", "pydantic", "photoroom", "mistral", "huggingface", "helsing", "isomorphiclabs",
    "polyai", "lindy", "pennylane", "alan", "qonto", "dust", "writer", "harvey",
  ],
};

async function count(source: Source, token: string): Promise<number> {
  const url =
    source === "greenhouse"
      ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`
      : source === "lever"
        ? `https://api.lever.co/v0/postings/${token}?mode=json&limit=500`
        : `https://api.ashbyhq.com/posting-api/job-board/${token}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return -res.status;
    const data = await res.json();
    if (source === "greenhouse") return data.jobs?.length ?? 0;
    if (source === "lever") return Array.isArray(data) ? data.length : 0;
    return data.jobs?.length ?? 0;
  } catch {
    return -1;
  }
}

async function main() {
  const results: { source: Source; token: string; jobs: number }[] = [];
  for (const source of Object.keys(candidates) as Source[]) {
    const tokens = [...new Set(candidates[source])];
    const counts = await Promise.all(tokens.map((t) => count(source, t)));
    tokens.forEach((token, i) => results.push({ source, token, jobs: counts[i] }));
  }
  const ok = results.filter((r) => r.jobs > 0);
  console.log(JSON.stringify(ok));
  console.error(`valid boards: ${ok.length} / ${results.length}`);
  console.error(`total jobs: ${ok.reduce((s, r) => s + r.jobs, 0)}`);
}

main();
