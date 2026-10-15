# Rynex 10K

Projeto iniciado como site estático; a loja com backend e pedidos reais usa Cloudflare Pages + D1, conforme as instruções abaixo.
O site Rynex 10K foi feito por mim o Myst fiz com amor e carinho!
me sobe de cargo caleb <3

## Hospedagem

O GitHub mantém o código. A versão comercial com API, pedidos e atendimento precisa ser publicada no Cloudflare Pages depois da configuração de D1 e dos segredos descrita neste README.


# Loja Rynex — implantação com pedidos reais

A implementação nova usa **Cloudflare Pages + Pages Functions + D1**. O GitHub continua sendo o repositório do código; a hospedagem da aplicação é Cloudflare. A loja não usa IA. O bot é separado e roda no PC do dono.

## Funcionalidades

- Catálogo dinâmico: produtos, preço, categoria, período e tipo de entrega são cadastrados no painel `/admin/` sem editar código.
- Contas de cliente com senha; `/account/` exibe histórico e data da compra.
- Checkout Pix do Mercado Pago com QR Code, código copiável e consulta automática do pagamento; webhook não é obrigatório.
- Entrega automática: logins/senhas criptografados com AES-GCM no D1 e exibidos somente ao comprador autenticado após confirmação.
- Entrega manual: conversa privada no site e tópico privado no Discord quando o bot do PC estiver online; mensagens sincronizadas nos dois sentidos.
- Segredos e credenciais ficam fora do repositório.

## Pré-requisitos

Conta Cloudflare no plano Free, acesso ao repositório, Node.js 20+ e credenciais de integração do Mercado Pago (somente Access Token) para aceitar pagamentos reais. O Mercado Pago pode cobrar tarifas por venda.

## D1 e publicação

No computador, baixe este repositório, abra o terminal na pasta e execute:

```bash
npm install
npx wrangler login
npx wrangler d1 create rynex-store-db
```

Copie o `database_id` retornado para `wrangler.toml` (substitua `PREENCHER_COM_O_ID_DO_D1`) e aplique o esquema:

```bash
npx wrangler d1 migrations apply rynex-store-db --remote
```

No painel Cloudflare, crie um projeto Pages conectado ao repositório, escolha a branch de produção e configure o diretório de saída `.` (build command vazio ou `exit 0`). Configure o binding D1 chamado `DB` para o banco `rynex-store-db` em **Settings → Functions → D1 database bindings**; mantenha também o binding no `wrangler.toml`. Alternativamente, use `npm run deploy` após autenticar o Wrangler. O ID D1 não é uma senha, mas deve ser substituído antes do deploy.

## Segredos do Cloudflare

No projeto Pages, em **Settings → Variables and Secrets → Production**, adicione como **Secrets**: `ADMIN_ACCESS_KEY` (chave longa para `/admin/`), `DELIVERY_ENCRYPTION_KEY` (Base64 de exatamente 32 bytes), `BOT_SHARED_SECRET` (segredo privado entre site e bot), `MP_ACCESS_TOKEN` (opcional: o token pode ser salvo pelo painel administrativo; `MP_WEBHOOK_SECRET` é opcional). Gere chaves no terminal privado com `openssl rand -base64 32`; não cole no repositório ou mensagens. Faça backup protegido da chave `DELIVERY_ENCRYPTION_KEY`: sem ela, as credenciais criptografadas que já estiverem no banco não poderão ser recuperadas.

## Mercado Pago

O painel administrativo aceita somente o Access Token do Mercado Pago. O checkout usa Pix direto (`/v1/payments`), mostra QR Code/código copiável e consulta o status no servidor a cada atualização de Minhas compras. Para testes, use credenciais e compradores de teste; o retorno do navegador não libera produto sozinho.

## Bot no PC

Siga o README do repositório `rynex-discord-bot`. Copie `.env.example` para `.env`, configure token do Discord, URL pública da loja, `BOT_SHARED_SECRET` igual ao segredo Cloudflare e ID do canal privado. Execute `npm install` e `npm start`; mantenha o terminal aberto. O bot fica offline quando PC ou internet desligarem. Mensagens ficam na base da loja e podem ser sincronizadas quando ele voltar.

## Verificação antes de vender

- `/api/health` deve responder com `ok: true`; `/api/catalog` inicia com listas vazias até o primeiro cadastro.
- Cadastre produto de teste e credenciais fictícias antes de cadastrar acessos reais.
- Teste compra com credenciais de teste do Mercado Pago.
- Confirme que `/admin/` exige a chave, que uma conta não acessa pedidos de outra, que as credenciais ficam ocultas até a confirmação do pagamento e que o bot cria tópicos privados.

## Custo e estado

Cloudflare Pages/Functions e D1 têm uma camada gratuita, mas não capacidade ilimitada; atingir quotas pode interromper requisições. Não habilite Workers Paid ou serviços pagos se a meta é custo de hospedagem zero. O Mercado Pago pode cobrar tarifa por transação aprovada. **O código está preparado, mas esta cópia ainda precisa do `database_id`, segredos Cloudflare/Mercado Pago e configuração do bot antes de processar vendas reais.** Não publique como produção até esses itens estarem prontos.
