import { parseRange, PART_SIZE, MAX_VIDEO_SIZE } from "./video-utils";
type Env = { DB: D1Database; BUCKET: R2Bucket };
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const now = () => Math.floor(Date.now() / 1000);
const random = () => crypto.randomUUID();
const hex = (data: ArrayBuffer) =>
  Array.from(new Uint8Array(data), (x) => x.toString(16).padStart(2, "0")).join(
    "",
  );
const hash = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
function safeEqual(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 20000)
    throw new ApiError("Formulário muito grande.");
  const reader = req.body?.getReader();
  let text = "",
    size = 0;
  if (reader) {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20000) {
        await reader.cancel();
        throw new ApiError("Formulário muito grande.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("Dados inválidos.");
  }
}
function field(x: unknown, min: number, max: number, label: string) {
  if (typeof x !== "string" || x.trim().length < min || x.trim().length > max)
    throw new ApiError(`${label}: use de ${min} a ${max} caracteres.`);
  return x.trim();
}
async function rate(env: Env, key: string, max: number, window: number) {
  const bucket = Math.floor(now() / window);
  const row = await env.DB.prepare(
    "INSERT INTO limits (key,count,expiresAt) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(`${key}:${bucket}`, now() + window * 2)
    .first<{ count: number }>();
  if (row && row.count > max)
    throw new ApiError(
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      429,
    );
}
async function user(req: Request, env: Env, required = true) {
  const token =
    req.headers.get("authorization")?.match(/^Bearer ([a-f0-9-]{72})$/)?.[1] ||
    req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("mostra_session="))
      ?.slice(15);
  if (!token) {
    if (required) throw new ApiError("Entre na sua conta para continuar.", 401);
    return null;
  }
  const u = await env.DB.prepare(
    "SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON u.id=s.userId WHERE s.token=? AND s.expiresAt>?",
  )
    .bind(await hash(token), now())
    .first<{ id: string; name: string; email: string }>();
  if (!u && required)
    throw new ApiError("Sua sessão expirou. Entre novamente.", 401);
  return u;
}
function cookie(req: Request, token: string, age = 2592000) {
  return `mostra_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function loginResponse(
  req: Request,
  env: Env,
  u: { id: string; name: string; email: string },
) {
  const token = random() + random();
  await env.DB.prepare(
    "INSERT INTO sessions (token,userId,expiresAt) VALUES (?,?,?)",
  )
    .bind(await hash(token), u.id, now() + 2592000)
    .run();
  return json(
    {
      user: u,
      ...(req.headers.get("origin") &&
      req.headers.get("origin") !== new URL(req.url).origin
        ? { sessionToken: token }
        : {}),
    },
    200,
    { "Set-Cookie": cookie(req, token) },
  );
}
const publicColumns =
  "f.id,f.title,f.synopsis,f.team,f.members,f.category,f.duration,f.size,f.createdAt";
async function owned(req: Request, env: Env, id: string) {
  const u = await user(req, env);
  const f = await env.DB.prepare("SELECT * FROM films WHERE id=? AND userId=?")
    .bind(id, u!.id)
    .first<any>();
  if (!f) throw new ApiError("Envio não encontrado.", 404);
  return f;
}
async function list(env: Env, where = "f.status='ready'", params: any[] = []) {
  const { results } = await env.DB.prepare(
    `SELECT ${publicColumns},COUNT(r.score) AS votes,ROUND(AVG(r.score),1) AS average FROM films f LEFT JOIN ratings r ON r.filmId=f.id WHERE ${where} GROUP BY f.id ORDER BY f.createdAt DESC LIMIT 300`,
  )
    .bind(...params)
    .all();
  return results.map((film: any) => ({
    ...film,
    members: film.members ? JSON.parse(film.members) : [],
  }));
}
async function handleRequest(req: Request, env: Env): Promise<Response> {
  try {
    const path =
      new URL(req.url).pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
    if (!env.DB || !env.BUCKET)
      throw new ApiError("Armazenamento ainda não configurado.", 503);
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.headers.get("origin");
      if (origin !== new URL(req.url).origin && !allowedFrontend(origin))
        throw new ApiError("Origem da requisição inválida.", 403);
    }
    const ip = req.headers.get("cf-connecting-ip") || "local";
    if (path === "/me" && req.method === "GET")
      return json({
        user: await user(req, env, false),
        maxVideoSize: MAX_VIDEO_SIZE,
        partSize: PART_SIZE,
      });
    if (path === "/register" && req.method === "POST") {
      await rate(env, "register:" + (await hash(ip)), 200, 3600);
      const b = await body(req);
      const name = field(b.name, 2, 80, "Nome");
      const email = field(b.email, 5, 254, "E-mail").toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new ApiError("Informe um e-mail válido.");
      if (
        typeof b.password !== "string" ||
        b.password.length < 10 ||
        b.password.length > 128
      )
        throw new ApiError("Use uma senha de 10 a 128 caracteres.");
      const salt = random();
      const u = { id: random(), name, email };
      const pass = await passwordHash(b.password, salt);
      try {
        await env.DB.prepare(
          "INSERT INTO users (id,name,email,password,createdAt) VALUES (?,?,?,?,?)",
        )
          .bind(u.id, name, email, `${salt}:${pass}`, now())
          .run();
      } catch (e) {
        if (String(e).includes("UNIQUE"))
          throw new ApiError(
            "Não foi possível cadastrar esse e-mail. Tente entrar com sua conta.",
            409,
          );
        throw e;
      }
      return loginResponse(req, env, u);
    }
    if (path === "/login" && req.method === "POST") {
      await rate(env, "login:" + (await hash(ip)), 200, 900);
      const b = await body(req);
      const email = field(b.email, 5, 254, "E-mail").toLowerCase();
      await rate(env, "login-email:" + (await hash(ip + email)), 10, 900);
      if (typeof b.password !== "string" || b.password.length > 128)
        throw new ApiError("E-mail ou senha incorretos.", 401);
      const u = await env.DB.prepare(
        "SELECT id,name,email,password FROM users WHERE email=?",
      )
        .bind(email)
        .first<any>();
      const [salt, expected] = (u?.password || "empty:" + "0".repeat(64)).split(
        ":",
      );
      const actual = await passwordHash(b.password, salt);
      if (!u || !safeEqual(expected, actual))
        throw new ApiError("E-mail ou senha incorretos.", 401);
      return loginResponse(req, env, {
        id: u.id,
        name: u.name,
        email: u.email,
      });
    }
    if (path === "/logout" && req.method === "POST") {
      const t =
        req.headers
          .get("authorization")
          ?.match(/^Bearer ([a-f0-9-]{72})$/)?.[1] ||
        req.headers
          .get("cookie")
          ?.match(/(?:^|;\s*)mostra_session=([^;]+)/)?.[1];
      if (t)
        await env.DB.prepare("DELETE FROM sessions WHERE token=?")
          .bind(await hash(t))
          .run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
    }
    if (path === "/films" && req.method === "GET")
      return json({ films: await list(env) });
    if (path === "/my-films" && req.method === "GET") {
      const u = await user(req, env);
      const { results } = await env.DB.prepare(
        "SELECT id,title,status,size,createdAt FROM films WHERE userId=? ORDER BY createdAt DESC",
      )
        .bind(u!.id)
        .all();
      return json({ films: results });
    }
    if (path === "/uploads" && req.method === "POST") {
      const u = await user(req, env);
      await rate(env, "upload:" + u!.id, 10, 86400);
      const b = await body(req);
      const title = field(b.title, 3, 120, "Título"),
        synopsis = field(b.synopsis, 20, 2000, "Sinopse"),
        team = field(b.team, 2, 120, "Nome do grupo"),
        category = field(b.category, 2, 50, "Categoria"),
        filename = field(b.filename, 5, 255, "Arquivo"),
        fingerprint = field(b.fingerprint, 64, 64, "Identificação do arquivo");
      if (!/^[a-f0-9]{64}$/.test(fingerprint))
        throw new ApiError("Identificação do arquivo inválida.");
      if (!filename.toLowerCase().endsWith(".mp4") || b.type !== "video/mp4")
        throw new ApiError("Selecione um arquivo MP4.");
      if (
        !Number.isSafeInteger(b.size) ||
        b.size < 12 ||
        b.size > MAX_VIDEO_SIZE
      )
        throw new ApiError("O arquivo deve ter no máximo 50 GB.");
      if (!Number.isFinite(b.duration) || b.duration < 1 || b.duration > 86400)
        throw new ApiError(
          "Não foi possível ler a duração do vídeo. Exporte um MP4 compatível.",
        );
      if (b.publishConsent !== true)
        throw new ApiError("Confirme a autorização de publicação.");
      if (
        !Array.isArray(b.members) ||
        b.members.length < 2 ||
        b.members.length > 50
      )
        throw new ApiError("Adicione de 2 a 50 integrantes ao grupo.");
      const members = b.members.map((name: unknown) =>
        field(name, 3, 120, "Nome completo do integrante"),
      );
      const normalized = members.map((name: string) =>
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " "),
      );
      if (new Set(normalized).size !== members.length)
        throw new ApiError(
          "Há nomes repetidos na lista de integrantes. Informe cada aluno uma vez.",
        );
      const id = random(),
        key = `films/${u!.id}/${id}.mp4`;
      const upload = await env.BUCKET.createMultipartUpload(key, {
        httpMetadata: {
          contentType: "video/mp4",
          contentDisposition: "inline",
        },
      });
      try {
        const inserted = await env.DB.prepare(
          "INSERT INTO films (id,userId,title,synopsis,team,members,category,filename,fingerprint,size,duration,status,objectKey,uploadId,createdAt) SELECT ?,?,?,?,?,?,?,?,?,?,?, 'uploading',?,?,? WHERE COALESCE((SELECT SUM(size) FROM films WHERE status='ready' OR (status='uploading' AND createdAt>?)),0)+?<=? RETURNING id",
        )
          .bind(
            id,
            u!.id,
            title,
            synopsis,
            team,
            JSON.stringify(members),
            category,
            filename,
            fingerprint,
            b.size,
            Math.round(b.duration),
            key,
            upload.uploadId,
            now(),
            now() - 6 * 86400,
            b.size,
            500 * 1024 ** 3,
          )
          .first();
        if (!inserted)
          throw new ApiError(
            "A mostra atingiu sua capacidade de armazenamento. Fale com a organização.",
            409,
          );
      } catch (e) {
        await upload.abort();
        throw e;
      }
      return json({ id, partSize: PART_SIZE }, 201);
    }
    let m = path.match(/^\/uploads\/([a-f0-9-]+)(?:\/(parts\/\d+|complete))?$/);
    if (m) {
      const f = await owned(req, env, m[1]);
      const action = m[2];
      if (req.method === "GET" && !action) {
        const { results } = await env.DB.prepare(
          "SELECT partNumber,etag,size FROM parts WHERE filmId=? ORDER BY partNumber",
        )
          .bind(f.id)
          .all();
        return json({
          id: f.id,
          status: f.status,
          size: f.size,
          filename: f.filename,
          fingerprint: f.fingerprint,
          title: f.title,
          synopsis: f.synopsis,
          team: f.team,
          members: f.members ? JSON.parse(f.members) : [],
          category: f.category,
          duration: f.duration,
          parts: results,
          partSize: PART_SIZE,
        });
      }
      if (req.method === "DELETE" && !action) {
        if (f.status !== "uploading")
          throw new ApiError("Este envio já foi finalizado.", 409);
        try {
          await env.BUCKET.resumeMultipartUpload(
            f.objectKey,
            f.uploadId,
          ).abort();
        } catch {}
        await env.DB.batch([
          env.DB.prepare("DELETE FROM parts WHERE filmId=?").bind(f.id),
          env.DB.prepare("UPDATE films SET status='cancelled' WHERE id=?").bind(
            f.id,
          ),
        ]);
        return json({ ok: true });
      }
      if (
        f.status === "ready" &&
        action === "complete" &&
        req.method === "POST"
      )
        return json({ id: f.id });
      if (f.status !== "uploading") throw new ApiError("Envio encerrado.", 409);
      if (f.createdAt < now() - 6 * 86400)
        throw new ApiError("O envio expirou. Cancele e inicie novamente.", 410);
      if (action?.startsWith("parts/") && req.method === "PUT") {
        const partNumber = Number(action.split("/")[1]),
          count = Math.ceil(f.size / PART_SIZE);
        if (
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > count
        )
          throw new ApiError("Parte inválida.");
        const expected =
          partNumber === count ? f.size - (count - 1) * PART_SIZE : PART_SIZE;
        if (Number(req.headers.get("content-length")) !== expected)
          throw new ApiError("Tamanho da parte inválido.");
        const data = await req.arrayBuffer();
        if (data.byteLength !== expected)
          throw new ApiError("Parte incompleta.");
        if (
          partNumber === 1 &&
          new TextDecoder().decode(data.slice(4, 8)) !== "ftyp"
        )
          throw new ApiError("Este arquivo não contém um MP4 válido.");
        const part = await env.BUCKET.resumeMultipartUpload(
          f.objectKey,
          f.uploadId,
        ).uploadPart(partNumber, data);
        await env.DB.prepare(
          "INSERT INTO parts (filmId,partNumber,etag,size) VALUES (?,?,?,?) ON CONFLICT(filmId,partNumber) DO UPDATE SET etag=excluded.etag,size=excluded.size",
        )
          .bind(f.id, part.partNumber, part.etag, data.byteLength)
          .run();
        return json({ partNumber: part.partNumber, etag: part.etag });
      }
      if (action === "complete" && req.method === "POST") {
        const { results } = await env.DB.prepare(
          "SELECT partNumber,etag,size FROM parts WHERE filmId=? ORDER BY partNumber",
        )
          .bind(f.id)
          .all<any>();
        const count = Math.ceil(f.size / PART_SIZE);
        if (
          results.length !== count ||
          results.some((p: any, i: number) => p.partNumber !== i + 1) ||
          results.reduce((s: number, p: any) => s + p.size, 0) !== f.size
        )
          throw new ApiError("Ainda faltam partes do vídeo. Retome o envio.");
        const existing = await env.BUCKET.head(f.objectKey);
        if (!existing)
          await env.BUCKET.resumeMultipartUpload(
            f.objectKey,
            f.uploadId,
          ).complete(
            results.map((p: any) => ({
              partNumber: p.partNumber,
              etag: p.etag,
            })),
          );
        const object = await env.BUCKET.head(f.objectKey);
        if (!object || object.size !== f.size)
          throw new ApiError(
            "Não foi possível validar o arquivo recebido.",
            409,
          );
        await env.DB.prepare("UPDATE films SET status='ready' WHERE id=?")
          .bind(f.id)
          .run();
        return json({ id: f.id });
      }
    }
    m = path.match(/^\/films\/([a-f0-9-]+)(?:\/(media|rating))?$/);
    if (m) {
      const id = m[1],
        action = m[2];
      const f = await env.DB.prepare(
        "SELECT id,userId,objectKey FROM films WHERE id=? AND status='ready'",
      )
        .bind(id)
        .first<any>();
      if (!f) throw new ApiError("Documentário não encontrado.", 404);
      if (!action && req.method === "GET") {
        const u = await user(req, env, false);
        const rating = u
          ? await env.DB.prepare(
              "SELECT score FROM ratings WHERE filmId=? AND userId=?",
            )
              .bind(id, u.id)
              .first<any>()
          : null;
        return json({
          film: (await list(env, "f.status='ready' AND f.id=?", [id]))[0],
          myScore: rating?.score ?? null,
          isOwner: u?.id === f.userId,
        });
      }
      if (action === "rating" && req.method === "POST") {
        const u = await user(req, env);
        if (u!.id === f.userId)
          throw new ApiError(
            "Você não pode avaliar seu próprio documentário.",
            403,
          );
        await rate(env, "rating:" + u!.id, 120, 3600);
        const b = await body(req);
        if (!Number.isInteger(b.score) || b.score < 0 || b.score > 10)
          throw new ApiError("Escolha uma nota inteira de 0 a 10.");
        await env.DB.prepare(
          "INSERT INTO ratings (filmId,userId,score,updatedAt) VALUES (?,?,?,?) ON CONFLICT(filmId,userId) DO UPDATE SET score=excluded.score,updatedAt=excluded.updatedAt",
        )
          .bind(id, u!.id, b.score, now())
          .run();
        return json({ ok: true });
      }
      if (action === "media" && req.method === "GET") {
        const head = await env.BUCKET.head(f.objectKey);
        if (!head) throw new ApiError("Arquivo indisponível.", 404);
        const range = parseRange(req.headers.get("range"), head.size);
        if (range === "invalid")
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${head.size}` },
          });
        const obj = await env.BUCKET.get(
          f.objectKey,
          range ? { range } : undefined,
        );
        if (!obj) throw new ApiError("Arquivo indisponível.", 404);
        const headers: Record<string, string> = {
          "Content-Type": "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Disposition": "inline",
          "Cache-Control": "public,max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Content-Length": String(range ? range.length : head.size),
        };
        if (range)
          headers["Content-Range"] =
            `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`;
        return new Response(obj.body, { status: range ? 206 : 200, headers });
      }
    }
    throw new ApiError("Página não encontrada.", 404);
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("API error", e instanceof Error ? e.message : "unknown");
    return json({ error: "Não foi possível concluir. Tente novamente." }, 500);
  }
}

// Explicit origins only: no wildcard subdomains, no credentialed CORS.
const FRONTEND_ORIGINS = new Set([
  "https://mostra-donaduzzi.vercel.app",
  "http://127.0.0.1:5184",
]);
function allowedFrontend(origin: string | null) {
  return !!origin && FRONTEND_ORIGINS.has(origin);
}
export async function handle(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get("origin");
  const cross = !!origin && origin !== new URL(req.url).origin;
  if (cross && !allowedFrontend(origin))
    return json({ error: "Origem da requisição inválida." }, 403);
  if (req.method === "OPTIONS") {
    if (!allowedFrontend(origin))
      return json({ error: "Origem da requisição inválida." }, 403);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin!,
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
  }
  const response = await handleRequest(req, env);
  if (cross && allowedFrontend(origin)) {
    const h = new Headers(response.headers);
    h.set("Access-Control-Allow-Origin", origin!);
    h.append("Vary", "Origin");
    h.delete("Set-Cookie");
    return new Response(response.body, { status: response.status, headers: h });
  }
  return response;
}
