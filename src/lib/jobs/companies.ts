/**
 * Company boards Nod reads directly from each employer's ATS. Every token was
 * checked against the public posting APIs (see scripts/check-boards.ts).
 */
export type Board = {
  source: "greenhouse" | "lever" | "ashby";
  token: string;
  name: string;
};

const gh = (token: string, name: string): Board => ({ source: "greenhouse", token, name });
const lv = (token: string, name: string): Board => ({ source: "lever", token, name });
const ab = (token: string, name: string): Board => ({ source: "ashby", token, name });

export const BOARDS: Board[] = [
  // Greenhouse
  gh("monzo", "Monzo"),
  gh("gocardless", "GoCardless"),
  gh("deliveroo", "Deliveroo"),
  gh("wise", "Wise"),
  gh("tide", "Tide"),
  gh("graphcore", "Graphcore"),
  gh("gymshark", "Gymshark"),
  gh("intercom", "Intercom"),
  gh("cloudflare", "Cloudflare"),
  gh("stripe", "Stripe"),
  gh("airbnb", "Airbnb"),
  gh("figma", "Figma"),
  gh("discord", "Discord"),
  gh("databricks", "Databricks"),
  gh("gitlab", "GitLab"),
  gh("robinhood", "Robinhood"),
  gh("coinbase", "Coinbase"),
  gh("dropbox", "Dropbox"),
  gh("reddit", "Reddit"),
  gh("pinterest", "Pinterest"),
  gh("lyft", "Lyft"),
  gh("instacart", "Instacart"),
  gh("asana", "Asana"),
  gh("twilio", "Twilio"),
  gh("duolingo", "Duolingo"),
  gh("elastic", "Elastic"),
  gh("mongodb", "MongoDB"),
  gh("datadog", "Datadog"),
  gh("okta", "Okta"),
  gh("samsara", "Samsara"),
  gh("brex", "Brex"),
  gh("gusto", "Gusto"),
  gh("airtable", "Airtable"),
  gh("anthropic", "Anthropic"),
  gh("scaleai", "Scale AI"),
  gh("vercel", "Vercel"),
  gh("affirm", "Affirm"),
  gh("chime", "Chime"),
  gh("squarespace", "Squarespace"),
  gh("zscaler", "Zscaler"),
  gh("canonical", "Canonical"),
  // Lever
  lv("spotify", "Spotify"),
  lv("zopa", "Zopa"),
  lv("matillion", "Matillion"),
  lv("binance", "Binance"),
  lv("outreach", "Outreach"),
  lv("nium", "Nium"),
  lv("pipedrive", "Pipedrive"),
  // Ashby
  ab("linear", "Linear"),
  ab("cursor", "Cursor"),
  ab("supabase", "Supabase"),
  ab("posthog", "PostHog"),
  ab("zapier", "Zapier"),
  ab("granola", "Granola"),
  ab("incident", "incident.io"),
  ab("multiverse", "Multiverse"),
  ab("hex", "Hex"),
  ab("anyscale", "Anyscale"),
  ab("modal", "Modal"),
  ab("photoroom", "Photoroom"),
  ab("writer", "Writer"),
];
