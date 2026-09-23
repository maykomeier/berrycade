# BerryCade — Schema de configuração

Arquivo único: `/etc/berrycade/config.yaml` (YAML, versionado em git; cada
aplicação bem-sucedida = 1 commit). O schema executável está em
`berrycade/config/schema.py` (pydantic); este documento é a referência humana.

Regras gerais:

* **Nomes** de objetos (zona, interface, VLAN, endereço, serviço, VIP, pool,
  túnel): `[A-Za-z0-9_-]`, 1–31 caracteres, únicos dentro do tipo.
* **Referências** são por nome e validadas na hora de aplicar
  (ex.: política apontando para zona inexistente → erro, nada é aplicado).
  Renomear/remover um objeto em uso é recusado com a lista de quem o usa.
* **Ordem** de listas importa onde indicado (políticas, SNAT central).
* **Segredos** (senha PPPoE, PSK) ficam no arquivo (diretório 0700, root) e são
  mascarados (`"********"`) em toda resposta da API. Enviar `"********"` de volta
  numa edição significa "manter o valor atual".

```yaml
schema_version: 1

# ───────────────────────────── Sistema ─────────────────────────────
system:
  hostname: berrycade
  timezone: America/Sao_Paulo
  dns:
    servers: [8.8.8.8]          # upstreams do firewall e do dnsmasq
    use_wan_dns: false          # somar DNS recebido via PPPoE
    local_domain: lan
  admin:
    https_port: 443
    session_timeout: 3600       # segundos de inatividade
    confirm_timeout: 60         # janela anti-lockout após cada aplicação
  drift_autofix: true           # reaplica se o kernel divergir da config
  central_nat: false          # true = NAT só pela tabela snat_rules (NAT central); false = NAT em cada política

# ───────────────────────────── Zonas ───────────────────────────────
# Toda interface/VLAN/túnel pertence a exatamente uma zona.
zones:
  - name: lan
    description: Rede interna
    intrazone: allow            # allow | deny  (tráfego entre membros da zona)
    ids_mode: "off"             # off | alert | block

# ─────────────────────────── Interfaces ────────────────────────────
interfaces:                     # portas físicas
  - name: lan                   # nome lógico (referenciado por VLANs, VIPs…)
    device: eth0                # dispositivo Linux
    role: lan                   # lan | wan  (apenas informativo/UX)
    zone: lan
    alias: "LAN onboard"
    enabled: true
    mode: static                # static | dhcp | pppoe | none
    address: 10.0.0.99/24       # static
    gateway: 10.0.0.254         # static, opcional
    gateway_metric: 1000
    mtu: 1500
    allow_access: [https, ssh, ping]   # https | ssh | ping | dns | dhcp
    dhcp_server: null           # mesmo formato de vlans[].dhcp_server
    pppoe: null                 # só para mode: pppoe

  - name: wan
    device: eth1
    role: wan
    zone: wan
    mode: pppoe
    allow_access: []
    pppoe:
      username: usuario@provedor
      password: segredo
      auth: [pap, chap]         # protocolos aceitos (gera pap-secrets e chap-secrets)
      service_name: ""
      mtu: 1492
      default_route: true       # rota padrão via ppp0 (métrica 10)
      use_peer_dns: false
      lcp_echo_interval: 20
      lcp_echo_failure: 3

# ──────────────────────────── VLANs 802.1Q ─────────────────────────
# Cada VLAN vira a sub-interface <device-do-pai>.<vid> (ex.: eth0.10), roteada.
vlans:
  - name: users
    parent: lan                 # interfaces[].name
    vid: 10                     # 1–4094
    zone: users
    alias: "Usuários"
    enabled: true
    address: 192.168.10.1/24    # IP do firewall na VLAN (gateway dos clientes)
    mtu: 1500
    allow_access: [ping, dns, dhcp]
    dhcp_server:
      enabled: true
      range_start: 192.168.10.100
      range_end: 192.168.10.200
      lease_time: 12h           # formato dnsmasq: 30m, 12h, 1d
      dns_servers: []           # vazio = o próprio firewall
      domain: ""
      static_leases:
        - {mac: "aa:bb:cc:dd:ee:ff", ip: 192.168.10.10, hostname: nas}

static_routes:
  - {destination: 172.16.0.0/16, gateway: 10.0.0.1, interface: lan, metric: 100}

# ─────────────────────────── Objetos ───────────────────────────────
addresses:                      # pré-definido: "all" (0.0.0.0/0)
  - {name: srv-nas,   type: subnet, value: 192.168.10.10/32, comment: ""}
  - {name: dhcp-pool, type: range,  value: 192.168.10.100-192.168.10.200}
  - {name: servidores, type: group, members: [srv-nas]}

services:                       # pré-definidos: ALL, ALL_TCP, ALL_UDP, ALL_ICMP,
                                # HTTP, HTTPS, DNS, SSH, PING, NTP, SMTP, …
  - name: WEB-ALT
    protocol: tcp_udp           # tcp_udp | icmp | ip | group
    tcp: ["8080", "8443-8445"]
    udp: []
    icmp_type: null             # protocol: icmp (null = qualquer tipo)
    ip_protocol: null           # protocol: ip (número IANA)
    members: []                 # protocol: group
    comment: ""

ip_pools:                       # usados como NAT de origem em política/SNAT
  - {name: pool-pub, start: 200.1.1.10, end: 200.1.1.10}

virtual_ips:                    # port forwarding (DNAT); usar o nome como destino na política
  - name: vip-nas-https
    interface: wan              # interfaces[].name de entrada, ou "any"
    external_ip: ""             # vazio = qualquer IP da interface
    mapped_ip: 192.168.10.10
    protocol: tcp               # tcp | udp | tcp_udp
    external_port: "8443"       # porta ou faixa "a-b"
    mapped_port: "443"
    comment: ""

# ─────────────────────── Políticas (ordem importa) ─────────────────
policies:
  - id: 1                       # imutável, aparece nos logs e sessões (ct mark)
    name: LAN-Internet
    enabled: true
    src_zones: [lan]            # "any" = todas
    dst_zones: [wan]
    src_addr: [all]             # endereços / grupos
    dst_addr: [all]             # endereços / grupos / virtual IPs
    services: [ALL]
    action: accept              # accept | deny | reject
    nat:
      enabled: true             # NAT de origem na própria política
      pool: null                # null = IP da interface de saída (masquerade)
    log: true                   # registra início de sessão (deny sempre registra)
    comment: ""

# NAT central (opcional): aplicado somente com system.central_nat: true — nesse modo a opção NAT das
# políticas é ignorada. Configurações antigas que já tinham regras aqui são lidas com central_nat: true.
snat_rules:
  - id: 1
    enabled: true
    src_zones: [users]          # tipicamente uma VLAN
    src_addr: [all]
    out_interface: wan
    action: masquerade          # masquerade | snat | no-nat
    pool: null                  # obrigatório se action = snat
    comment: ""

# ───────────────────────────── VPN ─────────────────────────────────
vpn:
  ipsec:
    - name: matriz              # ≤ 10 chars → interface xfrm-matriz
      enabled: true
      remote_gateway: 200.200.200.200   # IP ou FQDN do peer
      local_interface: wan
      zone: vpn
      if_id: 1                  # atribuído automaticamente (XFRM if_id)
      auth:
        method: psk             # psk | cert
        psk: segredo-compartilhado
        local_id: ""            # vazio = IP local
        remote_id: ""           # vazio = remote_gateway
        local_cert: ""          # method: cert  → /etc/swanctl/x509/<nome>.pem
        ca_cert: ""             # method: cert  → /etc/swanctl/x509ca/<nome>.pem
      local_subnets: [192.168.10.0/24]
      remote_subnets: [172.16.50.0/24]
      advanced:                 # valores padrão sensatos, editáveis em "modo avançado"
        ike_version: 2
        ike_proposals: [aes256-sha256-modp2048, aes128-sha256-modp2048]
        esp_proposals: [aes256-sha256-modp2048, aes128-sha256-modp2048]
        ike_lifetime: 28800
        esp_lifetime: 3600
        dpd_delay: 30
        start_action: start     # start | trap | none
        force_encap: false

  tailscale:
    enabled: false
    hostname: berrycade
    zone: tailscale
    advertise_routes: [users]   # nomes de VLAN/interface cujas redes serão anunciadas
    extra_routes: []            # CIDRs adicionais
    accept_routes: false
    advertise_exit_node: false
    # a autenticação (login URL / auth key) é uma ação do painel, não fica no arquivo

# ─────────────────────────── IDS / IPS ─────────────────────────────
ids:
  enabled: true                 # chave geral; o modo efetivo é zones[].ids_mode
  rules:
    source: et/open
    auto_update: true           # timer diário
    disabled_sids: []
  home_net: []                  # vazio = todas as redes internas conhecidas
```

