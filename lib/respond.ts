import { DISCLOSURE, meta } from "./data";

/** Every response carries the disclosure and what the data is (counts, latest observation, probe versions). */
export function respond(body: Record<string, unknown>, status = 200) {
  return Response.json({ disclosure: DISCLOSURE, data: meta(), ...body }, { status, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
