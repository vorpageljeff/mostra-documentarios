# Mostra de Documentários — Faculdade Donaduzzi

Plataforma de inscrição aberta, exibição e avaliação de documentários de alunos.

**Frontend Vercel:** https://mostra-donaduzzi.vercel.app

**Backend/API:** https://mostra-documentarios.jeffersonvorpageldrs.chatgpt.site/api

Mostra dos alunos da disciplina **Profissional de TI e o Mercado de Trabalho**, da Faculdade Donaduzzi.

## Recursos

- Cadastro com nome, e-mail e senha. No frontend Vercel, o token opaco de sessão fica em sessionStorage, é enviado como Bearer e invalidado no logout. A aba precisa de novo login se a sessão local for perdida. No acesso direto ao Sites, a sessão usa cookie HttpOnly, SameSite=Lax e Secure.
- API com CORS limitado ao domínio exato do frontend. Uploads de 16 MiB vão diretamente ao backend; não passam por funções ou proxy da Vercel. Os dados e os vídeos continuam no D1/R2.
- Catálogo público com busca, categorias e ordenação por média.
- MP4 de até **50 GiB por vídeo**, transferido em partes de 16 MiB para R2. O arquivo completo nunca passa em uma única requisição.
- Pausa, repetição de partes e retomada após reabrir a página. O aluno seleciona novamente o mesmo arquivo; uma impressão digital das extremidades e do tamanho ajuda a evitar trocas acidentais.
- Publicação após conferência das partes e do tamanho final. Link compartilhável de cada filme.
- Player HTML5 com suporte HTTP Range para avançar e voltar.
- Notas inteiras de 0 a 10, uma por conta/filme, atualizáveis. O autor da inscrição não pode avaliar o próprio filme pela mesma conta.
- Área Meus envios e cancelamento dos envios ainda não concluídos.

## Stack e diretórios

Frontend React + TypeScript + Vite publicado na Vercel. Backend Vinext em Cloudflare Workers, publicado pelo Sites. D1 armazena cadastros, sessões, metadados, partes e notas. R2 armazena os vídeos; arquivos e dados de usuários **não vão ao GitHub**.

- `app/page.tsx`: catálogo, inscrição, player e avaliações compartilhados.
- `frontend/` e `vite.frontend.config.ts`: SPA da Vercel, build com `npm run build:frontend`.
- `vercel.json`: configuração do frontend.
- `lib/api-client.ts`: acesso direto ao backend e sessão do frontend.
- `public/donaduzzi-logo.png`: logotipo original obtido no site oficial da faculdade, usado nesta mostra acadêmica. Referência: https://faculdadedonaduzzi.com.br/wp-content/uploads/2025/08/Logo-Faculdade-Donaduzzi@3x-8-scaled.png. Paleta de referência: vinho #541822, bordô #A31938, creme #F7F4E7 e dourado #F7DC8B. A marca pertence à instituição.
- `app/globals.css`: interface responsiva.
- `app/api/[[...path]]/route.ts`: entrada HTTP.
- `lib/api.ts`: autenticação, autorização, upload, streaming e notas.
- `lib/video-utils.ts`: limites e interpretação de intervalos.
- `db/schema.ts` e `drizzle/`: esquema e migrações.
- `.openai/hosting.json`: identidade e bindings da hospedagem Sites.

## Desenvolvimento local

Requer Node >=22.13 e npm. Instale com `npm ci`. Execute `npm run build` para gerar a configuração local de bindings. Aplique as migrações pendentes uma única vez:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lean_meggan.sql
npm run dev
```

O desenvolvimento usa banco e bucket locais em `.wrangler/`, ignorados pelo Git. `npm start -- --port 5183` oferece uma prévia do build na mesma base local. Para uma nova instalação hospedada, registre um novo Site e substitua o project_id; não reutilize a identidade desta instalação. O fluxo de publicação Sites provisiona DB e BUCKET e aplica as migrações.

## Verificação

```sh
npx tsc --noEmit
npm run build
mkdir -p work
curl -fsSL https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4 -o work/flower.mp4
# Com npm start -- --port 5183 em outro terminal:
node tests/integration.mjs
```

Os testes criam contas e um filme somente no ambiente local. Verificam autenticação, autorização entre usuários, upload com mais de uma parte, retomada, conclusão idempotente, cancelamento, limite de tamanho, voto único atualizável, bloqueio de voto do autor, logout e leitura por intervalos. O limite de 50 GiB é validado por metadados; não foi transferido um arquivo de 50 GiB no teste.

## Limites desta versão simples

- O MP4 original é servido sem transcodificação. Recomenda-se H.264 + AAC, com legendas incorporadas e `faststart`. A extensão MP4 sozinha não garante compatibilidade de codec. Não há HLS/adaptação automática de qualidade.
- Cadastro aberto sem confirmação de e-mail e sem recuperação automática de senha. Uma conta não equivale a uma pessoa verificada; este modelo de nota é adequado à participação informal, não a votação auditável ou nota acadêmica final sem conferência docente.
- Os vídeos são publicados automaticamente após o envio autorizado. Não há painel de moderação, remoção de filmes publicados ou exportação de notas nesta versão.
- Limite inicial agregado: **500 GiB** entre filmes publicados e reservas de upload recentes. Pode ser ajustado em `lib/api.ts` conforme a capacidade contratada. Uso real depende das quotas e condições da hospedagem; isto não é armazenamento ilimitado.
- Retomada disponível por até seis dias. Uploads multipart incompletos ficam sujeitos à expiração do armazenamento. Reservas antigas deixam de ocupar a capacidade lógica; o aluno pode cancelar e reenviar.
- O catálogo retorna os 300 documentários mais recentes. Para uma mostra maior, implemente paginação.
- Limitação de tentativas de cadastro/login/envio/avaliação e consultas SQL parametrizadas. Senhas usam PBKDF2-SHA256 com salt aleatório e 100 mil iterações, conforme o limite do Web Crypto do runtime. Não existem senhas padrão nem credenciais no código.
- Preserve um backup dos originais. Os autores devem possuir autorização de imagem, áudio e publicação do material enviado.

O projeto começou sem filmes demonstrativos na produção. A arte gráfica da interface é feita em CSS; não representa um documentário inscrito.

## Publicação separada

Vercel: projeto `mostra-donaduzzi`, equipe `vorpageljeffs-projects`, build `npm run build:frontend`, saída `dist-frontend`, Node 22. O frontend é estático; o backend não roda na Vercel. O backend continua no mesmo project_id Sites, com seus bindings e dados preservados. Ao alterar o domínio, ajuste `FRONTEND_ORIGINS` em `lib/api.ts` e o atributo `data-api-base` em `frontend/index.html` conforme necessário. Os seis testes extras de integração cobrem preflight CORS, login cross-origin, token Bearer, logout e rejeição de origem não autorizada.