## Mapeamento para o kernel

| Objeto            | nftables / sistema                                               |
|-------------------|------------------------------------------------------------------|
| zona              | chain `z_<zona>` + vmap `iifname → zona`                          |
| par de zonas      | chain `z_<src>__<dst>` com as políticas aplicáveis, em ordem      |
| política          | regra com `ct mark set <id>` (+ bit 0x80000000 se NAT), log com prefixo `SW:A:<id>` / `SW:D:<id>` |
| endereço/grupo    | set anônimo `{ … }` expandido na regra                            |
| serviço           | `meta l4proto . th dport` / `icmp type`                           |
| virtual IP        | regra `dnat` em `prerouting` + endereço resolvido p/ `mapped_ip`  |
| NAT política      | `postrouting`: `ct mark & 0x80000000` → `masquerade` / `snat`     |
| IDS por zona      | chain `forward_ids` (prio 10) → `queue num 0-1|2-3 fanout,bypass`  |
| VLAN              | `.netdev` Kind=vlan + `.network` do pai com `VLAN=`               |
| túnel IPsec       | `.netdev` Kind=xfrm + conexão swanctl com `if_id_in/out`          |

## Banimento de dispositivos

```yaml
dhcp_bans:                      # MACs banidos: dnsmasq ignora o DHCP e o nftables
  - {mac: "aa:bb:cc:dd:ee:ff", comment: "notebook desconhecido"}   # descarta o tráfego
```

