# Mostra — Documentários em foco

Plataforma de inscrição aberta, exibição e avaliação de documentários de alunos.

**Aplicação:** https://mostra-documentarios.jeffersonvorpageldrs.chatgpt.site

## Recursos

- Cadastro com nome, e-mail e senha; sessão em cookie HttpOnly, SameSite=Lax e Secure em produção.
- Catálogo público com busca, categorias e ordenação por média.
- MP4 de até **50 GiB por vídeo**, transferido em partes de 16 MiB para R2. O arquivo completo nunca passa em uma única requisição.
- Pausa, repetição de partes e retomada após reabrir a página. O aluno seleciona novamente o mesmo arquivo; uma impressão digital das extremidades e do tamanho ajuda a evitar trocas acidentais.
- Publicação após conferência das partes e do tamanho final. Link compartilhável de cada filme.
- Player HTML5 com suporte HTTP Range para avançar e voltar.
- Notas inteiras de 0 a 10, uma por conta/filme, atualizáveis. O autor da inscrição não pode avaliar o próprio filme pela mesma conta.
- Área Meus envios e cancelamento dos envios ainda não concluídos.

## Stack e diretórios

React + TypeScript + Vinext, executados em Cloudflare Workers. D1 armazena cadastros, sessões, metadados, partes e notas. R2 armazena os vídeos; arquivos e dados de usuários **não vão ao GitHub**.

- `app/page.tsx`: catálogo, inscrição, player e avaliações.
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
