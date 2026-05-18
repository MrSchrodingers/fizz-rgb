# Security Policy

> 🇧🇷 [Política de segurança em português abaixo](#política-de-segurança-pt-br)

## Supported versions

Only the latest minor release on `main` receives security fixes during the pre-1.0 phase.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately via one of:

1. **GitHub Security Advisories** — preferred. Use the *Report a vulnerability* button on the [Security tab](https://github.com/MrSchrodingers/fizz-rgb/security/advisories/new).
2. **Email** — `daniel@debt.com.br` with subject prefix `[fizz-rgb security]`.

Include, when possible:

- Affected version / commit SHA.
- Reproduction steps and proof-of-concept.
- Impact assessment (RCE, privilege escalation, data exposure, etc.).
- Suggested fix or mitigation, if any.

### What to expect

| Stage              | Target SLA      |
| ------------------ | --------------- |
| Acknowledgement    | 72 hours        |
| Initial assessment | 7 days          |
| Fix or workaround  | 30 days         |
| Public disclosure  | After fix ships |

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). Reporters are credited in the release notes unless they prefer to remain anonymous.

## Threat model and known limitations

`fizz-rgb` runs entirely on the user's machine and talks to a single USB HID device. It does **not** open network ports, accept remote input, or run as root.

That said, please review:

- **udev rule** (`tools/install-udev.sh`) installs `MODE=0666` for the K617 (idVendor `258a`, idProduct `0049`). This is a deliberate trade-off documented in the script — it grants every local user r/w access to that single device's HID interface. On multi-user systems, tighten to `GROUP=input` (or another shared group) and add only trusted users.
- **systemd-user unit** runs the daemon as the unprivileged user. It does not require `sudo`.
- **IPC** is a Unix socket under `$XDG_RUNTIME_DIR/fizz.sock` — accessible only to the owning user by default.
- **Profile / preset files** under `~/.config/fizz/` and browser `localStorage` are user-readable. Do not store secrets there.

---

## Política de segurança (PT-BR)

### Versões suportadas

Durante a fase pré-1.0, apenas a última minor release na `main` recebe correções de segurança.

| Versão  | Suportada |
| ------- | --------- |
| 0.1.x   | ✅        |
| < 0.1   | ❌        |

### Reportando uma vulnerabilidade

**Não** abra uma issue pública no GitHub para vulnerabilidades.

Reporte de forma privada:

1. **GitHub Security Advisories** — preferido. Use o botão *Report a vulnerability* na [aba Security](https://github.com/MrSchrodingers/fizz-rgb/security/advisories/new).
2. **Email** — `daniel@debt.com.br` com prefixo `[fizz-rgb security]`.

Inclua, quando possível:

- Versão afetada / SHA do commit.
- Passos de reprodução e prova de conceito.
- Avaliação de impacto (RCE, escalação de privilégio, exposição de dados, etc.).
- Sugestão de correção ou mitigação, se houver.

### O que esperar

| Etapa                | SLA alvo            |
| -------------------- | ------------------- |
| Confirmação          | 72 horas            |
| Avaliação inicial    | 7 dias              |
| Correção / workaround| 30 dias             |
| Divulgação pública   | Após a correção sair|

Seguimos [divulgação coordenada](https://pt.wikipedia.org/wiki/Divulga%C3%A7%C3%A3o_de_vulnerabilidades). Os reporters são creditados nas release notes, salvo se preferirem anonimato.

### Modelo de ameaça e limitações conhecidas

O `fizz-rgb` roda inteiramente na máquina do usuário e fala com um único dispositivo USB HID. Não abre portas de rede, não aceita input remoto e não roda como root.

Atenção, porém:

- **Regra udev** (`tools/install-udev.sh`) instala `MODE=0666` para o K617 (idVendor `258a`, idProduct `0049`). É um trade-off documentado no script — concede r/w a todos os usuários locais para essa única interface HID. Em sistemas multi-usuário, restrinja para `GROUP=input` (ou outro grupo compartilhado) e adicione apenas usuários confiáveis.
- **Unit systemd-user** roda o daemon como usuário não-privilegiado. Não exige `sudo`.
- **IPC** é um Unix socket em `$XDG_RUNTIME_DIR/fizz.sock` — acessível apenas ao dono do socket por padrão.
- **Arquivos de profile / preset** em `~/.config/fizz/` e `localStorage` do browser são legíveis pelo usuário. Não armazene segredos ali.
