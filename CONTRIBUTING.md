# Contribuindo com o fizz-rgb

> 🇺🇸 [English version](CONTRIBUTING.en.md)

Obrigado pelo interesse em contribuir! Este guia mostra como configurar seu ambiente, propor mudanças e abrir um PR que tenha grande chance de ser mergeado rápido.

## Sumário

- [Código de Conduta](#código-de-conduta)
- [Como reportar bugs](#como-reportar-bugs)
- [Como sugerir features](#como-sugerir-features)
- [Setup de desenvolvimento](#setup-de-desenvolvimento)
- [Workflow de contribuição](#workflow-de-contribuição)
- [Padrões de código](#padrões-de-código)
- [Testes](#testes)
- [Adicionando uma nova animação](#adicionando-uma-nova-animação)
- [Adicionando um novo game](#adicionando-um-novo-game)
- [Mensagens de commit](#mensagens-de-commit)

## Código de Conduta

Este projeto segue o [Code of Conduct](CODE_OF_CONDUCT.md). Ao participar, você concorda em respeitá-lo.

## Como reportar bugs

1. Confirme que está na última versão (`git pull` + `npm install`).
2. Verifique [issues existentes](https://github.com/MrSchrodingers/fizz-rgb/issues) — talvez já esteja reportado.
3. Abra uma nova issue usando o template **Bug Report**, incluindo:
   - Versão do `fizz` e do `fizzd` (`fizz --version`).
   - Distribuição e versão do kernel (`uname -a`).
   - Output de `lsusb | grep 258a`.
   - Logs do daemon (`fizz daemon logs --tail 100`).
   - Passos para reproduzir.

## Como sugerir features

Abra uma issue com o template **Feature Request** descrevendo:

- O problema que você está tentando resolver (não pule essa parte).
- Solução proposta.
- Alternativas consideradas.
- Impacto em compatibilidade / performance.

## Setup de desenvolvimento

### Pré-requisitos

- Node.js 22+ (recomendado via [nvm](https://github.com/nvm-sh/nvm) ou [fnm](https://github.com/Schniz/fnm))
- npm 10+
- Um teclado Redragon Fizz K617 (opcional — há mock de HID para desenvolvimento sem hardware)
- Linux com udev (`hidraw` habilitado, padrão em qualquer distro mainstream)

### Clonando e buildando

```bash
git clone https://github.com/MrSchrodingers/fizz-rgb.git
cd fizz-rgb
npm install
npm run build
npm test
```

### Rodando localmente

Daemon (em um terminal):

```bash
node packages/daemon/dist/index.js
```

CLI (em outro):

```bash
node packages/cli/dist/index.js status
```

GUI em modo dev (Vite + Electron com hot reload):

```bash
npm run dev -w fizz-gui
```

### Sem hardware

Defina a variável `FIZZ_MOCK_HID=1` antes de iniciar o daemon para usar o mock interno. Os comandos de efeito vão imprimir os pacotes que seriam enviados ao teclado.

```bash
FIZZ_MOCK_HID=1 node packages/daemon/dist/index.js
```

## Workflow de contribuição

1. Faça um fork e crie uma branch a partir de `main`:
   ```bash
   git checkout -b feat/nome-curto-descritivo
   ```
2. Faça commits pequenos e focados (veja [Mensagens de commit](#mensagens-de-commit)).
3. Garanta que todos os testes passam e que o build está limpo:
   ```bash
   npm run build && npm test && npm run lint
   ```
4. Atualize o `CHANGELOG.md` na seção `## [Unreleased]`.
5. Abra um Pull Request preenchendo o template.
6. Reaja aos comentários do review — não force-push sem necessidade; preferimos commits adicionais durante o review e squash no merge se necessário.

## Padrões de código

- TypeScript estrito (`tsconfig.base.json` é a fonte da verdade).
- ESLint + Prettier executam no CI; rode `npm run lint` e `npm run format` antes de commitar.
- Sem `any` exceto em casos justificados com comentário `// eslint-disable-next-line`.
- Imports usam extensão `.js` (resolução `Bundler` em TS).
- Nunca importe `@fizz/core/encoder` do renderer (Electron) — só do daemon, pois usa `node:fs`.

## Testes

- Vitest para tudo. Testes ficam em `packages/<x>/test/`.
- Cobertura mínima esperada: novos arquivos sem cobertura serão sinalizados no PR.
- Para mudanças no protocolo USB, adicione fixture em `packages/core/test/fixtures/` com o pacote esperado.

```bash
npm test                  # roda tudo
npm test -w @fizz/core    # apenas core
npm run test:watch        # watch mode
```

## Adicionando uma nova animação

Animações stateless (sem estado mutável entre frames) — exige 6 edições de arquivo:

1. `packages/core/src/animations.ts` — adicione ao `AnimType` union.
2. `packages/core/src/ipc.ts` — adicione ao `AnimTypeSchema` (z.enum).
3. `packages/gui/src/stores/paintStore.ts` — adicione ao `AnimType`.
4. `packages/gui/src/types/window.d.ts` — atualize `perkeyStartPattern`.
5. `packages/gui/src/components/PaintToolbar.tsx` — adicione ao array `ANIM_TYPES`.
6. `packages/gui/src/App.tsx` — adicione ao `validAnimTypes`.

Veja um exemplo procurando por `'chase'` no repo.

## Adicionando um novo game

Games têm estado mutável e rodam no daemon a 30fps:

1. Copie o padrão de `PongEngine` ou `SnakeEngine` em `packages/daemon/src/engine.ts`.
2. Implemente `step()` e `render(): Map<number, Color>`.
3. Adicione um `case` em `EffectEngine.startPattern`.
4. Adicione preset em `packages/core/src/presets.ts` com `keys:{}` vazio e o novo `animType`.
5. Adicione teste em `packages/daemon/test/engine.test.ts`.

## Mensagens de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<escopo opcional>): <descrição curta>

[corpo opcional explicando o porquê]

[footer opcional, ex: Closes #123]
```

Tipos:

- `feat` — nova funcionalidade
- `fix` — correção de bug
- `refactor` — mudança que não corrige bug nem adiciona feature
- `docs` — só documentação
- `test` — adição ou ajuste de testes
- `chore` — manutenção, deps, build, CI
- `perf` — melhoria de performance

Exemplos do histórico atual:

```
feat(gui): 3D polish — RoundedBox keycaps + bloom post-processing
fix(gui): allow saving game-animation presets even with empty keys map
docs(gui): clarify firmware-vs-PC persistence in sidebar labels
```

Por favor **não** inclua trailers `Co-Authored-By:` de assistentes de IA — créditos vão na descrição do PR se relevante.
