# Rynex 10K

Site da loja Rynex 10K. O projeto mantém o código no GitHub e usa **Cloudflare Pages + Pages Functions + D1** para executar catálogo, contas, pedidos e suporte. O GitHub Pages atual é somente estático e não executa `/api`; a versão com atendimento real deve ser publicada no Cloudflare Pages.

> O D1 `rynex-store-db` já existe na conta Cloudflare consultada e seu ID está em `wrangler.toml`. Não crie outro banco nem substitua esse ID. A integração R2 ainda precisa ser habilitada na conta antes dos anexos funcionarem.

**Verificação de 15/10/2026:** o endereço GitHub Pages `https://gabrielmoto2011-collab.github.io/Rynex-10K/` é estático; as Pages Functions (`/api`) não rodam ali. O fluxo novo aparece na URL Cloudflare Pages depois do primeiro deploy. A versão GitHub continua com fallback para o catálogo legado até a migração de hospedagem.

## Recursos

- Catálogo, contas de cliente, pedidos e painel `/admin/`.
- Entrega manual de pedidos: conversa no site sincronizada com tópicos privados do Discord.
- Suporte geral: painel lateral moderno no botão de suporte, lista de tickets, chat ao vivo com atualização automática e encerramento pelo cliente.
- Tickets gerais abrem tópicos privados Discord. A equipe responde no tópico e a mensagem retorna ao chat no site.
- Imagens e arquivos são guardados em um bucket R2 privado e enviados nos dois sentidos (máximo de 4 anexos por mensagem, 8 MB por arquivo e 20 MB no total).
- O ID do canal de texto é configurado dentro de `/admin/`; o bot consulta essa configuração automaticamente. O mesmo canal pode receber tópicos de suporte e de pedidos manuais.

## Publicação Cloudflare Pages

### 1. Preparar recursos

1. Instale Node.js 20+ e execute `npm install`.
2. Autentique o Wrangler com `npx wrangler login`.
3. Crie o projeto Pages uma vez, se ainda não existir:

   ```bash
   npx wrangler pages project create rynex-store --production-branch main
   ```

4. Aplique as migrações no banco D1 existente (inclui as tabelas novas de tickets):

   ```bash
   npm run db:apply
   ```

5. No painel Cloudflare, habilite R2 para a conta. Depois crie o bucket privado:

   ```bash
   npm run storage:create
   ```

   O binding `SUPPORT_FILES` já está declarado em `wrangler.toml`. Não habilite domínio público para o bucket: os arquivos são servidos pela API somente após validar a conta do cliente ou o segredo do bot.

6. Configure no projeto Pages o binding D1 `DB` para `rynex-store-db` (se o Wrangler não o associar automaticamente). O arquivo `wrangler.toml` já tem o binding, o identificador e a pasta de migrações.

### 2. Segredos do Cloudflare

Configure como **Secrets** de Production no projeto Pages:

- `ADMIN_ACCESS_KEY` — chave longa para `/admin/`.
- `DELIVERY_ENCRYPTION_KEY` — chave Base64 com exatamente 32 bytes. Gere-a uma vez, faça backup seguro e **não a troque** depois de criptografar estoque/configurações.
- `BOT_SHARED_SECRET` — segredo privado entre a API e o bot. Use o mesmo valor no `.env` do bot.
- `MP_ACCESS_TOKEN` é opcional; o token também pode ser salvo pelo painel de administração.

Gere valores novos em um terminal privado, por exemplo `openssl rand -base64 32`. Não os coloque no GitHub, no código ou no chat. Se uma chave já estiver configurada, reutilize-a; não a substitua sem necessidade.

### 3. Publicar

Com o projeto Pages criado e os recursos configurados:

```bash
npm run deploy
```

Ou adicione os Secrets de repositório do GitHub `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; o workflow `.github/workflows/cloudflare-pages.yml` executa a validação e publica no Cloudflare Pages. O token usado pelo workflow precisa de permissão de edição de Cloudflare Pages.

A URL inicial será `https://rynex-store.pages.dev`. O workflow GitHub Pages existente publica somente arquivos estáticos; ele não executa as Functions. Portanto o novo chat e o painel de canal só funcionam na origem do Cloudflare Pages (ou em um domínio próprio ligado a esse projeto). A publicação no Cloudflare não altera automaticamente o endereço GitHub Pages atual.

## Configurar tickets e Discord

1. No Discord, crie um canal de texto privado para a equipe, por exemplo `#suporte-tickets`.
2. Convide o bot e habilite: **Ver canal**, **Ver histórico**, **Enviar mensagens**, **Criar tópicos privados**, **Gerenciar tópicos** e **Anexar arquivos**. A equipe que precisa enxergar tópicos privados deve ter **Gerenciar tópicos** no canal.
3. Ative o Modo Desenvolvedor, clique com o botão direito no canal e copie o ID.
4. Entre em `/admin/` no site Cloudflare, abra **Suporte pelo Discord** e salve o ID do canal. Ele é criptografado no D1 com `DELIVERY_ENCRYPTION_KEY`.
5. No computador que manterá o bot online, configure `.env` com `DISCORD_TOKEN`, `BOT_API_URL=https://rynex-store.pages.dev` e o mesmo `BOT_SHARED_SECRET`. `DISCORD_TICKET_CHANNEL_ID` é opcional (compatibilidade/fallback); normalmente basta salvar o ID pelo admin.
6. Ative **Message Content Intent** no Discord Developer Portal, inicie o bot e confirme `GET /api/health` ou use `/painel` no servidor.

Cada ticket do site vira um tópico privado. O bot verifica a configuração e sincroniza mensagens e arquivos nos dois sentidos; ele não usa IA. Os atendimentos manuais pagos continuam sincronizados no mesmo canal. O bot precisa estar ligado para que a sincronização com o Discord ocorra; mensagens permanecem no banco e são processadas quando ele reconectar.

Os tickets gerais exigem login de cliente. O painel no site atualiza a conversa a cada 5 segundos, permite abrir/encerrar tickets e anexar até 4 arquivos por mensagem (8 MB cada; 20 MB combinados). Sem R2 ativo e binding `SUPPORT_FILES`, texto continua funcionando, mas uploads retornam uma mensagem de configuração pendente.

## Desenvolvimento e verificação

```bash
npm install
npm run check
npm run dev
```

A migração `0003_support_tickets.sql` é aditiva; ela cria as tabelas de suporte sem modificar pedidos, conversas manuais, pagamentos ou credenciais existentes. Não aplique migrações de produção com uma cópia local diferente do `wrangler.toml`.

## Segurança e custos

- Nunca publique `DISCORD_TOKEN`, `BOT_SHARED_SECRET`, chaves de criptografia ou arquivos `.env`.
- Arquivos R2 ficam privados; a API verifica sessão/posse do ticket antes de servir ao cliente.
- Não envie credenciais de produtos ao Discord. O Discord é usado apenas para atendimento.
- Pages, D1 e R2 podem ter quotas/custos conforme uso e disponibilidade da conta. Revise o plano/uso antes de escalar; não habilite produtos pagos sem necessidade.
- Ainda é preciso habilitar R2, configurar os Secrets e publicar o projeto Pages antes de oferecer este fluxo aos clientes.
