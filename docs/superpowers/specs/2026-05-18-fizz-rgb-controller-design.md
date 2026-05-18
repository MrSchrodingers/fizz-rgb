# Design — Fizz RGB Controller

- **Data:** 2026-05-18
- **Autor:** Daniel (daniel@debt.com.br)
- **Status:** Draft (aguardando revisão final)
- **Target:** Redragon Fizz K617 (USB ID `258A:0049`) no Fedora Linux

## 1. Contexto e problema

O teclado Redragon Fizz K617 é um 60% com 61 LEDs RGB individuais. O software oficial de controle (cor, padrão, perfil, macro) só existe pra Windows. No Linux ele funciona como dispositivo de entrada genérico, mas não há controle de iluminação:

- OpenRGB **não suporta** o K617 (existe a issue [#2172](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172) aberta há tempos, com capturas USB anexadas mas sem implementação).
- `dokutan/rgb_keyboard` **não suporta** (issue [#30](https://github.com/dokutan/rgb_keyboard/issues/30) aberta, projeto pouco ativo desde 2021).
- `LeandroSQ/redragon-rgb-controller` é NodeJS, focado em Windows, não cobre o K617.
- `sinowealth-kb-tool` (carlossless) **suporta o K617 pra flash de firmware** (MCU SH68F90A/BYK916) mas não controla RGB.
- `smk` é firmware alternativo open-source pra MCUs SinoWealth, experimental, não suporta o K617 hoje.

**Objetivo:** entregar controle RGB rico do K617 no Fedora — daemon, CLI e GUI com modelo 3D do teclado, com base em reverse engineering próprio do protocolo USB HID.

## 2. Goals e Non-goals

### Goals

- Controle RGB completo do K617 no Fedora 43 (kernel 7.0+).
- Cobertura de efeitos firmware-native (rainbow, wave, snake, breathing, waterfall, sine wave, star twinkle, rainbow blossom, wheel).
- Per-key direct control (cor individual por tecla) via host streaming.
- GUI com modelo 3D interativo do teclado.
- Sistema de perfis com switching rápido.
- CLI completo pra automação/scripting.
- Daemon independente da GUI — efeito continua quando a GUI fecha.
- Código limpo o suficiente pra publicar no futuro (MIT/GPL).

### Non-goals

- Suporte a outros teclados ou outras marcas (escopo único é o K617).
- Suporte a mouses/headsets Redragon.
- Versão Windows ou macOS.
- Cloud sync de perfis.
- Marketplace de efeitos (hot-reload local cobre o caso real).
- Macro recording ou remapeamento de teclas (escopo é RGB).
- Sandboxing de plugins user-supplied no MVP (documentado como "trusted only" na Phase 3).

## 3. Decisões locked-in

| # | Decisão | Justificativa |
|---|---|---|
| D1 | Escopo MVP = per-key + custom effects (end-game) | Usuário priorizou ambição máxima |
| D2 | Motor = host streaming (PC envia frames 30–60fps) | Permite efeitos arbitrários reativos a qualquer fonte; wired, sem custo de bateria |
| D3 | Estrutura = daemon (systemd --user) + GUI Electron + CLI | Padrão profissional; GUI fecha sem parar efeito; CLI scriptable |
| D4 | Reverse engineering = só Linux, sem Windows VM | Restrição do usuário; abordagem em camadas (replay → fuzz → Ghidra → smk fallback) |
| D5 | Faseamento incremental com valor por release | Mitiga incerteza do RE; cada fase entrega algo usável |
| D6 | Stack = Node.js + Electron + React + R3F + ThreeJS | Stack único, menos manutenção, libs maduras pra GUI 3D |
| D7 | Distribuição = pessoal com código publicável | Foco em valor primeiro, polish de packaging só quando publicar |

## 4. Arquitetura

### 4.1 Visão geral

```
                     ┌──────────────────────────────────────┐
                     │  Hardware: Redragon Fizz K617 (258a:0049) │
                     └──────────────▲───────────────────────┘
                                    │ USB HID (hidraw)
                ┌───────────────────┴────────────────────┐
                │           fizzd (daemon Node)          │
                │  HID driver | Encoder | Engine | IPC   │
                └────▲───────────────────────────▲───────┘
                     │ JSON-RPC                  │ JSON-RPC
        ┌────────────┴──────────────┐  ┌─────────┴──────────────┐
        │   fizz (CLI Node)         │  │   fizz-gui (Electron)  │
        └───────────────────────────┘  │  React + R3F (3D)      │
                                       └────────────────────────┘
```

### 4.2 Componentes

- **`fizzd`** — daemon Node mantendo HID handle aberto, loop de efeitos (30–60fps), IPC server. Roda como `systemd --user`. Único dono do device.
- **`fizz`** — CLI Node fina (commander). Sem lógica de protocolo; só formata args e fala JSON-RPC com `fizzd`.
- **`fizz-gui`** — Electron com main+renderer. Main faz a ponte IPC com `fizzd`. Renderer = React + R3F. Não toca em HID.
- **`@fizz/core`** — package compartilhado: tipos TypeScript, schemas Zod, encoders de protocolo, helpers de cor, layout do K617, efeitos built-in.

### 4.3 Layout do repositório (npm workspaces)

```
fizz-rgb/
├── package.json                     # workspace root
├── tsconfig.base.json
├── packages/
│   ├── core/                        # @fizz/core
│   │   └── src/
│   │       ├── protocol.ts          # encoders HID
│   │       ├── ipc.ts               # schemas JSON-RPC (Zod)
│   │       ├── color.ts             # tipos + conversões
│   │       ├── layout.ts            # matriz K617 → LED index
│   │       └── effects/             # built-in effects
│   ├── daemon/                      # fizzd
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── hid.ts               # wrapper node-hid + reconnect
│   │   │   ├── engine.ts            # effect loop, frame scheduler
│   │   │   ├── profiles.ts
│   │   │   └── ipc-server.ts
│   │   └── systemd/fizzd.service
│   ├── cli/                         # fizz
│   │   └── src/{index.ts, ipc-client.ts}
│   └── gui/                         # fizz-gui (Electron)
│       ├── electron/{main.ts, preload.ts}
│       └── src/                     # renderer React
│           ├── App.tsx
│           ├── components/{Keyboard3D, KeyMesh, ColorPicker, EffectSelector, ProfileBar}
│           ├── stores/              # Zustand
│           └── three/               # geometria/material
├── docs/
│   ├── superpowers/specs/
│   ├── reverse-engineering/         # capturas, protocolo, notas
│   └── adr/
└── tools/                           # capture.sh, decode-frame.ts
```

### 4.4 Decisões locked-in dessa camada

- **TypeScript strict** em todos os packages.
- **Zod** valida 100% das mensagens IPC nos dois lados.
- **node-hid** como única dep HID, versão lockada.
- **Sem D-Bus no MVP** — porta aberta pra Phase 3+ (refator local).
- **Single owner do device:** só `fizzd` abre `/dev/hidraw*`.
- **`fizzd` roda como user, não root.** udev rule libera o `/dev/hidraw*` do K617 ao grupo `plugdev`.

## 5. Protocolo IPC e fluxo de dados

### 5.1 Transporte

- **Socket:** Unix domain socket em `$XDG_RUNTIME_DIR/fizz.sock` (fallback `/run/user/$UID/fizz.sock`). Permissão `0600`.
- **Wire format:** JSON-RPC 2.0, mensagens delimitadas por `\n` (LSP-lite).
- **Por que não HTTP/WebSocket?** Sem rede, sem CORS, isolamento via permissão de filesystem.
- **Por que não D-Bus?** Overkill pro MVP; debug mais simples com `nc -U`. Migração futura é local.

### 5.2 Métodos request/response

| Método | Params | Retorno |
|---|---|---|
| `device.status` | — | `{connected, vid, pid, firmware?, serial?}` |
| `device.setKeys` | `{frames: KeyColor[]}` | `{ok}` *(uso interno do engine)* |
| `effect.list` | — | `Effect[]` (nome, descrição, schema de parâmetros) |
| `effect.run` | `{name, params}` | `{ok}` |
| `effect.stop` | — | `{ok}` |
| `effect.current` | — | `{name, params, startedAt}` |
| `solid.set` | `{color}` | `{ok}` *(atalho)* |
| `profile.list` | — | `Profile[]` |
| `profile.activate` | `{name}` | `{ok}` |
| `profile.save` | `{name, profile}` | `{ok}` |
| `profile.delete` | `{name}` | `{ok}` |
| `daemon.version` | — | `{version, buildHash}` |
| `daemon.shutdown` | — | `{ok}` |
| `engine.subscribeFrames` | `{enabled: boolean}` | `{ok}` |

### 5.3 Notificações (server → client)

| Método | Quando |
|---|---|
| `device.changed` | Hotplug USB |
| `effect.changed` | Mudança de efeito |
| `profile.changed` | Ativação de perfil |
| `engine.frame` | A cada tick, apenas pra subscribers (preview 3D ao vivo) |
| `engine.error` | Efeito crashou |

### 5.4 Fluxos principais

**Mudar cor sólida pelo color picker:**
```
React onChange → IPC contextBridge → main process → JSON-RPC fizz.solid.set
→ fizzd valida (Zod) → engine.runEffect(solid) → encoder → hid.writeFrame
→ LED muda → fizzd responde {ok} → fizzd broadcast effect.changed
```
Alvo de latência: **< 50ms P95** click → LED.

**GUI assina frames pra renderizar o 3D:**
```
GUI → engine.subscribeFrames(true) → fizzd marca client_id
→ loop engine emite engine.frame pra subscribers → renderer atualiza
Zustand → R3F useFrame atualiza instanceColor.needsUpdate
→ modelo 3D anima sincronizado com teclado físico
GUI fecha → socket fecha → daemon remove subscriber (sem leak)
```

### 5.5 Reconexão

- CLI/GUI: reconnect com backoff exponencial (100ms → 1s → 5s, max 30s).
- Daemon: detecta unplug via `error` event do node-hid, retry a cada 2s, retoma último efeito quando volta.
- GUI offline-friendly: banner "Daemon offline" + botão "Iniciar daemon".

### 5.6 Segurança

- Socket `0600` no `$XDG_RUNTIME_DIR`.
- Zod valida toda mensagem entrando no daemon.
- Nenhuma execução de código arbitrário no MVP.
- Quando o plugin SDK chegar (Phase 3): scripts user-supplied rodam no processo do daemon, sem sandbox; documentado como "trusted plugins only".

## 6. Engine de efeitos e protocolo HID

### 6.1 O que se sabe hoje

- VID/PID confirmado: `0x258A:0x0049` (lsusb retornou "BY Tech Gaming Keyboard" — BY Tech é a OEM da Redragon).
- MCU: Sinowealth SH68F90A / BYK916.
- USB expõe 3 endpoints; o relevante pra RGB é o interface vendor HID (não o interface 0 de boot keyboard).
- Comandos firmware-native (rainbow, snake, etc) já capturados em formato bruto na issue OpenRGB #2172.

### 6.2 Assunções (validar na implementação)

- Comandos RGB via HID feature reports (`SET_REPORT`), pacotes de 64 bytes.
- Primeiro byte = report ID (`0x04`, `0x05` ou `0x07`).
- Per-key direct = header com opcode + sequência de pacotes carregando RGB de N teclas + commit final.
- Teclado aceita stream contínuo (30–60fps) sem precisar acordar bootloader.

### 6.3 Estratégia de reverse engineering em camadas

**Camada 1 — Replay dos pacotes da issue #2172**
- Extrair com `tshark`, enviar via `hidapi.write()`.
- Risco baixo, valor alto. Desbloqueia Fase 1 completa.

**Camada 2 — Bifurcação inteligente do report descriptor**
- `usbhid-dump -d 258a:0049 -es` pra mapear feature reports.
- Variar opcodes em bytes não-cobertos; observar LEDs.
- Risco médio, valor médio.

**Camada 3 — Dump de firmware + Ghidra**
- `sinowealth-kb-tool read --device fizz` → `firmware.bin`.
- Ghidra com loader 8051 + SDCC calling convention.
- Localizar handler de USB SETUP request → parser de feature report → mapa completo de opcodes.
- Risco alto (Ghidra com 8051 é trabalhoso), valor altíssimo.

**Camada 4 — `smk` custom firmware (fallback)**
- Porte do `smk` pro K617 (similar ao port pro E-YOOSO Z11).
- Flash via `sinowealth-kb-tool write`.
- **Risco de brick existe** (sem recovery sem programador SPI externo). Decisão consciente da Phase 3.

### 6.4 Modelo do engine

```typescript
// @fizz/core/src/effects/types.ts
export type Color = { r: number; g: number; b: number };  // 0..255
export type FrameBuffer = Color[];                         // length = 61

export interface EffectContext {
  t: number;          // ms desde início do efeito
  dt: number;         // ms desde último tick
  layout: KeyLayout;
  params: Record<string, unknown>;
}

export interface Effect<P = unknown> {
  name: string;
  paramsSchema: ZodSchema<P>;   // GUI gera form sozinha
  defaults: P;
  tick(ctx: EffectContext): FrameBuffer;
  init?(ctx: EffectContext): void;
  dispose?(): void;
}
```

### 6.5 Loop do daemon (esqueleto)

```typescript
class EffectEngine {
  run(effect: Effect, params: unknown) {
    this.stop();
    const validated = effect.paramsSchema.parse({ ...effect.defaults, ...params });
    this.startedAt = performance.now();
    effect.init?.({ t: 0, dt: 0, layout, params: validated });
    const tickInterval = 1000 / 60;
    this.loop = setInterval(() => this.tick(effect, validated), tickInterval);
  }

  private tick(effect: Effect, params: unknown) {
    const now = performance.now();
    const ctx = { t: now - this.startedAt, dt: now - this.lastTick, layout, params };
    this.lastTick = now;
    try {
      const frame = effect.tick(ctx);
      this.hid.writeFrame(frame);
      this.broadcastFrame(frame);
    } catch (err) {
      log.error(`Effect ${effect.name} crashed`, err);
      this.stop();
      this.broadcastError(effect.name, err);
    }
  }
}
```

### 6.6 Efeitos built-in (por fase)

**Phase 1 — firmware-passthrough (não precisa de per-key):**

Wrappers que programam o firmware uma vez (single-shot command) e saem. Daemon pode hibernar. Efeitos cobertos pelas capturas da issue #2172:

- `fw-rainbow` (params: `speed`, `brightness`, `direction`)
- `fw-snake` (params: `color`, `speed`)
- `fw-sine-wave` (params: `speed`, `brightness`)
- `fw-star-twinkle` (params: `color?`, `density`, `speed`)
- `fw-rainbow-blossom` (params: `speed`)
- `fw-waterfall` (params: `color`, `speed`)
- `fw-wheel` (params: `speed`, `direction`)
- `fw-static` (params: `color` — limitado às cores estáticas que o firmware suporta; cores arbitrárias só na Phase 3)

**Phase 3 — host-side (depende do encoder per-key):**

Loops de tick a 30–60fps, daemon sempre ativo:

- `solid` — cor única arbitrária em todas as teclas (qualquer hex).
- `rainbow` — gradiente HSV deslizante. Params: `speed`, `direction`, `saturation`, `value`.
- `wave` — onda senoidal de brilho. Params: `color`, `speed`, `wavelength`.
- `breathing` — fade in/out. Params: `color`, `periodMs`.
- `reactive-keypress` — escuta evdev `/dev/input/event*`; tecla pressionada acende + desbota. Params: `baseColor`, `hitColor`, `fadeMs`. **Demanda grupo `input`.**

### 6.7 Encoder

```typescript
// @fizz/core/src/protocol.ts
export function encodePerKeyFrame(frame: FrameBuffer): Buffer[];
export function encodeFirmwareEffect(name: FirmwareEffectName, params: FwParams): Buffer[];
```

Interface estável; implementação reescrita conforme RE avança.

### 6.8 Performance

- **Tick budget:** < 5ms (effect.tick + encode + USB write).
- **CPU alvo:** < 2% idle, < 5% rainbow.
- **Fallback automático:** se USB write < 30fps sustentável, GUI mostra "Throttled to 30fps (USB)".

### 6.9 Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Per-key não descoberto na Phase 3 | Sem efeitos custom de verdade | Phase 1+2 ainda entrega muito; fallback `smk` |
| USB stream cap < 30fps | Efeitos travados | Encoder negocia taxa, GUI exibe |
| Keyboard travar | Frustração | `device.reset` reabre handle; unplug físico documentado |
| Outro processo segurar device | Daemon falha ao abrir | udev rule + grupo plugdev; docs com `lsof /dev/hidraw*` |

## 7. GUI Electron + React + R3F

### 7.1 Estrutura Electron

- **Main** (`electron/main.ts`): BrowserWindow 1280×800 frameless, system tray (ícone reflete efeito ativo), single-instance lock, conexão JSON-RPC com `fizzd`, forward de events daemon ↔ renderer.
- **Preload** (`electron/preload.ts`): `contextBridge.exposeInMainWorld('fizz', { setSolid, runEffect, listProfiles, onFrame, ... })`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Renderer** — React 18 + Vite, fala só com `window.fizz.*`.

### 7.2 Stack do renderer

| Camada | Escolha | Razão |
|---|---|---|
| Bundler | Vite | Dev server instantâneo, HMR perfeito |
| UI | React 18 | Concurrent features ajudam quando 3D + UI rerenderizam |
| 3D | @react-three/fiber + @react-three/drei | Decidido; drei traz controls + InstancedMesh wrappers |
| Estado | Zustand | Leve, sem boilerplate. Stores: `device`, `effect`, `profile`, `frameBuffer` |
| Color | react-colorful | Color picker compacto |
| Forms | React Hook Form + Zod resolver | Schemas vêm dos efeitos; forms gerados automaticamente |
| Styling | Tailwind v4 + CSS variables | Theme via CSS vars; sem CSS-in-JS |
| Animação | Framer Motion | Transições suaves |
| Ícones | Lucide React | Limpo, tree-shakeable |

### 7.3 Layout principal

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ╔════╗ Fizz RGB           [● Connected]  [Profile: Gaming ▾]  [_ □ ✕]  │
├──────────────────────────────────────────────────────────────────────────┤
│  EFFECTS           │                                                     │
│  ● Solid           │         ┌──────────────────────────────────┐       │
│  ○ Rainbow         │         │    [ Modelo 3D do K617 ]         │       │
│  ○ Wave            │         │  (R3F Canvas, orbit controls)    │       │
│  ○ Breathing       │         │   teclas clicáveis individuais   │       │
│  ○ Reactive        │         │   cores ao vivo via subscribe    │       │
│  ─ FIRMWARE ─      │         └──────────────────────────────────┘       │
│  ○ FW Rainbow      │                                                     │
│  ○ FW Snake        │  PARAMETERS                                         │
│  ○ FW Waterfall    │   Color    ████  #ff8800   [picker]                 │
│                    │   Speed    ●━━━━━━━━━ 0.5                           │
│  PROFILES          │   Direction ◉ → ○ ←                                 │
│  ▸ Default         │   [Save as profile]   [Reset]                       │
│  ▸ Gaming (active) │                                                     │
│  ▸ Coding          │                                                     │
│  + New profile     │                                                     │
└────────────────────┴─────────────────────────────────────────────────────┘
```

### 7.4 O 3D

- **Modelagem:** 61 keycaps via `<Instances>` (drei wrapper de InstancedMesh) — uma draw call total. Geometria base: `<RoundedBox args={[1, 0.4, 1]} radius={0.08} />`. Layout 60% via `KeyLayout`.
- **Material:** `<MeshPhysicalMaterial>` com `transmission: 0.4`, `roughness: 0.3`, `emissive` ligado à cor do LED. Resultado: keycap translúcido brilhando por dentro.
- **Luz:** `<ambientLight intensity={0.3}>` + `<directionalLight>` 45° + `<Environment preset="city">` (drei). 1 luz dinâmica, resto baked.
- **Interação:** `onPointerOver` → highlight + tooltip; `onPointerDown` → seleção (Shift+click pra múltipla); drag-rect via raycast em plano XY pra seleção de zona. Seleção em Zustand store.
- **Cor ao vivo:** daemon broadcast `engine.frame` → Zustand → R3F `useFrame` → `instanceColor.needsUpdate = true`. < 0.5ms por update.
- **Câmera:** perspective vista showroom. `<OrbitControls enablePan={false} minPolarAngle={0.2} maxPolarAngle={π/2} />`. Botão "Reset view".

### 7.5 Geração automática de forms

Cada efeito declara `paramsSchema: ZodSchema<P>`. GUI introspeciona via `zod-to-json-schema` e renderiza:

| Zod type | UI control |
|---|---|
| `z.string().regex(/^#[0-9a-f]{6}$/i)` | Color picker |
| `z.number().min(a).max(b)` | Slider |
| `z.enum([...])` | Radio / Select |
| `z.boolean()` | Switch |
| `z.object({...})` | Fieldset agrupado |

Adicionar efeito = 0 código de UI.

### 7.6 Tema

- **Dark first** (`prefers-color-scheme` no boot, toggle disponível).
- Fundo `#0e0e12`, accent **= cor do efeito ativo** (UI reflete o LED), texto `#e8e8ed`.
- Tipografia: Inter (UI) + JetBrains Mono (valores).
- Cantos arredondados 12px. Microinteractions Framer Motion (fade 150ms, slide 200ms easeOut).

### 7.7 Tray + background

- Fechar janela **esconde no tray** (não fecha o app). Quit explícito via tray ou Ctrl+Q.
- Setting "Start on boot" → cria `~/.config/autostart/fizz-gui.desktop`.
- Daemon é **independente** — GUI fecha, efeito continua.

### 7.8 Acessibilidade

- Tab order definido em todos os controles.
- Atalho global `Ctrl+Shift+F` foca janela (electron-localshortcut).
- Color picker tem input hex direto.
- ARIA labels nos controles 3D (fallback list pra screen reader).

### 7.9 Fora do MVP

- Per-key paint via 3D (Phase 3, depende de RE)
- Marketplace de efeitos
- Cloud sync
- Layer system tipo Photoshop
- Audio reactivity dentro da GUI (Phase 4)

## 8. Storage, perfis e erros

### 8.1 Localização (XDG-compliant)

- **Config:** `~/.config/fizz/`
  - `config.toml` — settings globais
  - `profiles.json` — perfis
  - `effects/` — Phase 3, scripts custom
- **Cache:** `~/.cache/fizz/`
  - `device.json` — last-known state pra reconexão
  - `captures/` — dumps de RE (gitignored)
- **Logs:** `~/.local/state/fizz/`
  - `fizzd.log` — Pino, rotativo 7 dias
  - `gui.log`

### 8.2 Formato `profiles.json`

```json
{
  "version": 1,
  "active": "gaming",
  "profiles": {
    "default": {
      "name": "Default",
      "createdAt": "2026-05-18T11:00:00Z",
      "effect": { "name": "solid", "params": { "color": "#ffffff" } }
    },
    "gaming": {
      "name": "Gaming",
      "createdAt": "2026-05-18T11:05:00Z",
      "effect": { "name": "reactive-keypress", "params": { "baseColor": "#0a0a2a", "hitColor": "#ff3030", "fadeMs": 800 } }
    }
  }
}
```

- Schema Zod validado no boot.
- Migrations versionadas; backup `profiles.json.bak` antes de migrar.
- Save atômico: writeFile em tmp + rename.

### 8.3 Princípios de erro

1. Daemon nunca crasha por erro de efeito (`try/catch` em volta de `effect.tick`).
2. GUI nunca trava (IPC com timeout 3s + degradação graciosa).
3. Erros do usuário ≠ erros do sistema (params inválidos → JSON-RPC `-32602`; bug daemon → `-32603` + stack no log).

### 8.4 Tabela de cenários

| Cenário | Detecção | UI | Recuperação |
|---|---|---|---|
| Daemon não rodando | Main Electron (conexão falha) | Banner "Daemon offline" + botão | `systemctl --user start fizzd` |
| Device unplugado | Daemon (node-hid error) | Header "Disconnected" + tray cinza | Retry 2s, volta quando reconecta |
| Permissão negada `/dev/hidraw` | Daemon no boot | Banner + link docs/permissions.md | Script `tools/install-udev.sh` |
| Efeito custom crasha | Engine | Toast + reverte pra `solid` | Log com stack |
| `profiles.json` corrompido | Daemon no boot | Banner "Profiles invalid, loaded defaults" | Backup `.bak`, recria default |
| USB write timeout | Daemon | Tray pisca amarelo | `device.reset` |
| GUI desconectada do main | Renderer | Toast "Reconnecting…" | Reconnect automático |

### 8.5 Logging

- Pino com transports: dev = `pino-pretty`, prod = JSON rotativo.
- Levels: fatal, error, warn, info, debug, trace.
- `FIZZ_LOG_LEVEL=debug fizz daemon restart` pra troubleshooting.
- Logs nunca incluem dados pessoais. Capturas RE em diretório separado, opt-in.

## 9. Testing

### 9.1 Pirâmide

```
        ╱╲           E2E (Playwright + Electron) — 3-5 cenários
       ╱──╲          Integração (vitest + daemon real + fake-hid) — ~20
      ╱────╲         Unidade (vitest) — 100+ (encoders, color, effects, layout)
     ╱──────╲
```

### 9.2 Mock de hardware

- `packages/core/src/hid-mock.ts` — implementa interface node-hid em memória, guarda último frame escrito.
- Daemon aceita flag `--fake-hid`.

### 9.3 Tipos de teste

- **Effect tests:** dado `tick(ctx with t=500ms)`, retorna frame esperado. Determinístico (nada de `Date.now()` dentro do efeito; usa `ctx.t`).
- **IPC tests:** daemon real com socket temp + `--fake-hid`. Roundtrip CRUD.
- **E2E (Phase 2+):** Playwright dirige Electron, mocka `window.fizz` no preload.
- **RE tests:** `tools/decode-frame.ts` aceita hex, mostra interpretação. Snapshot tests garantem encoder gera byte-por-byte o que os caps registraram.

### 9.4 CI

- GitHub Actions: lint (eslint+prettier), typecheck (`tsc -b`), test (vitest), build (todos packages), e2e opcional (xvfb).
- Sem device real no CI — só fake-hid.

## 10. Quebra de fases

### Phase 1 — Daemon + CLI + efeitos firmware
- Scaffold workspace (TS, vitest, eslint, prettier)
- `@fizz/core`: tipos, layout, encoders firmware-effect validados contra captures #2172
- `daemon`: HID handle, IPC server, engine suportando modo "single-shot" (firmware-passthrough)
- `cli`: `set`, `effect`, `profile`, `status`
- udev rule + systemd unit + install script
- Efeitos firmware-passthrough da §6.6 funcionando (`fw-rainbow`, `fw-snake`, `fw-sine-wave`, `fw-star-twinkle`, `fw-rainbow-blossom`, `fw-waterfall`, `fw-wheel`, `fw-static`)
- **Critério:** `fizz effect run fw-rainbow` muda o teclado
- **Estimativa:** 2-3 sessões focadas (depende muito do RE)

### Phase 2 — GUI Electron + 3D
- Scaffold Electron + Vite + React + R3F
- Conexão IPC main↔daemon, contextBridge
- 3D do K617 com InstancedMesh, cores ao vivo
- Color picker + form auto-gerado dos schemas Zod
- Sidebar de efeitos + perfis
- Tray + background
- Tema dark com accent dinâmico
- **Critério:** GUI completa pros efeitos da Phase 1
- **Estimativa:** 3-4 sessões

### Phase 3 — Per-key + Plugin SDK (alto risco)
- Camada 2/3 de RE: report descriptor + Ghidra
- `encodePerKeyFrame` real
- Engine streaming 30–60fps com per-key
- Modo "Paint" na GUI: click em tecla, drag-rect, layer básico
- Efeitos host-side da §6.6 (`solid` arbitrário, `rainbow`, `wave`, `breathing`, `reactive-keypress`)
- `@fizz/effect-sdk` publicado
- Hot-reload de `~/.config/fizz/effects/`
- 3-4 efeitos custom adicionais (matrix rain, ripple from key, gradient by row)
- **Critério:** per-key direct funcionando + 1 efeito user-escrito carregando
- **Fallback se RE falhar:** Phase 3 vira "polish + porte parcial do `smk`"
- **Estimativa:** indefinida — 2 sessões se Camada 1/2 entregarem; semanas se cair no Ghidra

### Phase 4 — Reactivity + integrações
- Audio reactivity (PipeWire/Pulse loopback → FFT → cores)
- CPU/GPU temp como source
- Per-app profile auto-switch (X11 active window / Wayland)
- Notificação flash
- Hotkey global de trocar perfil
- Audio-reactive preview no 3D da GUI
- **Estimativa:** ongoing, features independentes

## 11. Open questions (resolver durante implementação)

1. **Daemon enable strategy:** começa com `systemctl --user enable fizzd` manual; autostart-em-boot vira flag em `fizz daemon enable`.
2. **node-hid backend:** testar libusb vs hidraw na Phase 1, escolher o mais estável pro K617.
3. **Bundling GUI:** Electron Forge + electron-builder pra AppImage local (Phase 2). Flatpak/RPM só pra publicação (post-MVP).

## 12. Referências

- OpenRGB issue #2172 — https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172
- dokutan/rgb_keyboard issue #30 — https://github.com/dokutan/rgb_keyboard/issues/30
- carlossless/sinowealth-kb-tool — https://github.com/carlossless/sinowealth-kb-tool
- carlossless/smk — https://github.com/carlossless/smk
- LeandroSQ/redragon-rgb-controller — https://github.com/LeandroSQ/redragon-rgb-controller
- React Three Fiber — https://docs.pmnd.rs/react-three-fiber
- drei helpers — https://github.com/pmndrs/drei
- node-hid — https://github.com/node-hid/node-hid
- JSON-RPC 2.0 — https://www.jsonrpc.org/specification
