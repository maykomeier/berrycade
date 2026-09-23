# Changelog — BerryCade

## 1.0.14 — 2026-09-23

- Imagem: o boot passa a localizar as partições pelo UUID do sistema de arquivos (`root=UUID=`, fstab com `UUID=`), e não mais pelo ID do disco (PARTUUID), que pode ser alterado depois da gravação. Corrige o Pi parado em "Waiting for root file system".
- Nova logo BerryCade no painel (menu, topo, login), no favicon (inclui favicon.ico) e na página de bloqueio do filtro web.
- **O projeto passa a se chamar BerryCade.** Código em `/usr/lib/berrycade`, configuração em `/etc/berrycade`, dados em `/var/lib/berrycade` e `/var/log/berrycade`, releases em `/opt/berrycade`, serviços `berrycade-*`, CLI `berrycade`, tabela nftables `inet berrycade`, arquivo de primeiro boot `berrycade.txt`.
- Migração automática ao atualizar por firmware a partir da 1.0.x: os diretórios são movidos (com links de compatibilidade nos caminhos antigos), os serviços antigos são trocados pelos novos e a tabela nftables antiga é removida na mesma transação que cria a nova. Backups feitos antes da troca continuam sendo restaurados.
- Porta HTTPS do painel: a troca passa a valer na hora (o painel abre a porta nova ao aplicar e volta para a anterior se a alteração não for confirmada). Antes o acesso era perdido até reiniciar o equipamento.
- Janela anti-bloqueio: conexões já abertas com o painel são reavaliadas pelas regras novas antes da confirmação, que agora só acontece se o acesso continuar funcionando de fato. Antes uma conexão aberta confirmava até alterações que bloqueavam o acesso.
- A porta 80 sempre redireciona para a porta HTTPS configurada.

## 1.0.13 — 2026-09-23

- Imagem: corrige boot que parava em "(initramfs) PARTUUID ... does not exist" no primeiro uso. A expansão da partição agora é feita pelo primeiro boot do BerryCade, sem trocar o ID do disco; a imagem não leva mais o estado do cloud-init do equipamento de desenvolvimento.
- Equipamento de desenvolvimento: a versão exibida no painel (Firmware, rodapé do menu) é atualizada assim que um novo firmware é gerado, sem reiniciar o serviço.

## 1.0.12 — 2026-09-22

- Corrige gauges do painel que saíam do enquadramento acima de 50% (arco SVG desenhado pelo lado longo).
- Clientes Wi-Fi com nome do dispositivo (personalizado, DHCP, aprendido pelo AP ou DNS reverso da LAN), fabricante pelo MAC e identificação de MAC privado.
- Opção "Mostrar dicas" (Sistema › Configurações › Aparência); dicas com visual neutro, sem parecer mensagem de erro.
- Temas: botão "Definir como padrão de fábrica" no equipamento de desenvolvimento (defaults/ui.yaml acompanha firmware e imagens); "Restaurar padrão" usa esse tema.
- Novo menu WiFi: access points UniFi e clientes Wi-Fi monitorados por SSH (mca-dump), somente leitura e sem depender da controladora. APs são adicionados com IP, usuário e senha SSH — a senha é usada uma única vez para o firewall instalar a própria chave e não é armazenada.

## 1.0.11 — 2026-09-22

Primeira versão em produção no Raspberry Pi (Raspberry Pi OS Lite 64 bits / Debian 13).

**Base**
- Motor nftables puro (tabela `inet berrycade`) com aplicação atômica, rollback automático, janela
  anti-bloqueio de 60 s, versionamento git de cada alteração e verificação de drift config ↔ kernel.
- systemd-networkd (interfaces, VLANs 802.1Q, XFRM), dnsmasq (DNS/DHCP por VLAN), PPPoE via pppd (PAP/CHAP).
- Políticas zona → zona no modelo de firewall de mercado, objetos de endereço/serviço, Virtual IPs
  (port forwarding), IP pools, NAT na política e NAT de saída central.

**Segurança**
- IDS/IPS Suricata via NFQUEUE (fail-open), por zona e por política; ET Open com atualização diária;
  instância ajustada para ~1,2 GB RAM.
- Filtro Web por perfil com ação por categoria (permitir / monitorar / bloquear), listas UT1,
  Block List Project e HaGeZi, anti-contorno (DoT/DoH).
- Inspeção SSL: certificado (SNI, sem descriptografar) e profunda (ssl-bump) com CA própria e isenções.
- Hosts confiáveis para o painel/SSH (global no nftables e por administrador).

**VPN**
- IPsec site-to-site (strongSwan, route-based) com assistente; certificados; Tailscale com subnet router.

**Painel**
- Dashboard em tempo real (gauges, consumo WAN/LAN), clientes DHCP (reservar / revogar / banir),
  logs de tráfego, bloqueios, IDS e filtro web, sessões, auditoria.
- Serviços sob demanda com monitor inteligente; backup completo cifrado (.swbk) com senhas e certificados;
  tema personalizável; logo própria.

**Distribuição**
- Firmware assinado (.swfw, Ed25519) com instalação por upload, autoteste, verificação de saúde e rollback
  automático; versões lado a lado em /opt/berrycade/releases.
- Gerador de imagem (.img.xz) sem dados do equipamento de origem, com primeiro boot configurável (berrycade.txt).
- Assistente de configuração inicial: portas LAN/WAN por adaptador/MAC, LAN, WAN, identidade.
