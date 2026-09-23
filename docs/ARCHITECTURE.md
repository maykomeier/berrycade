# BerryCade — Arquitetura

Firewall para Raspberry Pi OS Lite 64 bits (Debian 13 "trixie"), com nftables
puro como motor e gerência 100% via painel web.

## Princípio central: uma única fonte de verdade

```
 Painel web ──HTTP/JSON──▶ API FastAPI ──▶ config.yaml (candidato)
                                              │ validação (pydantic + referências cruzadas)
                                              ▼
                                         renderizadores ──▶ arquivos gerados (staging)
                                              │ nft -c (dry-run), swanctl/suricata checks
                                              ▼
                                         aplicação atômica (nft -f em 1 transação,
                                         networkd reload, dnsmasq, pppd, swanctl, suricata)
                                              │
                         ┌─── falhou? ───────┴───── ok ───┐
                         ▼                                ▼
               rollback automático             janela de confirmação (anti-lockout):
               p/ última revisão boa           o navegador confirma que ainda alcança
                                               a API; sem confirmação em 60 s → rollback
                                                          ▼
                                                commit git em /etc/berrycade
```

* O kernel **nunca** é alterado fora do motor de aplicação. A API não executa
  `nft add rule` pontual: sempre regera a tabela inteira `inet berrycade` e a
  substitui numa única transação (`delete table` + `table` no mesmo arquivo).
* A cada 60 s um verificador de *drift* compara o hash de
  `nft -s list table inet berrycade` com o hash gravado na última aplicação.
  Divergência → evento de log e reaplicação automática da revisão ativa.
* No boot, `berrycade-firewall.service` carrega o último `.nft` gerado
  **antes** de `network-pre.target` (sem depender de Python). Em seguida
  `berrycade-api.service` sobe e reaplica a configuração completa.

## Estrutura de diretórios

```
/usr/lib/berrycade/               código (este repositório)
├── bin/
│   ├── berrycade                     CLI de recuperação (apply, rollback, reset-admin, status, rules-update)
│   └── berrycade-suricata            lançador da instância Suricata por modo/fila
├── defaults/
│   └── config.yaml                 configuração de fábrica
├── docs/
│   ├── ARCHITECTURE.md
│   └── SCHEMA.md                   schema do arquivo de configuração
├── berrycade/                        pacote Python
│   ├── main.py                     app FastAPI, montagem de rotas e arquivos estáticos
│   ├── settings.py                 caminhos e constantes
│   ├── logutil.py                  log estruturado (JSON → journald)
│   ├── config/
│   │   ├── schema.py               modelos pydantic (fonte do schema)
│   │   ├── builtins.py             objetos pré-definidos (serviços, endereço "all")
│   │   ├── validate.py             validação de referências cruzadas
│   │   └── store.py                leitura/gravação/versionamento git/lock
│   ├── render/                     config → arquivos de sistema (funções puras)
│   │   ├── nftables.py
│   │   ├── networkd.py             interfaces físicas, VLANs 802.1Q, xfrm (IPsec)
│   │   ├── dnsmasq.py              DHCP + DNS por VLAN
│   │   ├── pppoe.py                peer do pppd + pap/chap-secrets
│   │   ├── swanctl.py              túneis IPsec
│   │   └── suricata.py             instâncias IDS (alert) / IPS (block)
│   ├── apply/
│   │   └── engine.py               transação: render → check → apply → confirm/rollback
│   ├── services/                   integração em tempo de execução (status/leitura)
│   │   ├── system.py (métricas + amostrador de throughput)  conntrack.py  traffic.py
│   │   ├── ids.py  ipsec.py  tailscale.py  dhcp.py (leases/revogar)  drift.py
│   └── api/                        rotas REST
│       ├── auth.py        login, sessões, CSRF, administradores
│       ├── config_api.py  CRUD genérico das seções, settings, apply/confirm, revisões, backup
│       ├── monitor.py     dashboard, status de interfaces, clientes DHCP, sessões, logs
│       └── security.py    IDS/IPS, assistente IPsec, certificados, Tailscale
├── systemd/                        units instaladas em /etc/systemd/system
├── web/static/                     SPA (HTML/CSS/JS puro, sem build e sem dependências externas)
│   ├── js/core.js                  API+CSRF, modais, menu de contexto, formulários, tabela agrupada
│   ├── js/charts.js                gauges e gráficos de barras em SVG
│   └── js/pages/*.js               uma página por item de menu
└── venv/                           virtualenv Python

/etc/berrycade/                   (0700, root) repositório git de configuração
├── config.yaml                     configuração ativa (versionada, 1 commit por aplicação)
├── admins.yaml                     administradores (hash scrypt)
├── tls/                            certificado HTTPS do painel
└── generated/                      último conjunto de arquivos aplicado com sucesso
    ├── nftables.nft
    └── …

/var/lib/berrycade/               estado: sessões, hash de drift, métricas IDS
/var/log/berrycade/               traffic.json (ulogd), audit.log
```

