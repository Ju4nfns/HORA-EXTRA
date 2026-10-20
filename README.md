# Hora extra

Sistema web: o coordenador importa a planilha do efetivo, cada encarregado escolhe o próprio nome, marca quem faz hora extra (dia, horário e atividade) e envia; o coordenador aprova ou reprova.

## Arquivos
- `index.html`, `styles.css`, `app.js`: o site.
- `api/index.js`: servidor (função serverless do Vercel). Guarda os dados e protege a área da coordenação.

## Como publicar
1. Envie esta pasta para um repositório no GitHub.
2. No Vercel: **Add New > Project**, escolha o repositório. Em *Framework Preset* deixe **Other**, sem comando de build.
3. **Banco de dados:** no projeto, aba **Storage** (ou Marketplace) > crie um **Upstash Redis** e conecte ao projeto. O Vercel cria sozinho as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`; o código aceita as duas formas). O plano gratuito atende.
4. **Variáveis de ambiente** (Settings > Environment Variables):
   - `COORD_PASSWORD` (obrigatória): senha da coordenação.
   - `AUTH_SECRET` (recomendada): texto aleatório longo para assinar a sessão.
   - `APP_TZ` (opcional): fuso horário, padrão `America/Sao_Paulo`.
5. Faça um **Redeploy** para as variáveis valerem.

## Uso
- Abas **Importar** e **Coordenação** pedem a senha. Para trocar a senha, altere `COORD_PASSWORD` no Vercel e faça Redeploy.
- Encarregados não precisam de login: abrem o link e escolhem o nome.
- Planilha: coluna A = colaborador, coluna F = encarregado, primeira linha = cabeçalho.
- A tela atualiza sozinha a cada 10 segundos.

## Observações
- Qualquer pessoa com o link pode escolher o nome de um encarregado. Se quiser um PIN por encarregado, dá para acrescentar.
- A leitura de .xlsx usa a biblioteca SheetJS carregada do cdnjs; o site precisa de internet no navegador.
