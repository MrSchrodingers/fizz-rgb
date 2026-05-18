# fizz-rgb

> 🇺🇸 [Read in English](README.md)

[![CI](https://github.com/MrSchrodingers/fizz-rgb/actions/workflows/ci.yml/badge.svg)](https://github.com/MrSchrodingers/fizz-rgb/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Testes: 129](https://img.shields.io/badge/tests-129%20passing-success)](packages)
[![Hardware: K617](https://img.shields.io/badge/hardware-Redragon%20Fizz%20K617-c4302b)](https://www.redragonzone.com/products/redragon-fizz-pro)

Controlador RGB no Linux para o **Redragon Fizz K617** (teclado mecânico 60% com fio, USB `258a:0049`, MCU Sinowealth SH68F90A). Cobre o buraco deixado pelo software oficial da Redragon que só roda no Windows.

## Destaques

- **Daemon + CLI + GUI Electron** com modelo 3D do teclado.
- **8 efeitos firmware-native** com engenharia reversa via capturas USB (rainbow, snake, waterfall, sine wave, star twinkle, rainbow blossom, wheel, static).
- **Controle per-key direto** via protocolo Sinodragon (HID feature report de 382 bytes).
- **12 animações de game** rodando no hardware real a 30 fps — Pong, Snake, Tetris (lateral), Matrix Rain, Breakout, Fireworks, DVD Bouncer, Heart Rate ECG, Equalizer, Rule 30, mais presets FPS Gamer e MMO Hotkeys.
- **22 presets built-in** (palavras, formas, padrões, gradientes, temas, games).
- **Persistência**: profiles em `~/.config/fizz/profiles.json`, patterns per-key em `localStorage` do browser, export/import portátil via `.fizzpattern.json`.
- **System tray**, auto-restore no boot, auto-resume quando o teclado reconecta, build em AppImage.
- **129/129 testes vitest** entre daemon, CLI, core e GUI.

## Arquitetura

```
┌─────────────┐ JSON-RPC 2.0  ┌────────────┐ HID feature reports  ┌──────────┐
│  fizz CLI   │ ───────────▶  │   fizzd    │ ────────────────────▶│  K617    │
└─────────────┘  Unix socket  │  (daemon)  │       58a:0049       │ teclado  │
┌─────────────┐               │            │                      └──────────┘
│  fizz-gui   │ ───────────▶  │ EffectEng. │
│ (Electron)  │               │ ProfileMgr │
└─────────────┘               └────────────┘
```

- `@fizz/core` — types compartilhados, encoders de protocolo, presets, animações.
- `fizzd` — único processo que segura o handle HID; roda as engines dos games.
- `fizz` — cliente CLI fino sobre o socket IPC.
- `fizz-gui` — Electron + React 19 + Three.js (R3F + drei) + Tailwind 4 + Zustand.

Veja [`docs/design/specs/2026-05-18-fizz-rgb-controller-design.md`](docs/design/specs/2026-05-18-fizz-rgb-controller-design.md) para o design completo, e [`docs/reverse-engineering/protocol.md`](docs/reverse-engineering/protocol.md) para o wire protocol.

## Requisitos

- Linux (testado no **Fedora 43**; outras distros provavelmente funcionam).
- Node.js **22+** e npm 10+.
- Um **Redragon Fizz K617** (USB `258a:0049`).
- Módulo `hidraw` no kernel (default em qualquer distro mainstream).

## Instalação

```bash
git clone https://github.com/MrSchrodingers/fizz-rgb.git /var/www/fizz-rgb
cd /var/www/fizz-rgb
./tools/install.sh        # builda, linka binários, instala unit systemd + regra udev
fizz daemon enable        # autostart no login
fizz status               # sanity check
fizz effect run fw-rainbow
```

O installer:

1. Roda `npm install && npm run build`.
2. Faz symlink de `fizz` e `fizzd` em `~/.local/bin` (garanta que está no `$PATH`).
3. Instala a unit systemd-user em `~/.config/systemd/user/fizzd.service`.
4. Instala a regra udev (exige `sudo`) — veja [SECURITY.md](SECURITY.md#modelo-de-ameaça-e-limitações-conhecidas) pros trade-offs.

Tira o teclado da tomada e reconecta uma vez após instalar.

### GUI

```bash
npm run dev -w fizz-gui              # desenvolvimento com hot reload
npm run build:appimage -w fizz-gui   # gera AppImage portátil
```

## Cheatsheet do CLI

```bash
fizz status                            # device + efeito ativo + daemon
fizz set <cor>                         # cor sólida (#RRGGBB ou nome)
fizz effect list
fizz effect run <nome> [--speed N] [--brightness N] [--color C] [--direction left|right]
fizz effect stop

fizz profile list
fizz profile save <key> --effect <nome> [opts]
fizz profile activate <key>
fizz profile delete <key>

fizz daemon {start|stop|restart|enable|disable|status|logs}
```

## Efeitos firmware-native

| Efeito                | Opções                                         |
| --------------------- | ---------------------------------------------- |
| `fw-static`           | `--color` (paleta limitada)                    |
| `fw-rainbow`          | `--speed`, `--brightness`, `--direction`       |
| `fw-snake`            | `--color`, `--speed`                           |
| `fw-sine-wave`        | `--speed`, `--brightness`                      |
| `fw-star-twinkle`     | `--color`, `--density`, `--speed`              |
| `fw-rainbow-blossom`  | `--speed`                                      |
| `fw-waterfall`        | `--color`, `--speed`                           |
| `fw-wheel`            | `--speed`, `--direction`                       |

Efeitos firmware sobrevivem ao disconnect (o K617 tem 8 slots gravados de fábrica).

## Per-key e games (streaming do host)

Patterns customizadas per-key e as 12 animações de game são computadas no host e enviadas pro teclado a 30 fps. Exigem o `fizzd` rodando. **Não** persistem na NVRAM do teclado — quando o daemon para, o teclado volta pro último efeito firmware.

Use a GUI pra pintar patterns, salvar presets do usuário, gravar timelines ou escolher do gallery de presets.

## Troubleshooting

| Sintoma                                              | Tente                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `fizz status` diz daemon offline                     | `fizz daemon start` (ou `systemctl --user start fizzd`). Logs: `fizz daemon logs --tail 50`.     |
| Permission denied em `/dev/hidraw*`                  | Rode `./tools/install-udev.sh` de novo, depois tira+coloca o teclado.                            |
| Daemon não acha o device                             | `lsusb \| grep 258a` deve mostrar seu K617. Se outro processo segura: `lsof /dev/hidrawN`.       |
| GUI mostra banner "disconnected"                     | Daemon não rodando, ou path do socket diferente. Confira `$XDG_RUNTIME_DIR/fizz.sock`.           |
| Warnings de `PCFSoftShadowMap` no Three.js           | Cosmético, interno do drei v10 — seguro ignorar até fix upstream.                                |

## Compatibilidade de hardware

| Modelo              | USB ID      | Status               | Notas                                                          |
| ------------------- | ----------- | -------------------- | -------------------------------------------------------------- |
| Redragon Fizz K617  | `258a:0049` | ✅ Totalmente suportado | 61 teclas, 8 efeitos firmware + per-key + games verificados.  |
| Outros Redragon 60% | —           | ❓ Desconhecido       | MCU da mesma família pode funcionar; PRs bem-vindas.            |

## Roadmap

- Mais presets (skyline urbano, semáforo, Pomodoro, heatmap de digitação, Tux, times de futebol).
- Mais games (Frogger, Whack-a-mole, Simon Says, Asteroids, Pinball, Pacman).
- Polish gráfico (motion blur, partículas no clique, fontes melhores nas teclas).
- Opcional: reatividade a áudio via PipeWire, troca automática de profile por app, hotkey global pra ciclar profiles.
- Stretch: persistência em NVRAM pra customs per-key (exige dump de firmware + Ghidra).

## Documentação

- [`docs/design/specs/`](docs/design/) — decisões de arquitetura e design.
- [`docs/design/plans/`](docs/design/) — planos de implementação (Phase 1, animações).
- [`docs/reverse-engineering/protocol.md`](docs/reverse-engineering/protocol.md) — anotações do wire protocol USB.

## Contribuindo

PRs bem-vindas! Leia [CONTRIBUTING.md](CONTRIBUTING.md) primeiro.

Ao contribuir você concorda em licenciar seu trabalho sob MIT e seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

## Segurança

Pra reportar vulnerabilidade, veja [SECURITY.md](SECURITY.md). **Por favor não abra issue pública pra bug de segurança.**

## Agradecimentos

- [OpenRGB issue #2172](https://gitlab.com/CalcProgrammer1/OpenRGB/-/issues/2172) — capturas USB iniciais dos efeitos firmware.
- [EvanSunde/Sinodragon](https://github.com/EvanSunde/Sinodragon) — referência do protocolo per-key pra família de MCU SH68F90A.
- [carlossless/sinowealth-kb-tool](https://github.com/carlossless/sinowealth-kb-tool) — tooling de firmware.

## Licença

[MIT](LICENSE) © Matheus Munhoz e contribuidores do fizz-rgb.
