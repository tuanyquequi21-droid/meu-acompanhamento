# Meu Acompanhamento

PWA mobile-first para registrar alimentação, hidratação, treinos, hábitos, sono, medidas e bem-estar.

## Tecnologias
- HTML, CSS e JavaScript
- Supabase Auth, Postgres e Row Level Security
- GitHub Pages e PWA instalável

## Publicar
Em **Settings → Pages**, selecione **Deploy from a branch**, branch `main`, pasta `/ (root)`. URL esperada: https://tuanyquequi21-droid.github.io/meu-acompanhamento/

## Dados e segurança
Usa o projeto Supabase `financas-familia` e tabelas isoladas com prefixo `fit_`. O frontend utiliza apenas a chave publishable, protegida por RLS. Nunca inserir chave service_role no navegador.

## Compartilhamento
Cada pessoa usa sua própria conta. Os dados são vinculados ao usuário e ao espaço compartilhado; membros podem visualizar registros do espaço e só editar os próprios. O fluxo de convite da segunda pessoa será implementado na próxima etapa.

## Primeira versão
Autenticação, criação do espaço, diário alimentar, água, treinos com séries/repetições/carga, hábitos, sono, medidas e registro intestinal. Próximas etapas: convite de membro, gráficos, lembretes recorrentes e testes completos em celular.