Na tela **Clientes DHCP**, o botão direito sobre um cliente oferece:
*Criar reserva* (gera `static_leases` na VLAN/interface correspondente),
*Revogar* (`dhcp_release` + remoção da lease; o dispositivo precisa pedir IP de novo) e
*Banir* (entrada em `dhcp_bans`).

## Perfis de segurança (Filtro Web, Inspeção SSL, IPS por política)

```yaml
policies:
  - id: 1
    # … campos da política …
    ips: alert                  # off | alert | block — só o tráfego desta política vai ao Suricata
    webfilter: escritorio       # perfil de filtro web (ou null)
    ssl_inspection: certificado # perfil de inspeção SSL (ou null)

webfilter_profiles:
  - name: escritorio
    categories:                 # ação POR CATEGORIA; categoria ausente = permitir
      adult: block
      gambling: block
      malware: block
      games: monitor            # libera, mas registra no log
    block_domains: [exemplo-proibido.com]   # inclui subdomínios
    allow_domains: [intranet.parceiro.com]  # exceções: vencem qualquer categoria
    block_bypass: true          # bloqueia DoT (853) e IPs de resolvedores DoH
    comment: ""

ssl_profiles:
  - name: certificado
    mode: certificate           # certificate = lê o SNI sem descriptografar | deep = ssl-bump
    exempt_categories: [bank, financial]    # nunca descriptografar (modo deep)
    exempt_domains: [gov.br]
    untrusted_certs: block      # deep: certificado inválido no servidor → bloquear
    block_quic: true            # UDP/443 rejeitado para forçar HTTPS via TCP

webfilter:
  auto_update: true             # listas atualizadas diariamente às 04:00
```

Sobreposição de listas: **block > monitor > allow**; `allow_domains` vence tudo.
Categorias (ids) e fontes: ver `CATALOG` em `berrycade/services/webfilter.py`
(UT1/CC BY-SA 4.0, Block List Project/Unlicense, HaGeZi/GPL-3.0).

Como é aplicado:

| Recurso | Mecanismo |
|---|---|
| Filtro Web (DNS) | DNS da origem da política é redirecionado (`nat prerouting`) para um dnsmasq dedicado ao perfil (porta 5301+n) |
| Monitorar | IPs resolvidos entram no set `wfm_<perfil>` (nftset do dnsmasq) e as conexões são logadas com prefixo `SW:M:<id>` |
| Anti-contorno | regras antes do accept: DoT 853 e `@wf_doh_ips` 443 descartados (`SW:W:<id>`) |
| Inspeção SSL | `ssl_redirect` reproduz a ordem das políticas (`fib daddr oifname`) e redireciona 80/443 ao Squid (portas 3200+2n) |
| IPS por política | bits 16-17 do `ct mark` → `queue` para a instância alert/block; conexões do proxy herdam via `tcp_outgoing_mark` |

## Backup completo (.swbk)

JSON com `config.yaml` (**incluindo senhas PPPoE/PSK**), administradores, tema e certificados
(IPsec, CA da inspeção SSL, HTTPS do painel). Opcionalmente cifrado com AES-256-GCM (chave
derivada da senha via scrypt). Restauração passa pela mesma aplicação atômica com janela anti-bloqueio.
