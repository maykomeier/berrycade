# BerryCade

Firewall para Raspberry Pi (Raspberry Pi OS Lite 64 bits / Debian 13) com **nftables puro**,
PPPoE, VLANs 802.1Q, políticas zona→zona, NAT, IPsec (strongSwan), Tailscale e IDS/IPS (Suricata
via NFQUEUE) — gerenciado 100% pelo painel web.

## Acesso

`https://10.0.0.99/` — usuário `admin`, senha `admin` (troca obrigatória no primeiro login).
Certificado autoassinado gerado na instalação.

## Menu do painel

| Seção | Itens |
|---|---|
| Painel de Controle | gauges CPU/temperatura/memória/disco, consumo WAN e LAN, portas, serviços, IDS, bloqueios |
| Rede | Interfaces (físicas, VLANs, túneis), Zonas, Clientes DHCP (botão direito: reservar / revogar / banir), DNS, Rotas |
| Política & Objetos | Política de Firewall, Endereços, Serviços, Virtual IPs (port forwarding), IP Pools, NAT de saída |
| Perfis de Segurança | IDS / IPS (modo por zona, regras ET Open, CPU e filas NFQUEUE, alertas) |
| VPN | Túneis IPsec, Assistente IPsec, Certificados, Tailscale |
| Logs & Relatórios | Tráfego, Conexões bloqueadas, Eventos IDS/IPS, Sessões ativas, Auditoria, Logs do sistema |
| Sistema | Configurações, Administradores, Revisões/Backup, Serviços |

## Garantias de consistência

* Toda alteração: validação → render → `nft -c` → aplicação atômica → confirmação do navegador → commit git.
* Sem confirmação em 60 s (ex.: você se trancou para fora) → rollback automático.
* Reboot durante uma alteração não confirmada → sobe a última revisão confirmada.
* Verificador de drift a cada 60 s reaplica a configuração se o kernel divergir.

## Recuperação (console/SSH)

```
berrycade status          # serviços e revisão ativa
berrycade revisions       # histórico
berrycade rollback <rev>  # volta para uma revisão
berrycade apply           # reaplica config.yaml
berrycade reset-admin     # admin/admin
berrycade factory-reset   # configuração de fábrica
```

## Desenvolvimento

`BERRYCADE_DRYRUN=1 BERRYCADE_PORT=8443 venv/bin/python -m berrycade.main` sobe o painel sem tocar
no sistema (renderiza, valida e faz `nft -c`, mas não aplica).
