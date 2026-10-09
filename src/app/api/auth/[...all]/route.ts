import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

async function handler() {
  await getDb();
  return toNextJsHandler(getAuth());
}

export async function GET(request: Request) {
  return (await handler()).GET(request);
}

export async function POST(request: Request) {
  return (await handler()).POST(request);
}
