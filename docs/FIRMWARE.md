# BerryCade — Firmware e imagens

## Papéis dos equipamentos

| | Desenvolvimento | Produção |
|---|---|---|
| Código | `/usr/lib/berrycade` é um diretório comum (cópia de trabalho) | `/usr/lib/berrycade` → link para `/opt/berrycade/releases/<versão>` |
| Gera firmware / imagem | sim (Sistema › Desenvolvimento) | não |
| Instala firmware por upload | não | sim (Sistema › Firmware) |
| Chave de assinatura | privada em `/etc/berrycade-dev/signing.key` (0600) | só a pública em `/etc/berrycade-firmware/trusted/` |

## Firmware (`.swfw`)

Arquivo tar com `manifest.json` (versão, notas, pacotes do sistema, sha256 do conteúdo, id da chave),
`manifest.sig` (assinatura **Ed25519** do manifesto) e `payload.tar.gz` (código + wheels Python para
instalação offline). Qualquer byte alterado invalida o pacote.

**Fluxo de instalação na produção** (`berrycade-update.service`, fora do processo do painel):

1. verifica assinatura, hash, arquitetura e versão mínima exigida;
2. instala pacotes apt que faltarem (exige internet só se houver pacote novo);
3. monta a versão em `/opt/berrycade/releases/<versão>` com venv próprio (offline);
4. **autoteste**: a versão nova carrega a configuração atual, valida, gera tudo e faz `nft -c` — nada é aplicado;
5. troca o link atomicamente, instala units/udev/sysctl da versão e reinicia o painel;
6. aguarda `/api/health` (só local) responder com a nova versão e aplicação ok em até 120 s;
7. se falhar em qualquer etapa → volta o link para a versão anterior automaticamente.

O tráfego da rede não é interrompido: as regras nftables continuam carregadas no kernel durante a troca.
São mantidas as 3 últimas versões; qualquer uma pode ser reativada pelo painel.

**Boa prática:** aumente a versão (campo "Versão" ao gerar) sempre que o código mudar. Duas compilações
com a mesma versão e código diferente confundem o histórico dos equipamentos em campo.

## Imagem (`.img.xz`)

Gerada no equipamento de desenvolvimento (`bin/berrycade-image-build`, serviço `berrycade-image-build`), que pode
ser qualquer máquina ARM64 (um Raspberry Pi ou a VM no Proxmox). A imagem é **montada do zero** com `mmdebstrap`
a partir dos repositórios oficiais do Debian 13 e do `archive.raspberrypi.com` (chave pública em
`defaults/rpi/raspberrypi-archive-keyring.pgp`); nada é copiado do equipamento que gera:

- sistema equivalente ao Raspberry Pi OS Lite: kernels `linux-image-rpi-v8` (Pi 3/4) e `linux-image-rpi-2712`
  (Pi 5), `raspi-firmware` (partição de boot), `raspberrypi-sys-mods`, `rpi-eeprom`, `vcgencmd`, firmware Realtek
  para adaptadores USB-Ethernet e swap em zram; `config.txt` em `defaults/rpi/config.txt`;
- initramfs com `MODULES=most` (a imagem roda em hardware diferente do que a gerou);
- partições montadas por **UUID do sistema de arquivos** (`root=UUID=` no `cmdline.txt` e no `fstab`), não por
  PARTUUID — o ID do disco pode mudar entre a gravação e o primeiro boot;
- usuário `berrycade` com a senha do equipamento de desenvolvimento (troca obrigatória no primeiro login, se
  marcado); chaves SSH do servidor geradas no primeiro boot; `machine-id` = uninitialized;
- instala a versão atual em modo produção e confia na chave pública deste equipamento; a partição raiz cresce
  até o tamanho do cartão no primeiro boot (`berrycade-firstboot`);
- ao final, o sistema de arquivos é desmontado de verdade e verificado com `e2fsck -fn`: qualquer erro faz a
  geração falhar;
- grava `berrycade.txt` na partição de boot (editável no Windows antes de ligar):

```
hostname=berrycade
lan_address=10.0.0.98/24
lan_gateway=10.0.0.254
dns=8.8.8.8
```

No primeiro acesso web (admin/admin → troca obrigatória de senha) abre o **assistente de configuração
inicial**: escolha das portas LAN/WAN (identificadas por adaptador e MAC, fixadas por MAC), IP da LAN,
WAN (PPPoE/DHCP/IP fixo), hostname e fuso.

Gravação: Raspberry Pi Imager → "Use custom" → arquivo `.img.xz` (não use as opções de personalização do
Imager, a configuração vem do `berrycade.txt`). Cartão de 8 GB ou maior.

## Migração do nome antigo (RPI-Secwall 1.0.x)

Unidades com a 1.0.x ainda usam o atualizador antigo, que espera `python -m secwall.selftest`,
`bin/secwall-system-install` e o serviço `secwall-api`. Os firmwares BerryCade mantêm esses pontos de entrada:

- `secwall/selftest.py` delega para `berrycade.selftest`, lendo a configuração em `/etc/rpi-secwall` se a unidade
  ainda não foi migrada;
- `bin/secwall-system-install` executa `berrycade.migrate --legacy-updater`, que para os serviços `secwall-*`,
  move os diretórios (deixando links nos caminhos antigos), remove arquivos gerados com o nome antigo, instala os
  serviços `berrycade-*` e cria um `secwall-api.service` provisório que reinicia o `berrycade-api`;
- o manifesto continua com `format: rpi-secwall-firmware`, que o verificador antigo exige (o novo aceita os dois).

Quando o atualizador antigo termina, o `berrycade-api` remove as unidades provisórias no próximo início.

## Imagem para Proxmox VE (ARM64)

Gerada em Sistema › Desenvolvimento › "Gerar imagem para Proxmox ARM64" (`bin/berrycade-vm-build`, serviço
`berrycade-vm-build`). Assim como a imagem do Raspberry, é uma instalação nova de Debian 13 arm64 feita com `mmdebstrap`:

- disco GPT de 4 GB: partição EFI (FAT32, 256 MB) + raiz ext4, montadas por UUID;
- kernel genérico `linux-image-arm64` (VirtIO), GRUB EFI no caminho removível (`EFI/BOOT/BOOTAA64.EFI`), então
  o OVMF/AAVMF encontra o boot sem entrada na NVRAM;
- `net.ifnames=0` (placas `eth0`, `eth1`), console em `ttyAMA0` e `tty0`, `qemu-guest-agent`;
- usuário `berrycade` com a senha deste equipamento (troca obrigatória no primeiro login, se marcado);
  chaves SSH do servidor geradas no primeiro boot;
- release assinado instalado em `/opt/berrycade/releases`, igual à imagem do Pi; `berrycade.txt` fica na
  partição EFI e a partição raiz cresce até o tamanho do disco no primeiro boot.

No Proxmox (ARM64): crie a VM com BIOS **OVMF (UEFI)**, máquina `virt`, sem disco, e duas placas **VirtIO**
(`net0` = LAN, `net1` = WAN, de preferência com o firewall do Proxmox desligado). Depois importe o disco:

```bash
qm importdisk <vmid> berrycade-<versão>-proxmox-arm64.qcow2 <storage>
```

Anexe o disco importado (SCSI/VirtIO), coloque-o como primeiro na ordem de boot e aumente o tamanho se quiser
(a partição cresce sozinha no primeiro boot).
