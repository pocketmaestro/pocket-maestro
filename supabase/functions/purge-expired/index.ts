// Deletes expired playing-test clips: the sound file first (Storage API), then the row.
// Runs on a schedule (hourly). Uses the service role key, which never leaves the server.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Only the scheduler may call this.
  if (req.headers.get("authorization") !== `Bearer ${Deno.env.get("PURGE_SECRET")}`) {
    return new Response("forbidden", { status: 403 });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: expired, error } = await db
    .from("playing_tests").select("id, audio_path").lt("delete_after", new Date().toISOString()).limit(500);
  if (error) return new Response(error.message, { status: 500 });
  if (!expired?.length) return Response.json({ deleted: 0 });

  const { error: fileErr } = await db.storage.from("playing-tests").remove(expired.map((r) => r.audio_path));
  if (fileErr) return new Response(fileErr.message, { status: 500 }); // keep rows so we retry next hour
  const { error: rowErr } = await db.from("playing_tests").delete().in("id", expired.map((r) => r.id));
  if (rowErr) return new Response(rowErr.message, { status: 500 });
  return Response.json({ deleted: expired.length });
});
