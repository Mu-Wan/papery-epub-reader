export const dynamic = "force-static";

function owner(request: Request) {
  return request.headers.get("x-papery-device")?.slice(0, 80) || "demo-device";
}

export async function GET(request: Request) {
  if (process.env.PAPERY_STATIC_BUILD === "1") return Response.json({ books: [], annotations: [], sessions: [], preferences: null });
  const { env } = await import("cloudflare:workers");
  const deviceId = owner(request);
  const [books, annotations, sessions, preferences] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM books WHERE device_id = ? ORDER BY updated_at DESC").bind(deviceId),
    env.DB.prepare("SELECT * FROM annotations WHERE device_id = ? ORDER BY updated_at DESC").bind(deviceId),
    env.DB.prepare("SELECT * FROM reading_sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT 500").bind(deviceId),
    env.DB.prepare("SELECT value FROM preferences WHERE device_id = ?").bind(deviceId),
  ]);
  return Response.json({
    books: books.results,
    annotations: annotations.results,
    sessions: sessions.results,
    preferences: preferences.results[0] ? JSON.parse(String((preferences.results[0] as {value:string}).value)) : null,
  });
}

export async function POST(request: Request) {
  if (process.env.PAPERY_STATIC_BUILD === "1") return Response.json({ ok: true });
  const { env } = await import("cloudflare:workers");
  const deviceId = owner(request);
  const body = await request.json() as Record<string, unknown>;
  const action = String(body.action || "");
  const now = Date.now();

  if (action === "save-book") {
    const book = body.book as Record<string, unknown>;
    const id = String(book.id || crypto.randomUUID());
    await env.DB.prepare(`INSERT INTO books (id, device_id, title, author, format, category, progress, current_location, file_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, category=excluded.category, progress=excluded.progress,
      current_location=excluded.current_location, file_key=COALESCE(excluded.file_key, books.file_key), updated_at=excluded.updated_at`)
      .bind(id, deviceId, String(book.title || "未命名书籍"), String(book.author || "未知作者"), String(book.format || "TXT"), String(book.category || "未分类"), Number(book.progress || 0), String(book.currentLocation || ""), book.fileKey ? String(book.fileKey) : null, now, now).run();
    return Response.json({ ok: true, id });
  }

  if (action === "save-annotation") {
    const note = body.annotation as Record<string, unknown>;
    const id = String(note.id || crypto.randomUUID());
    await env.DB.prepare(`INSERT INTO annotations (id, device_id, book_id, kind, quote, content, location, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET quote=excluded.quote, content=excluded.content, location=excluded.location, color=excluded.color, updated_at=excluded.updated_at`)
      .bind(id, deviceId, String(note.bookId || ""), String(note.kind || "note"), String(note.quote || ""), String(note.content || ""), String(note.location || ""), String(note.color || "orange"), now, now).run();
    return Response.json({ ok: true, id });
  }

  if (action === "delete-annotation") {
    const id = String(body.id || "");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await env.DB.prepare("DELETE FROM annotations WHERE id = ? AND device_id = ?").bind(id, deviceId).run();
    return Response.json({ ok: true });
  }

  if(action==="delete-book"){
    const id=String(body.id||"");
    if(!id)return Response.json({error:"id is required"},{status:400});
    const stored=await env.DB.prepare("SELECT file_key FROM books WHERE id = ? AND device_id = ?").bind(id,deviceId).first<{file_key:string|null}>();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM annotations WHERE book_id = ? AND device_id = ?").bind(id,deviceId),
      env.DB.prepare("DELETE FROM reading_sessions WHERE book_id = ? AND device_id = ?").bind(id,deviceId),
      env.DB.prepare("DELETE FROM books WHERE id = ? AND device_id = ?").bind(id,deviceId),
    ]);
    if(stored?.file_key)await env.BUCKET.delete(stored.file_key);
    return Response.json({ok:true});
  }

  if (action === "log-session") {
    const session = body.session as Record<string, unknown>;
    await env.DB.prepare("INSERT INTO reading_sessions (id, device_id, book_id, started_at, ended_at, duration_seconds, words_read) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), deviceId, String(session.bookId || ""), Number(session.startedAt || now), Number(session.endedAt || now), Number(session.durationSeconds || 0), Number(session.wordsRead || 0)).run();
    return Response.json({ ok: true });
  }

  if (action === "save-preferences") {
    const value = JSON.stringify(body.preferences || {});
    await env.DB.prepare("INSERT INTO preferences (device_id, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
      .bind(deviceId, value, now).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "不支持的操作" }, { status: 400 });
}