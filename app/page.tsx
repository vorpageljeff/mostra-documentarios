"use client";
import { useEffect, useRef, useState } from "react";
import { apiBase, sessionToken, saveSession } from "../lib/api-client";

type User = { id: string; name: string; email: string };
type Film = {
  id: string;
  title: string;
  synopsis: string;
  team: string;
  category: string;
  duration: number;
  size: number;
  votes: number;
  average: number | null;
  createdAt: number;
  status?: string;
};
const CATEGORIES = [
  "Todos",
  "Sociedade",
  "Meio ambiente",
  "Cultura",
  "História",
  "Ciência",
  "Outros",
];
const GB = 1024 ** 3;
const size = (n: number) =>
  n >= GB ? (n / GB).toFixed(1) + " GB" : Math.ceil(n / 1024 ** 2) + " MB";
const minutes = (n: number) => Math.max(1, Math.round(n / 60)) + " min";
type ApiResponse = {
  user: User;
  films: Film[];
  film: Film;
  myScore: number | null;
  isOwner: boolean;
  id: string;
  partSize: number;
  parts: { partNumber: number; size: number }[];
  status: string;
  fingerprint: string;
  size: number;
  filename: string;
  title: string;
  synopsis: string;
  team: string;
  category: string;
  duration: number;
  error?: string;
  sessionToken?: string;
};
async function api(path: string, options: RequestInit = {}) {
  const r = await fetch(apiBase() + "/api" + path, {
    credentials: apiBase() ? "omit" : "same-origin",
    ...options,
    headers: {
      ...(apiBase() && sessionToken()
        ? { Authorization: "Bearer " + sessionToken() }
        : {}),
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = (await r.json()) as ApiResponse;
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  if (apiBase() && data.sessionToken) saveSession(data.sessionToken);
  if (path === "/logout") saveSession(null);
  return data;
}
function Icon({ name, size: s = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m9 5 11 7-11 7z" />,
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />
    ),
    film: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    pause: <path d="M8 5v14M16 5v14" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
  };
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
function Poster({ film, index = 0 }: { film?: Film; index?: number }) {
  return (
    <div className={"poster palette-" + (index % 4)}>
      <div className="poster-grain" />
      <span className="poster-label">MOSTRA / DOCUMENTÁRIO</span>
      <div className="poster-art">
        <i />
        <i />
        <i />
      </div>
      <strong>{film?.title || "O mundo tem\nmuitas histórias."}</strong>
      <div className="poster-bottom">
        <span>{film?.category || "A próxima pode ser a sua."}</span>
        <span>{film ? minutes(film.duration) : "REC ●"}</span>
      </div>
    </div>
  );
}
async function fingerprint(file: File) {
  const buffer = await new Blob([
    file.slice(0, 1024 * 1024),
    file.slice(-1024 * 1024),
    String(file.size),
  ]).arrayBuffer();
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
async function duration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      cleanup();
      Number.isFinite(d) && d > 0
        ? resolve(d)
        : reject(new Error("Não foi possível ler a duração do vídeo."));
    };
    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Este vídeo não pode ser reproduzido neste navegador. Exporte em MP4 com H.264 e AAC.",
        ),
      );
    };
    video.src = url;
  });
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [films, setFilms] = useState<Film[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const [view, setView] = useState("catalog"),
    [category, setCategory] = useState("Todos"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent");
  const [auth, setAuth] = useState<null | "login" | "register">(null),
    [authBusy, setAuthBusy] = useState(false),
    [authError, setAuthError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<{
      film: Film;
      myScore: number | null;
      isOwner: boolean;
    } | null>(null),
    [opening, setOpening] = useState(false),
    [score, setScore] = useState<number | null>(null),
    [savingScore, setSavingScore] = useState(false),
    [ratingMessage, setRatingMessage] = useState("");
  const [form, setForm] = useState({
      title: "",
      synopsis: "",
      team: "",
      category: "Sociedade",
    }),
    [file, setFile] = useState<File | null>(null),
    [consent, setConsent] = useState(false),
    [uploadId, setUploadId] = useState<string | null>(null),
    [resumeName, setResumeName] = useState(""),
    [progress, setProgress] = useState(0),
    [uploadState, setUploadState] = useState("idle"),
    [uploadError, setUploadError] = useState(""),
    [myFilms, setMyFilms] = useState<Film[]>([]);
  const stop = useRef(false),
    controller = useRef<AbortController | null>(null);
  const busy =
    uploadState === "sending" ||
    uploadState === "preparing" ||
    uploadState === "finishing";
  async function refresh() {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api("/films");
      setFilms(data.films);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function refreshMine() {
    try {
      const d = await api("/my-films");
      setMyFilms(d.films);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    api("/me")
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setReady(true));
    refresh();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!selected && !auth) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (auth) setAuth(null);
        else setSelected(null);
      }
      if (e.key === "Tab") {
        const root = document.querySelector(
          auth ? ".auth-modal" : ".player-modal",
        );
        const nodes = Array.from(
          root?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),video[controls],a[href]",
          ) || [],
        ).filter((n) => n.offsetParent !== null);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [selected, auth]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  function navigate(next: string) {
    if (busy) {
      setNotice("Pause o envio antes de trocar de página.");
      return;
    }
    if (next !== "catalog" && !user) {
      setAuth("register");
      return;
    }
    setView(next);
    if (next === "mine") refreshMine();
    if (next === "upload" && user && !uploadId) {
      const saved = localStorage.getItem("mostra-upload:" + user.id);
      if (saved) loadResume(saved);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function loadResume(id: string) {
    try {
      const d = await api("/uploads/" + id);
      if (d.status !== "uploading") {
        if (user) localStorage.removeItem("mostra-upload:" + user.id);
        return;
      }
      setUploadId(id);
      setResumeName(d.filename);
      setForm({
        title: d.title,
        synopsis: d.synopsis,
        team: d.team,
        category: d.category,
      });
      setProgress(
        Math.round(
          (d.parts.reduce((s: number, p: { size: number }) => s + p.size, 0) /
            d.size) *
            100,
        ),
      );
      setUploadState("paused");
      setFile(null);
      setConsent(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const d = await api(auth === "register" ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setUser(d.user);
      setAuth(null);
      if (selected) {
        const filmData = await api("/films/" + selected.film.id);
        setSelected(filmData);
        setScore(filmData.myScore);
      }
      setNotice(
        "Tudo pronto, " + d.user.name.split(" ")[0] + ". Bem-vindo à Mostra!",
      );
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  async function openFilm(id: string) {
    setOpening(true);
    setRatingMessage("");
    try {
      const d = await api("/films/" + id);
      setSelected(d);
      setScore(d.myScore);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setOpening(false);
    }
  }
  async function rate() {
    if (!selected || score === null) return;
    if (!user) {
      setAuth("register");
      return;
    }
    setSavingScore(true);
    setRatingMessage("");
    try {
      await api("/films/" + selected.film.id + "/rating", {
        method: "POST",
        body: JSON.stringify({ score }),
      });
      const d = await api("/films/" + selected.film.id);
      setSelected(d);
      setRatingMessage("Sua nota foi salva. Obrigado por participar!");
      refresh();
    } catch (e) {
      setRatingMessage((e as Error).message);
    } finally {
      setSavingScore(false);
    }
  }
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setAuth("register");
      return;
    }
    if (!file) {
      setUploadError("Selecione o arquivo MP4 para começar ou retomar.");
      return;
    }
    if (file.size > 50 * GB || file.size < 12) {
      setUploadError("Selecione um vídeo MP4 de até 50 GB.");
      return;
    }
    stop.current = false;
    setUploadError("");
    setUploadState("preparing");
    let id = uploadId;
    try {
      const fp = await fingerprint(file);
      let partSize = 16 * 1024 ** 2;
      let uploaded: { partNumber: number; size: number }[] = [];
      if (id) {
        const d = await api("/uploads/" + id);
        if (d.fingerprint !== fp || d.size !== file.size)
          throw new Error(
            "Escolha o mesmo arquivo do envio original: " + d.filename,
          );
        if (d.status === "ready") {
          setUploadState("done");
          await refresh();
          return;
        }
        partSize = d.partSize;
        uploaded = d.parts;
      } else {
        const d = await api("/uploads", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            filename: file.name,
            fingerprint: fp,
            type: "video/mp4",
            size: file.size,
            duration: await duration(file),
            publishConsent: consent,
          }),
        });
        id = d.id;
        setUploadId(id);
        setResumeName(file.name);
        partSize = d.partSize;
        localStorage.setItem("mostra-upload:" + user.id, id!);
      }
      setUploadState("sending");
      const completed = new Set(uploaded.map((p) => p.partNumber));
      let sent = uploaded.reduce((s, p) => s + p.size, 0);
      setProgress(Math.floor((sent / file.size) * 100));
      for (let n = 1; n <= Math.ceil(file.size / partSize); n++) {
        if (stop.current) break;
        if (completed.has(n)) continue;
        const chunk = file.slice((n - 1) * partSize, n * partSize);
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (stop.current) break;
          controller.current = new AbortController();
          try {
            await api("/uploads/" + id + "/parts/" + n, {
              method: "PUT",
              body: chunk,
              signal: controller.current.signal,
            });
            success = true;
            break;
          } catch (err) {
            if (stop.current) break;
            if (attempt === 2) throw err;
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (!success) break;
        sent += chunk.size;
        setProgress(Math.floor((sent / file.size) * 100));
      }
      if (stop.current) {
        setUploadState("paused");
        return;
      }
      setUploadState("finishing");
      await api("/uploads/" + id + "/complete", { method: "POST" });
      setProgress(100);
      setUploadState("done");
      localStorage.removeItem("mostra-upload:" + user.id);
      await refresh();
    } catch (err) {
      if (stop.current) {
        setUploadState("paused");
        return;
      }
      setUploadError((err as Error).message);
      setUploadState("paused");
    }
  }
  async function cancelUpload() {
    if (!uploadId || !user) return;
    try {
      await api("/uploads/" + uploadId, { method: "DELETE" });
      localStorage.removeItem("mostra-upload:" + user.id);
      resetUpload();
      setNotice("Envio cancelado. Você pode iniciar um novo.");
    } catch (e) {
      setUploadError((e as Error).message);
    }
  }
  function resetUpload() {
    setUploadId(null);
    setResumeName("");
    setProgress(0);
    setUploadState("idle");
    setFile(null);
    setForm({ title: "", synopsis: "", team: "", category: "Sociedade" });
    setConsent(false);
    setUploadError("");
  }
  const shown = films
    .filter(
      (f) =>
        (category === "Todos" || f.category === category) &&
        `${f.title} ${f.team} ${f.synopsis}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) =>
      sort === "rating"
        ? (b.average ?? -1) - (a.average ?? -1)
        : b.createdAt - a.createdAt,
    );
  const votes = films.reduce((s, f) => s + f.votes, 0);
  return (
    <>
      <a className="skip" href="#main">
        Ir para o conteúdo
      </a>
      <header className="header">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("catalog");
          }}
        >
          <img
            className="faculty-logo"
            src="/donaduzzi-logo.png"
            alt="Faculdade Donaduzzi"
            width="200"
            height="56"
          />
          <span className="brand-project">
            MOSTRA
            <br />
            DOCUMENTÁRIOS
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <button
            className={view === "catalog" ? "nav-active" : ""}
            onClick={() => navigate("catalog")}
          >
            Documentários
          </button>
          <button
            className={view === "upload" ? "nav-active" : ""}
            onClick={() => navigate("upload")}
          >
            Inscreva seu filme
          </button>
          {user && (
            <button
              className={view === "mine" ? "nav-active" : ""}
              onClick={() => navigate("mine")}
            >
              Meus envios
            </button>
          )}
        </nav>
        <div className="account">
          {user ? (
            <>
              <span className="username">
                <Icon name="user" size={16} />
                {user.name.split(" ")[0]}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  await api("/logout", { method: "POST" });
                  setUser(null);
                  setView("catalog");
                  setSelected(null);
                  resetUpload();
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <button className="text-button" onClick={() => setAuth("login")}>
                Entrar
              </button>
              <button
                className="button dark compact"
                onClick={() => setAuth("register")}
              >
                Criar conta <Icon name="arrow" size={16} />
              </button>
            </>
          )}
        </div>
      </header>
      <main id="main">
        {view === "catalog" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="live-dot" /> FACULDADE DONADUZZI · INSCRIÇÕES
                  ABERTAS
                </div>
                <h1>
                  Profissional de TI.
                  <br />
                  <em>Novos olhares.</em>
                </h1>
                <p>
                  Mostra de documentários dos alunos da Faculdade Donaduzzi, na
                  disciplina Profissional de TI e o Mercado de Trabalho. Assista
                  às produções e participe da avaliação.
                </p>
                <div className="hero-actions">
                  <button
                    className="button dark"
                    onClick={() =>
                      document
                        .getElementById("catalogo")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Explorar documentários <Icon name="arrow" />
                  </button>
                  <button
                    className="button outline"
                    onClick={() => navigate("upload")}
                  >
                    <Icon name="upload" size={18} /> Inscrever meu filme
                  </button>
                </div>
                <div className="hero-note">
                  <span className="small-film">
                    <Icon name="film" size={19} />
                  </span>
                  <span>
                    Da sala de aula para o mercado de trabalho.
                    <br />
                    <strong>
                      Assista livremente. Cadastre-se para participar.
                    </strong>
                  </span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="visual-top">
                  <span>PROFISSIONAL DE TI E O MERCADO DE TRABALHO</span>
                  <span>01 — ∞</span>
                </div>
                <div className="hero-art">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orb" />
                  <div className="art-play">
                    <Icon name="play" size={38} />
                  </div>
                  <span className="art-label">
                    PERSPECTIVAS
                    <br />
                    EM MOVIMENTO.
                  </span>
                  <span className="rec">
                    <i /> REC
                  </span>
                </div>
                <div className="visual-caption">
                  <span>Vozes diferentes. Uma tela em comum.</span>
                  <Icon name="arrow" size={18} />
                </div>
              </div>
            </section>
            <section className="numbers" aria-label="Números da mostra">
              <div>
                <strong>{String(films.length).padStart(2, "0")}</strong>
                <span>documentários publicados</span>
              </div>
              <div>
                <strong>{String(votes).padStart(2, "0")}</strong>
                <span>avaliações do público</span>
              </div>
              <div>
                <span className="open-icon">↗</span>
                <span>
                  Participação aberta
                  <br />
                  <b>Seu olhar também conta.</b>
                </span>
              </div>
            </section>
            <section className="catalog section" id="catalogo">
              <div className="section-heading">
                <div>
                  <div className="eyebrow muted">
                    DESCUBRA. ASSISTA. AVALIE.
                  </div>
                  <h2>
                    Em cartaz<span className="count">{films.length}</span>
                  </h2>
                </div>
                <label className="search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Buscar documentário ou equipe"
                    placeholder="Buscar documentário ou equipe"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="filters">
                <div className="chips" role="group" aria-label="Categorias">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      aria-pressed={category === c}
                      className={category === c ? "chip selected" : "chip"}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Ordenar documentários"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="recent">Mais recentes</option>
                  <option value="rating">Melhor avaliados</option>
                </select>
              </div>
              {loading ? (
                <div className="empty">
                  <span className="spinner" />
                  Carregando a mostra…
                </div>
              ) : loadError ? (
                <div className="empty">
                  <h3>Não conseguimos carregar os filmes.</h3>
                  <p>{loadError}</p>
                  <button className="button outline" onClick={refresh}>
                    Tentar novamente
                  </button>
                </div>
              ) : shown.length ? (
                <div className="film-grid">
                  {shown.map((film, i) => (
                    <article className="film-card" key={film.id}>
                      <button
                        className="poster-button"
                        onClick={() => openFilm(film.id)}
                        aria-label={"Assistir " + film.title}
                        disabled={opening}
                      >
                        <Poster film={film} index={i} />
                        <span className="play-overlay">
                          <Icon name="play" size={27} />
                        </span>
                      </button>
                      <div className="film-meta">
                        <span>{film.category}</span>
                        <span>{minutes(film.duration)}</span>
                      </div>
                      <h3>
                        <button onClick={() => openFilm(film.id)}>
                          {film.title}
                        </button>
                      </h3>
                      <p className="film-team">{film.team}</p>
                      <div className="film-rating">
                        <Icon name="star" size={16} />
                        <strong>
                          {film.average !== null
                            ? Number(film.average).toFixed(1)
                            : "—"}
                        </strong>
                        <span>
                          {film.votes
                            ? film.votes + " avaliações"
                            : "Seja o primeiro a avaliar"}
                        </span>
                        <button
                          aria-label={"Assistir " + film.title}
                          onClick={() => openFilm(film.id)}
                        >
                          <Icon name="arrow" size={18} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty empty-catalog">
                  <span className="empty-icon">
                    <Icon name="film" size={30} />
                  </span>
                  <h3>
                    {films.length
                      ? "Nenhum filme encontrado."
                      : "A primeira sessão começa com você."}
                  </h3>
                  <p>
                    {films.length
                      ? "Tente outro termo ou escolha uma categoria diferente."
                      : "Os documentários inscritos aparecerão aqui, prontos para assistir e avaliar."}
                  </p>
                  <button
                    className="button dark"
                    onClick={() =>
                      films.length
                        ? (setSearch(""), setCategory("Todos"))
                        : navigate("upload")
                    }
                  >
                    {films.length
                      ? "Limpar filtros"
                      : "Inscrever o primeiro documentário"}
                    <Icon name="arrow" size={18} />
                  </button>
                </div>
              )}
            </section>
            <section className="how section">
              <div>
                <div className="eyebrow muted">SIMPLES, DO COMEÇO AO PLAY</div>
                <h2>
                  Seu documentário.
                  <br />
                  Nosso próximo encontro.
                </h2>
              </div>
              <div className="steps">
                {[
                  [
                    "01",
                    "Crie sua conta",
                    "Um cadastro rápido para enviar seus filmes e participar das avaliações.",
                  ],
                  [
                    "02",
                    "Compartilhe seu olhar",
                    "Envie seu MP4 de até 50 GB, com título, sinopse e nome da equipe.",
                  ],
                  [
                    "03",
                    "Dê o play. Dê sua nota.",
                    "Os filmes ficam disponíveis para todos. Cada conta pode dar uma nota de 0 a 10.",
                  ],
                ].map(([n, t, d]) => (
                  <div className="step" key={n}>
                    <span>{n}</span>
                    <div>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {view === "upload" && (
          <section className="section upload-page">
            <button className="back" onClick={() => navigate("catalog")}>
              ← Voltar para a mostra
            </button>
            <div className="eyebrow muted">INSCRIÇÕES ABERTAS</div>
            <h1>
              Compartilhe seu <em>olhar.</em>
            </h1>
            <p className="page-intro">
              Seu documentário merece encontrar o público. Preencha os dados,
              envie o vídeo e pronto.
            </p>
            {uploadState === "done" ? (
              <div className="success-panel">
                <span className="success-icon">
                  <Icon name="check" size={32} />
                </span>
                <h2>Seu filme está em cartaz!</h2>
                <p>
                  O documentário já pode ser assistido e avaliado pelo público.
                </p>
                <div className="hero-actions">
                  <button
                    className="button dark"
                    onClick={() => openFilm(uploadId!)}
                  >
                    <Icon name="play" />
                    Assistir ao meu filme
                  </button>
                  <button className="button outline" onClick={resetUpload}>
                    Enviar outro documentário
                  </button>
                </div>
                <button
                  className="text-button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      location.origin + "/?filme=" + uploadId,
                    );
                    setNotice("Link copiado!");
                  }}
                >
                  Copiar link para compartilhar ↗
                </button>
              </div>
            ) : (
              <div className="upload-layout">
                <form className="upload-form" onSubmit={upload}>
                  <div className="form-section">
                    <div className="form-title">
                      <span>01</span>
                      <h2>Sobre o documentário</h2>
                    </div>
                    <label>
                      Título
                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        disabled={!!uploadId || busy}
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        placeholder="Como sua história se chama?"
                      />
                    </label>
                    <label>
                      Equipe / autoria
                      <input
                        required
                        minLength={2}
                        maxLength={300}
                        disabled={!!uploadId || busy}
                        value={form.team}
                        onChange={(e) =>
                          setForm({ ...form, team: e.target.value })
                        }
                        placeholder="Nome dos alunos ou da equipe"
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        disabled={!!uploadId || busy}
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        {CATEGORIES.slice(1).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sinopse
                      <textarea
                        required
                        minLength={20}
                        maxLength={2000}
                        rows={4}
                        disabled={!!uploadId || busy}
                        value={form.synopsis}
                        onChange={(e) =>
                          setForm({ ...form, synopsis: e.target.value })
                        }
                        placeholder="Conte um pouco sobre o tema e a história do filme."
                      />
                      <span className="field-hint">
                        De 20 a 2.000 caracteres · {form.synopsis.length}/2000
                      </span>
                    </label>
                  </div>
                  <div className="form-section">
                    <div className="form-title">
                      <span>02</span>
                      <h2>O filme</h2>
                    </div>
                    {resumeName && (
                      <p className="resume-note">
                        Envio em andamento: <strong>{resumeName}</strong>.
                        Selecione o mesmo arquivo para retomar.
                      </p>
                    )}
                    <label className={"dropzone " + (file ? "has-file" : "")}>
                      <input
                        type="file"
                        accept=".mp4,video/mp4"
                        disabled={busy}
                        onChange={(e) => {
                          setFile(e.target.files?.[0] || null);
                          setUploadError("");
                        }}
                      />
                      <span className="upload-circle">
                        <Icon name={file ? "check" : "upload"} size={25} />
                      </span>
                      <strong>
                        {file ? file.name : "Escolha seu documentário"}
                      </strong>
                      <span>
                        {file
                          ? size(file.size)
                          : "Clique para selecionar o arquivo MP4"}
                      </span>
                      <small>Até 50 GB · H.264 + AAC recomendado</small>
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        required
                        checked={consent}
                        disabled={busy || !!uploadId}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>
                        Tenho autorização para publicar este documentário e
                        estou ciente de que o vídeo, a sinopse e a autoria
                        ficarão públicos.
                      </span>
                    </label>
                    {uploadState !== "idle" && (
                      <div className="progress-panel" aria-live="polite">
                        <div>
                          <strong>
                            {uploadState === "preparing"
                              ? "Preparando arquivo…"
                              : uploadState === "finishing"
                                ? "Finalizando publicação…"
                                : uploadState === "paused"
                                  ? "Envio pausado"
                                  : "Enviando documentário…"}
                          </strong>
                          <span>{progress}%</span>
                        </div>
                        <progress max={100} value={progress} />
                        <p>
                          {uploadState === "paused"
                            ? "Você pode retomar sem reenviar as partes concluídas."
                            : "Mantenha esta página aberta. Você pode pausar se precisar."}
                        </p>
                      </div>
                    )}
                    {uploadError && (
                      <p className="error" role="alert">
                        {uploadError}
                      </p>
                    )}
                    <div className="form-actions">
                      {busy ? (
                        <button
                          className="button outline"
                          type="button"
                          disabled={uploadState !== "sending"}
                          onClick={() => {
                            stop.current = true;
                            controller.current?.abort();
                            setUploadState("paused");
                          }}
                        >
                          <Icon name="pause" size={17} />
                          Pausar envio
                        </button>
                      ) : (
                        <button className="button dark" type="submit">
                          <Icon name="upload" size={18} />
                          {uploadId
                            ? "Retomar envio"
                            : "Enviar e publicar documentário"}
                        </button>
                      )}
                      {uploadId && !busy && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={cancelUpload}
                        >
                          Cancelar envio
                        </button>
                      )}
                    </div>
                  </div>
                </form>
                <aside className="upload-aside">
                  <span className="aside-symbol">↗</span>
                  <h3>
                    Um arquivo grande.
                    <br />
                    Um envio tranquilo.
                  </h3>
                  <p>
                    O vídeo é enviado em partes. Se a conexão cair, volte a esta
                    página, selecione o mesmo arquivo e continue de onde parou.
                  </p>
                  <div className="aside-rule" />
                  <h4>Antes de enviar</h4>
                  <ul>
                    <li>Use MP4 com H.264 e áudio AAC.</li>
                    <li>Confira o som e os créditos finais.</li>
                    <li>Inclua legendas no vídeo, se possível.</li>
                    <li>Revise a sinopse e os nomes da equipe.</li>
                  </ul>
                  <small>
                    O arquivo original fica disponível para reprodução. Não há
                    conversão automática de formato.
                  </small>
                </aside>
              </div>
            )}
          </section>
        )}
        {view === "mine" && (
          <section className="section mine-page">
            <div className="eyebrow muted">SEUS DOCUMENTÁRIOS</div>
            <h1>
              Meus <em>envios.</em>
            </h1>
            <p className="page-intro">
              Acompanhe seus filmes e retome os envios em andamento.
            </p>
            <button
              className="button dark"
              onClick={() => {
                resetUpload();
                navigate("upload");
              }}
            >
              Inscrever documentário <Icon name="upload" size={18} />
            </button>
            <div className="my-list">
              {myFilms.length ? (
                myFilms.map((f) => (
                  <div className="my-row" key={f.id}>
                    <span className="my-film-icon">
                      <Icon name="film" />
                    </span>
                    <div>
                      <h3>{f.title}</h3>
                      <p>
                        {size(f.size)} ·{" "}
                        {f.status === "ready"
                          ? "Publicado"
                          : f.status === "cancelled"
                            ? "Cancelado"
                            : "Aguardando conclusão"}
                      </p>
                    </div>
                    {f.status === "ready" ? (
                      <button
                        className="button outline compact"
                        onClick={() => openFilm(f.id)}
                      >
                        Assistir <Icon name="play" size={15} />
                      </button>
                    ) : f.status === "uploading" ? (
                      <button
                        className="button outline compact"
                        onClick={() => {
                          setView("upload");
                          loadResume(f.id);
                        }}
                      >
                        Retomar <Icon name="arrow" size={15} />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="empty">
                  <Icon name="film" size={35} />
                  <h3>Sua história começa aqui.</h3>
                  <p>Você ainda não enviou nenhum documentário.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <footer className="footer">
        <a href="/" className="brand">
          <img
            className="faculty-logo"
            src="/donaduzzi-logo.png"
            alt="Faculdade Donaduzzi"
            width="200"
            height="56"
          />
        </a>
        <p>Faculdade Donaduzzi · Profissional de TI</p>
        <span>Mostra de documentários dos alunos.</span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="player-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selected.film.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="player-top">
              <span>MOSTRA / SALA DE EXIBIÇÃO</span>
              <button
                autoFocus
                aria-label="Fechar documentário"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            <video
              key={selected.film.id}
              controls
              preload="metadata"
              playsInline
              src={apiBase() + "/api/films/" + selected.film.id + "/media"}
              onError={() =>
                setRatingMessage(
                  "Não foi possível reproduzir. Verifique sua conexão e se o vídeo usa H.264/AAC.",
                )
              }
            >
              Seu navegador não suporta este vídeo.
            </video>
            <div className="player-details">
              <div>
                <div className="eyebrow muted">
                  {selected.film.category} · {minutes(selected.film.duration)}
                </div>
                <h2>{selected.film.title}</h2>
                <p className="byline">Por {selected.film.team}</p>
                <p className="synopsis">{selected.film.synopsis}</p>
              </div>
              <div className="rating-box">
                <div className="average">
                  <Icon name="star" size={24} />
                  <strong>
                    {selected.film.average === null
                      ? "—"
                      : Number(selected.film.average).toFixed(1)}
                  </strong>
                  <span>
                    / 10
                    <br />
                    {selected.film.votes} avaliações
                  </span>
                </div>
                <h3>Seu olhar também conta.</h3>
                {selected.isOwner ? (
                  <p>Seu filme está disponível para avaliação do público.</p>
                ) : !user ? (
                  <>
                    <p>Crie uma conta ou entre para dar sua nota.</p>
                    <button
                      className="button dark"
                      onClick={() => setAuth("register")}
                    >
                      Participar da avaliação <Icon name="arrow" size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      {selected.myScore !== null
                        ? "Sua nota foi " +
                          selected.myScore +
                          ". Você pode atualizá-la."
                        : "Como você avalia este documentário?"}
                    </p>
                    <div
                      className="score-options"
                      role="group"
                      aria-label="Nota de 0 a 10"
                    >
                      {Array.from({ length: 11 }, (_, n) => (
                        <button
                          key={n}
                          aria-pressed={score === n}
                          className={score === n ? "chosen" : ""}
                          onClick={() => setScore(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <button
                      className="button dark"
                      disabled={score === null || savingScore}
                      onClick={rate}
                    >
                      {savingScore
                        ? "Salvando…"
                        : selected.myScore !== null
                          ? "Atualizar minha nota"
                          : "Enviar minha nota"}
                      <Icon name="check" size={17} />
                    </button>
                  </>
                )}
                {ratingMessage && (
                  <p className="rating-message" role="status">
                    {ratingMessage}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {auth && (
        <div
          className="modal-backdrop auth-backdrop"
          onClick={() => setAuth(null)}
        >
          <section
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Fechar cadastro"
              onClick={() => setAuth(null)}
            >
              <Icon name="close" />
            </button>
            <span className="auth-mark">
              <Icon name="play" size={26} />
            </span>
            <div className="eyebrow muted">FAÇA PARTE DA MOSTRA</div>
            <h2 id="auth-title">
              {auth === "register"
                ? "Todo olhar é bem-vindo."
                : "Bom ter você de volta."}
            </h2>
            <p>
              {auth === "register"
                ? "Crie sua conta para inscrever filmes e participar das avaliações."
                : "Entre para continuar compartilhando e descobrindo histórias."}
            </p>
            <form onSubmit={authenticate}>
              {auth === "register" && (
                <label>
                  Seu nome
                  <input
                    autoFocus
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                  />
                </label>
              )}
              <label>
                E-mail
                <input
                  autoFocus={auth === "login"}
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="voce@exemplo.com"
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  required
                  minLength={auth === "register" ? 10 : 1}
                  maxLength={128}
                  autoComplete={
                    auth === "register" ? "new-password" : "current-password"
                  }
                  placeholder={
                    auth === "register"
                      ? "Pelo menos 10 caracteres"
                      : "Sua senha"
                  }
                />
              </label>
              {authError && (
                <p className="error" role="alert">
                  {authError}
                </p>
              )}
              <button className="button dark" disabled={authBusy}>
                {authBusy
                  ? "Aguarde…"
                  : auth === "register"
                    ? "Criar minha conta"
                    : "Entrar"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <div className="auth-switch">
              {auth === "register"
                ? "Já tem uma conta?"
                : "Ainda não tem conta?"}{" "}
              <button
                onClick={() => {
                  setAuth(auth === "register" ? "login" : "register");
                  setAuthError("");
                }}
              >
                {auth === "register" ? "Entrar" : "Cadastre-se"}
              </button>
            </div>
            <small>
              Seu e-mail fica privado. Apenas a autoria informada no envio
              aparece na mostra.
            </small>
          </section>
        </div>
      )}
      <DeepLink onOpen={openFilm} ready={ready} />
    </>
  );
}
function DeepLink({
  onOpen,
  ready,
}: {
  onOpen: (id: string) => void;
  ready: boolean;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const id = new URLSearchParams(location.search).get("filme");
    if (id && /^[a-f0-9-]{36}$/.test(id)) onOpen(id);
  }, [ready, onOpen]);
  return null;
}