## Arquivos de sistema gerados

| Destino                                         | Gerado por          | Aplicado com                          |
|-------------------------------------------------|---------------------|---------------------------------------|
| `/etc/berrycade/generated/nftables.nft`       | render/nftables.py  | `nft -f` (transação atômica)          |
| `/etc/systemd/network/50-berrycade-*.{netdev,network}` | render/networkd.py | `networkctl reload` + `reconfigure` |
| `/etc/berrycade/generated/dnsmasq.conf`       | render/dnsmasq.py   | restart `berrycade-dnsmasq`             |
| `/etc/ppp/peers/berrycade-wan`, `*-secrets`       | render/pppoe.py     | restart `berrycade-pppoe`               |
| `/etc/swanctl/conf.d/berrycade.conf`              | render/swanctl.py   | `swanctl --load-all`                  |
| `/etc/berrycade/generated/suricata-*.yaml`    | render/suricata.py  | restart `berrycade-suricata@{alert,block}` |
| `defaults/ulogd.conf` (NFLOG → JSON)            | fixo                | `berrycade-ulogd`                       |

## Pilha de rede

* **systemd-networkd** substitui o NetworkManager (config determinística gerada).
* **LAN** = `eth0` (onboard). VLANs = `eth0.<vid>`, cada uma com zona, IP e DHCP próprios.
* **WAN** = `eth1` (USB RTL8153), PPPoE via `pppd` (plugin `pppoe.so`) → `ppp0`.
  O adaptador inicia em modo "CD de driver"; uma regra udev faz o `usb_modeswitch`.
* Rota padrão: PPPoE com métrica 10; gateway estático da LAN (10.0.0.254) com
  métrica 1000, usado apenas enquanto a WAN não estiver ativa.
* **IPsec**: strongSwan (swanctl), *route-based* com interfaces XFRM
  (`xfrm-<túnel>`) — cada túnel se comporta como interface/zona, como no modelo
  de firewall de mercado. Rotas para as redes remotas via networkd.
* **Tailscale**: `tailscaled` com `--netfilter-mode=off`; o nftables do
  BerryCade é a única autoridade. `tailscale0` pertence à zona `tailscale`.

## Modelo do nftables (tabela `inet berrycade`)

```
input      policy drop   lo, established, ICMP essencial, "acesso administrativo"
                         por interface (https/ssh/ping/dns/dhcp), IKE/ESP, tailscale
forward    policy drop   established/related → accept (com contabilização)
                         vmap iifname → chain zona_origem
                            chain z_<src>: vmap oifname → chain z_<src>__<dst>
                               regras de política em ordem (seq), cada uma:
                               ct mark set <id | NAT-bit>, log opcional, accept/drop/reject
                            fim: implicit deny (log "SW:D:0")
forward_ids prio 10      zonas em modo alert → queue 0-1 (fanout,bypass)
                         zonas em modo block → queue 2-3 (fanout,bypass)
prerouting (dnat)        Virtual IPs (port forwarding)
postrouting (srcnat)     ct mark & NAT-bit → masquerade / snat para IP pool
mangle forward           MSS clamping para ppp0
```

O `bypass` do NFQUEUE garante *fail-open* se o Suricata cair (tráfego não para).

## IDS/IPS

Duas instâncias Suricata independentes (template systemd), cada uma lendo
suas próprias filas NFQUEUE:

* `berrycade-suricata@alert` — filas 0-1, regras ET Open com ação `alert` (nunca bloqueia).
* `berrycade-suricata@block` — filas 2-3, mesmas regras reescritas para `drop`.

Cada zona escolhe `off | alert | block`. Só sobe a instância que tem ao menos uma
zona usando o modo. Atualização diária do ET Open via `berrycade-rules-update.timer`.

## Segurança do painel

* HTTPS obrigatório (certificado autoassinado gerado na instalação), porta 443.
* Login obrigatório; senhas com scrypt; sessão em cookie `HttpOnly; Secure; SameSite=Strict`
  + header anti-CSRF; troca de senha obrigatória no primeiro login (admin/admin).
* O painel só é acessível nas interfaces com `https` em `allow_access`.
