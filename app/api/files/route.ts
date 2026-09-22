export const dynamic = "force-static";

export async function GET(request: Request) {
  if (process.env.PAPERY_STATIC_BUILD === "1") return new Response("Not available", { status: 404 });
  const { env } = await import("cloudflare:workers");
  const deviceId = request.headers.get("x-papery-device")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "demo-device";
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith(`${deviceId}/`)) return new Response("无权访问", { status: 403 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("文件不存在", { status: 404 });
  const headers = new Headers();
  if(object.httpMetadata?.contentType)headers.set("content-type",object.httpMetadata.contentType);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body as unknown as ReadableStream<Uint8Array>, { headers });
}

export async function POST(request: Request) {
  if (process.env.PAPERY_STATIC_BUILD === "1") return Response.json({ error: "Not available" }, { status: 404 });
  const { env } = await import("cloudflare:workers");
  const deviceId = request.headers.get("x-papery-device")?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "demo-device";
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择文件" }, { status: 400 });
  const format = file.name.split(".").pop()?.toLowerCase();
  if (!format || !["txt", "epub", "pdf"].includes(format)) return Response.json({ error: "仅支持 TXT、EPUB 和 PDF" }, { status: 415 });
  const key = `${deviceId}/${crypto.randomUUID()}-${file.name.replace(/[^\p{L}\p{N}._-]/gu, "-")}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { originalName: file.name } });
  return Response.json({ key, name: file.name, size: file.size, format: format.toUpperCase() });
}