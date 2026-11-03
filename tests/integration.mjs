import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5183";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error("Execute apenas contra um ambiente local de testes.");
const origin = base;
let checks = 0;
async function call(
  path,
  { cookie, method = "GET", body, expected = 200, headers = {} } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body && !Buffer.isBuffer(body)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body: body
      ? Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body)
      : undefined,
  });
  const text = await r.text();
  assert.equal(r.status, expected, path + ": " + text);
  checks++;
  return {
    data: JSON.parse(text),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const run = randomUUID().slice(0, 8);
const pw = "test-only-" + randomUUID();
await call("/uploads", { method: "POST", body: {}, expected: 401 });
const student = await call("/register", {
  method: "POST",
  body: {
    name: "Equipe de teste local",
    email: `aluno-${run}@example.invalid`,
    password: pw,
  },
});
assert.equal(
  (await call("/me", { cookie: student.cookie })).data.user.name,
  "Equipe de teste local",
);
await call("/login", {
  method: "POST",
  body: { email: `aluno-${run}@example.invalid`, password: "senha-incorreta" },
  expected: 401,
});
const login = await call("/login", {
  method: "POST",
  body: { email: `aluno-${run}@example.invalid`, password: pw },
});
assert.ok(login.cookie);
const audience = await call("/register", {
  method: "POST",
  body: {
    name: "Público de teste",
    email: `publico-${run}@example.invalid`,
    password: pw,
  },
});
const fixture = await readFile(new URL("../work/flower.mp4", import.meta.url));
const padding = Buffer.alloc(17 * 1024 * 1024);
padding.writeUInt32BE(padding.length, 0);
padding.write("free", 4);
const film = Buffer.concat([fixture, padding]);
const metadata = {
  title: "Teste local — um olhar sobre a natureza",
  synopsis:
    "Filme de teste local para verificar envio, reprodução e avaliação.",
  team: "Grupo de teste local",
  members: ["Ana Silva de Teste", "Bruno Souza de Teste"],
  category: "Meio ambiente",
  filename: "flower-test.mp4",
  fingerprint: createHash("sha256").update(film).digest("hex"),
  type: "video/mp4",
  size: film.length,
  duration: 5,
  publishConsent: true,
};
await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: { ...metadata, size: 50 * 1024 ** 3 + 1 },
  expected: 400,
});
await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: { ...metadata, members: [] },
  expected: 400,
});
await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: { ...metadata, members: ["Ana Silva", "Ana Silva"] },
  expected: 400,
});
await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: { ...metadata, members: ["Ana Silva", ""] },
  expected: 400,
});
const upload = await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: metadata,
  expected: 201,
});
const id = upload.data.id,
  chunk = upload.data.partSize;
