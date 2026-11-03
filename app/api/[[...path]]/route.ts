import { env } from "cloudflare:workers";
import { handle } from "@/lib/api";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handle(request, env as any);
}
export const POST = GET;
export const PUT = GET;
export const DELETE = GET;