await call("/uploads/" + id, { cookie: audience.cookie, expected: 404 });
await call("/uploads/" + id + "/complete", {
  method: "POST",
  cookie: student.cookie,
  expected: 400,
});
await call("/uploads/" + id + "/parts/1", {
  method: "PUT",
  cookie: student.cookie,
  body: film.subarray(0, chunk),
});
const resumed = await call("/uploads/" + id, { cookie: student.cookie });
assert.equal(resumed.data.parts.length, 1);
assert.deepEqual(resumed.data.members, metadata.members);
assert.equal(resumed.data.parts[0].size, chunk);
await call("/uploads/" + id + "/parts/2", {
  method: "PUT",
  cookie: student.cookie,
  body: film.subarray(chunk),
});
await call("/uploads/" + id + "/complete", {
  method: "POST",
  cookie: student.cookie,
});
await call("/uploads/" + id + "/complete", {
  method: "POST",
  cookie: student.cookie,
});
assert.ok((await call("/films")).data.films.some((f) => f.id === id));
await call("/films/" + id + "/rating", {
  method: "POST",
  cookie: student.cookie,
  body: { score: 10 },
  expected: 403,
});
await call("/films/" + id + "/rating", {
  method: "POST",
  body: { score: 9 },
  expected: 401,
});
await call("/films/" + id + "/rating", {
  method: "POST",
  cookie: audience.cookie,
  body: { score: 11 },
  expected: 400,
});
await call("/films/" + id + "/rating", {
  method: "POST",
  cookie: audience.cookie,
  body: { score: 8 },
});
await call("/films/" + id + "/rating", {
  method: "POST",
  cookie: audience.cookie,
  body: { score: 9 },
});
const detail = await call("/films/" + id, { cookie: audience.cookie });
assert.equal(detail.data.film.votes, 1);
assert.equal(detail.data.film.average, 9);
assert.equal(detail.data.myScore, 9);
assert.deepEqual(detail.data.film.members, metadata.members);
for (const [range, start, length] of [
  ["bytes=0-99", 0, 100],
  ["bytes=-20", film.length - 20, 20],
  ["bytes=100-", 100, film.length - 100],
]) {
  const r = await fetch(base + "/api/films/" + id + "/media", {
    headers: { Range: range },
  });
  assert.equal(r.status, 206);
  if (r.headers.has("content-length"))
    assert.equal(Number(r.headers.get("content-length")), length);
  assert.deepEqual(
    Buffer.from(await r.arrayBuffer()),
    film.subarray(start, start + length),
  );
  checks++;
}
assert.equal(
  (
    await fetch(base + "/api/films/" + id + "/media", {
      headers: { Range: "bytes=9999999999-" },
    })
  ).status,
  416,
);
checks++;
const big = await call("/uploads", {
  method: "POST",
  cookie: student.cookie,
  body: { ...metadata, size: 50 * 1024 ** 3 },
  expected: 201,
});
await call("/uploads/" + big.data.id, {
  method: "DELETE",
  cookie: student.cookie,
});
await call("/logout", { method: "POST", cookie: audience.cookie });
await call("/my-films", { cookie: audience.cookie, expected: 401 });
const cross = await fetch(base + "/api/register", {
  method: "POST",
  headers: {
    Origin: "https://outro.example",
    "Content-Type": "application/json",
  },
  body: "{}",
});
assert.equal(cross.status, 403);
checks++;
console.log(
  JSON.stringify(
    {
      passed: checks,
      filmId: id,
      note: "Fixture e contas somente no banco local. Limite de 50 GB validado por metadados, não por transferência de 50 GB.",
    },
    null,
    2,
  ),
);

// The Vercel SPA authenticates directly against the backend using a scoped
// bearer session. No third-party cookies or proxying of MP4 chunks is required.
const frontendOrigin = "https://mostra-donaduzzi.vercel.app";
const preflight = await fetch(base + "/api/uploads", {
  method: "OPTIONS",
  headers: {
    Origin: frontendOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type,authorization",
  },
});
assert.equal(preflight.status, 204);
assert.equal(
  preflight.headers.get("access-control-allow-origin"),
  frontendOrigin,
);
const registerCross = await fetch(base + "/api/register", {
  method: "POST",
  headers: { Origin: frontendOrigin, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Aluno do frontend Vercel",
    email: `vercel-${run}@example.invalid`,
    password: pw,
  }),
});
assert.equal(registerCross.status, 200);
assert.equal(
  registerCross.headers.get("access-control-allow-origin"),
  frontendOrigin,
);
assert.equal(registerCross.headers.has("set-cookie"), false);
const bearer = (await registerCross.json()).sessionToken;
assert.ok(bearer);
const crossHeaders = {
  Origin: frontendOrigin,
  Authorization: "Bearer " + bearer,
};
const crossMe = await fetch(base + "/api/me", { headers: crossHeaders });
assert.equal((await crossMe.json()).user.name, "Aluno do frontend Vercel");
const evil = await fetch(base + "/api/me", {
  headers: {
    Origin: "https://mostra-donaduzzi-evil.vercel.app",
    Authorization: "Bearer " + bearer,
  },
});
assert.equal(evil.status, 403);
assert.equal(evil.headers.has("access-control-allow-origin"), false);
assert.equal(
  (await fetch(base + "/api/logout", { method: "POST", headers: crossHeaders }))
    .status,
  200,
);
const signedOut = await fetch(base + "/api/my-films", {
  headers: crossHeaders,
});
assert.equal(signedOut.status, 401);
console.log(
  "CORS + sessão bearer + logout + rejeição de origem externa: 6 verificações aprovadas.",
);
