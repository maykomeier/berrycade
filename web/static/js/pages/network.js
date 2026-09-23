/* Rede: interfaces/VLANs, zonas, DNS, rotas estáticas, clientes DHCP. */
"use strict";
SW.ip = {
  toInt: (ip) => ip.split(".").reduce((a, o) => (a << 8) + (+o), 0) >>> 0,
  toStr: (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join("."),
  mask: (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0),
  cidrMask: (cidr) => { const p = +cidr.split("/")[1]; return SW.ip.toStr(SW.ip.mask(p)); },
  /* suggest a DHCP range (.100–.200 or proportional) for "a.b.c.d/nn" */
  range: (cidr) => {
    try {
      const [ip, p] = cidr.split("/"); const m = SW.ip.mask(+p); const net = SW.ip.toInt(ip) & m; const size = (~m >>> 0) + 1;
      if (size < 8) return null;
      const s = size >= 256 ? 100 : Math.floor(size / 2), e = size >= 256 ? 200 : size - 2;
      return [SW.ip.toStr(net + s), SW.ip.toStr(net + e)];
    } catch (e) { return null; }
  },
};

const ACCESS = [{ value: "https", label: "HTTPS" }, { value: "ssh", label: "SSH" }, { value: "ping", label: "PING" }, { value: "dns", label: "DNS" }, { value: "dhcp", label: "DHCP" }];
const zoneOpts = (extraNew) => () => [...(extraNew ? [{ value: "__new", label: "➕ Nova zona com o nome da VLAN" }] : []), ...SW.meta.zones.map((z) => ({ value: z, label: z }))];

const dhcpFields = (prefix, showIf) => [
  { type: "section", label: "Servidor DHCP", show: showIf },
  { key: `${prefix}.enabled`, label: "Habilitar DHCP", type: "bool", show: showIf },
  { key: `${prefix}.range_start`, label: "Início da faixa", placeholder: "automático", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled") },
  { key: `${prefix}.range_end`, label: "Fim da faixa", placeholder: "automático", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled") },
  { key: `${prefix}.lease_time`, label: "Tempo de concessão", placeholder: "12h", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled"), help: "ex.: 30m, 12h, 1d" },
  { key: `${prefix}.dns_servers`, label: "Servidores DNS", type: "list", placeholder: "vazio = o próprio firewall", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled") },
  { key: `${prefix}.domain`, label: "Domínio", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled") },
  { key: `${prefix}.static_leases`, label: "Reservas", type: "table", show: (v) => showIf(v) && SW.get(v, prefix + ".enabled"),
    cols: [{ key: "mac", label: "MAC", placeholder: "aa:bb:cc:dd:ee:ff" }, { key: "ip", label: "IP" }, { key: "hostname", label: "Nome" }] },
];

const fillDhcp = (obj, addrKey, dkey) => {
  const d = SW.get(obj, dkey);
  if (!d) return;
  if (!d.enabled) { if (!d.range_start) { d.range_start = ""; d.range_end = ""; } return; }
  if (!d.range_start || !d.range_end) { const r = SW.ip.range(SW.get(obj, addrKey) || ""); if (r) [d.range_start, d.range_end] = r; }
  d.lease_time = d.lease_time || "12h";
  d.static_leases = (d.static_leases || []).filter((l) => l.mac || l.ip);
};

SW.page("interfaces", {
  title: "Interfaces",
  async render(root) {
    await SW.loadMeta(true);
    const edit = (r) => (r._kind === "vlan" ? vlanDialog(r._obj) : r._kind === "interface" ? ifaceDialog(r._obj) : r._kind === "ipsec" ? (location.hash = "#/ipsec") : (location.hash = "#/tailscale"));
    const lp = SW.listPage(root, {
      title: "Interfaces",
      key: "_id",
      intro: "Portas físicas, sub-interfaces VLAN 802.1Q (roteadas, cada uma com sua faixa de IP e DHCP), túneis IPsec e Tailscale. Duplo clique para editar.",
      create: [{ label: "VLAN 802.1Q", fn: () => vlanDialog(null) }, { label: "Zona", fn: () => SW.pages.zones.dialog(null, () => lp.reload()) }],
      edit,
      canEdit: (r) => true,
      del: (r) => (r._kind === "vlan" ? SW.crud("vlans", "name").remove(r._obj, `VLAN ${r.name}`).then(() => lp.reload()) : SW.toast("Somente VLANs podem ser apagadas aqui", "err")),
      groupBy: (r) => r._group,
      groupOrder: ["Interface Física", "VLAN 802.1Q", "Túnel IPsec", "Tailscale"],
      columns: [
        { label: "Nome", get: (r) => `<b>${SW.esc(r.name)}</b>${r.alias ? `<div class="muted">${SW.esc(r.alias)}</div>` : ""}` },
        { label: "Tipo", get: (r) => SW.esc(r.type) },
        { label: "Dispositivo / Pai", get: (r) => `<span class="mono">${SW.esc(r.ifname)}</span>${r.parent ? ` <span class="muted">em ${SW.esc(r.parent)}</span>` : ""}` },
        { label: "IP/Máscara", get: (r) => (r.ips.length ? r.ips.map((x) => `<div class="mono">${SW.esc(x)}</div>`).join("") : `<span class="muted">${SW.esc(r.ipcfg || "—")}</span>`) },
        { label: "Zona", get: (r) => `<span class="chip accent">${SW.esc(r.zone)}</span>` },
        { label: "Acesso Administrativo", get: (r) => SW.chips((r.access || []).map((a) => a.toUpperCase())) },
        { label: "Faixa DHCP", get: (r) => (r.dhcp ? `<span class="mono">${SW.esc(r.dhcp)}</span>` : "") },
        { label: "Status", get: (r) => r.status, text: (r) => r.statusText },
        { label: "Ref.", get: (r) => (r._obj && r._obj._refs ? `<a>${r._obj._refs}</a>` : "0") },
      ],
      rowClass: (r) => (r.enabled === false ? "disabled" : ""),
      async load() {
        const [ifs, vlans, tunnels, st, ts] = await Promise.all([SW.GET("/api/config/interfaces"), SW.GET("/api/config/vlans"), SW.GET("/api/config/ipsec"), SW.GET("/api/interfaces/status"), SW.GET("/api/settings/tailscale")]);
        const stat = (name, enabled) => {
          const s = st[name] || {};
          if (enabled === false) return ["desabilitada", SW.badge("desabilitada", "off")];
          if (!s.exists) return ["ausente", SW.badge("inativa", "warn")];
          const up = s.operstate === "up" || s.operstate === "unknown" || s.carrier;
          return up ? ["up", SW.badge("up", "ok")] : ["down", SW.badge("down", "bad")];
        };
        const rows = [];
        ifs.forEach((i) => {
          const [t, b] = stat(i.name, i.enabled);
          rows.push({ _id: "i:" + i.name, _kind: "interface", _obj: i, _group: "Interface Física", name: i.name, alias: i.alias, enabled: i.enabled,
            type: `Física (${i.role.toUpperCase()}${i.mode === "pppoe" ? ", PPPoE" : i.mode === "dhcp" ? ", DHCP" : ""})`,
            ifname: i.mode === "pppoe" ? `${i.device} → ppp0` : i.device, ips: (st[i.name] || {}).addresses || [],
            ipcfg: i.mode === "static" ? i.address : i.mode, zone: i.zone, access: i.allow_access,
            dhcp: i.dhcp_server && i.dhcp_server.enabled ? `${i.dhcp_server.range_start}-${i.dhcp_server.range_end}` : "", status: b, statusText: t });
        });
        vlans.forEach((v) => {
          const [t, b] = stat(v.name, v.enabled);
          const par = ifs.find((i) => i.name === v.parent);
          rows.push({ _id: "v:" + v.name, _kind: "vlan", _obj: v, _group: "VLAN 802.1Q", name: v.name, alias: v.alias, enabled: v.enabled, type: `VLAN ${v.vid}`,
            ifname: par ? `${par.device}.${v.vid}` : "?", parent: v.parent, ips: (st[v.name] || {}).addresses || [], ipcfg: v.address, zone: v.zone,
            access: v.allow_access, dhcp: v.dhcp_server.enabled ? `${v.dhcp_server.range_start}-${v.dhcp_server.range_end}` : "", status: b, statusText: t });
        });
        tunnels.forEach((t) => {
          const [tt, b] = stat(t.name, t.enabled);
          rows.push({ _id: "t:" + t.name, _kind: "ipsec", _obj: t, _group: "Túnel IPsec", name: t.name, enabled: t.enabled, type: "IPsec (route-based)",
            ifname: `xfrm-${t.name}`, ips: [], ipcfg: `→ ${t.remote_subnets.join(", ")}`, zone: t.zone, access: [], status: b, statusText: tt });
        });
        if (ts.enabled) {
          const [tt, b] = stat("tailscale", true);
          rows.push({ _id: "ts", _kind: "tailscale", _obj: null, _group: "Tailscale", name: "tailscale", type: "Tailscale", ifname: "tailscale0",
            ips: (st.tailscale || {}).addresses || [], zone: ts.zone, access: ts.allow_access, status: b, statusText: tt });
        }
        return rows;
      },
    });

    function ifaceDialog(i) {
      const lanAddrChanged = (v) => i.role === "lan" && v.address !== i.address && location.hostname === (i.address || "").split("/")[0];
      SW.editDialog({
        title: `Editar interface ${i.name} (${i.device})`, size: "lg",
        value: { ...i, pppoe: i.pppoe || { username: "", password: "", auth: ["pap", "chap"], mtu: 1492, default_route: true, use_peer_dns: false, service_name: "", lcp_echo_interval: 20, lcp_echo_failure: 3 },
          dhcp_server: i.dhcp_server || { enabled: false, range_start: "", range_end: "", lease_time: "12h", dns_servers: [], domain: "", static_leases: [] } },
        fields: [
          { key: "alias", label: "Apelido" },
          { key: "role", label: "Papel", type: "select", options: [{ value: "lan", label: "LAN" }, { value: "wan", label: "WAN" }] },
          { key: "zone", label: "Zona", type: "select", options: zoneOpts(false) },
          { key: "enabled", label: "Status", type: "bool", text: "Habilitada" },
          { type: "section", label: "Endereçamento" },
          { key: "mode", label: "Modo", type: "select", options: [{ value: "static", label: "Manual (estático)" }, { value: "dhcp", label: "DHCP (cliente)" }, { value: "pppoe", label: "PPPoE" }, { value: "none", label: "Sem IP" }] },
          { key: "address", label: "IP/Máscara", placeholder: "10.0.0.99/24", show: (v) => v.mode === "static", live: true },
          { key: "gateway", label: "Gateway", placeholder: "opcional", emptyNull: true, show: (v) => v.mode === "static" },
          { key: "gateway_metric", label: "Métrica do gateway", type: "number", show: (v) => v.mode !== "pppoe" && v.mode !== "none", help: "A rota padrão via PPPoE usa métrica 10; valores maiores servem de backup." },
          { key: "pppoe.username", label: "Usuário PPPoE", show: (v) => v.mode === "pppoe" },
          { key: "pppoe.password", label: "Senha PPPoE", type: "password", show: (v) => v.mode === "pppoe" },
          { key: "pppoe.auth", label: "Autenticação", type: "checks", options: [{ value: "pap", label: "PAP" }, { value: "chap", label: "CHAP" }], show: (v) => v.mode === "pppoe" },
          { key: "pppoe.service_name", label: "Service name", placeholder: "opcional", show: (v) => v.mode === "pppoe" },
          { key: "pppoe.mtu", label: "MTU PPPoE", type: "number", show: (v) => v.mode === "pppoe" },
          { key: "pppoe.default_route", label: "Rota padrão", type: "bool", text: "Instalar rota padrão via PPPoE", show: (v) => v.mode === "pppoe" },
          { key: "pppoe.use_peer_dns", label: "DNS do provedor", type: "bool", text: "Usar DNS recebido", show: (v) => v.mode === "pppoe" },
          { key: "mtu", label: "MTU", type: "number" },
          { type: "section", label: "Acesso administrativo" },
          { key: "allow_access", label: "Permitir", type: "checks", options: ACCESS, help: "Serviços do próprio firewall acessíveis por esta interface." },
          ...dhcpFields("dhcp_server", (v) => v.mode === "static"),
        ],
        note: i.role === "lan" ? "⚠ Alterações na interface pela qual você acessa o painel são protegidas: se o navegador não confirmar em 60 s, a configuração anterior é restaurada." : "",
        async onSave(v) {
          if (v.mode !== "pppoe") v.pppoe = i.pppoe || null;
          if (v.mode === "static" && v.dhcp_server.enabled) fillDhcp(v, "address", "dhcp_server");
          else v.dhcp_server = i.dhcp_server ? { ...i.dhcp_server, enabled: false } : null;
          if (lanAddrChanged(v)) return SW.pages.interfaces.changeMgmtIp(i, v);
          await SW.crud("interfaces", "name").update(i.name, v);
          lp.reload();
        },
      });
    }

    function vlanDialog(v) {
      const isNew = !v;
      const val = v ? SW.clone(v) : { name: "", alias: "", parent: SW.meta.interfaces.find((n) => n === "lan") || SW.meta.interfaces[0], vid: null, zone: "__new", enabled: true, address: "", mtu: 1500,
        allow_access: ["ping", "dns", "dhcp"], dhcp_server: { enabled: true, range_start: "", range_end: "", lease_time: "12h", dns_servers: [], domain: "", static_leases: [] } };
      SW.editDialog({
        title: isNew ? "Nova VLAN 802.1Q" : `Editar VLAN ${v.name}`, size: "lg", value: val,
        note: isNew ? "A VLAN vira a sub-interface <span class='mono'>&lt;porta&gt;.&lt;VLAN ID&gt;</span>, roteada pelo firewall. Por padrão ganha uma zona própria: o tráfego para outras zonas só passa se houver política." : "",
        fields: [
          { key: "name", label: "Nome", required: true, placeholder: "ex.: usuarios", disabled: !isNew && v._refs > 0 },
          { key: "alias", label: "Apelido" },
          { key: "parent", label: "Interface física", type: "select", options: () => SW.meta.interfaces },
          { key: "vid", label: "VLAN ID", type: "number", required: true, placeholder: "1–4094" },
          { key: "zone", label: "Zona", type: "select", options: zoneOpts(isNew) },
          { key: "enabled", label: "Status", type: "bool", text: "Habilitada" },
          { key: "address", label: "IP/Máscara", required: true, placeholder: "192.168.10.1/24", help: "IP do firewall nesta VLAN (gateway dos clientes)." },
          { key: "mtu", label: "MTU", type: "number" },
          { type: "section", label: "Acesso administrativo" },
          { key: "allow_access", label: "Permitir", type: "checks", options: ACCESS },
          ...dhcpFields("dhcp_server", () => true),
        ],
        async onSave(o) {
          fillDhcp(o, "address", "dhcp_server");
          if (o.zone === "__new") {
            if (!SW.meta.zones.includes(o.name)) await SW.apply(SW.POST("/api/config/zones", { name: o.name, description: `VLAN ${o.vid}`, intrazone: "allow", ids_mode: "off" }), { silent: true });
            o.zone = o.name;
          }
          const c = SW.crud("vlans", "name");
          if (isNew) await c.create(o); else await c.update(v.name, o);
          await SW.loadMeta(true);
          lp.reload();
        },
      });
    }
  },
  /* Management IP change: apply, then ask the admin to open the new address and confirm there. */
  async changeMgmtIp(i, v) {
    const r = await SW.PUT(`/api/config/interfaces/${i.name}`, v);
    const ip = v.address.split("/")[0];
    SW.modal({ title: "Confirme no novo endereço", body: `<p>O IP de gerência mudou para <b class="mono">${SW.esc(ip)}</b>.</p>
      <p>Abra <a href="https://${SW.esc(ip)}/" target="_blank">https://${SW.esc(ip)}/</a>, faça login e clique em <b>Confirmar</b> na faixa amarela em até <b>${r.confirm_timeout || 60} s</b>.
      Caso contrário, o endereço anterior é restaurado automaticamente.</p>`, buttons: [{ label: "Fechar" }] });
  },
});

/* ── Zonas ── */
SW.page("zones", {
  title: "Zonas",
  dialog(z, done) {
    const isNew = !z;
    SW.editDialog({
      title: isNew ? "Nova zona" : `Editar zona ${z.name}`,
      value: z ? SW.clone(z) : { name: "", description: "", intrazone: "allow", ids_mode: "off" },
      fields: [
        { key: "name", label: "Nome", required: true },
        { key: "description", label: "Descrição" },
        { key: "intrazone", label: "Tráfego intra-zona", type: "select", options: [{ value: "allow", label: "Permitir" }, { value: "deny", label: "Bloquear" }], help: "Tráfego entre interfaces da mesma zona sem precisar de política." },
        { key: "ids_mode", label: "IDS/IPS", type: "select", options: [{ value: "off", label: "Desligado" }, { value: "alert", label: "Alerta (IDS)" }, { value: "block", label: "Bloqueio (IPS inline)" }] },
      ],
      async onSave(o) { const c = SW.crud("zones", "name"); if (isNew) await c.create(o); else await c.update(z.name, o); await SW.loadMeta(true); done && done(); },
    });
  },
  async render(root) {
    await SW.loadMeta(true);
    const lp = SW.listPage(root, {
      title: "Zonas", key: "name",
      intro: "Cada interface, VLAN ou túnel pertence a uma zona. As políticas de firewall são escritas entre zonas.",
      create: () => this.dialog(null, () => lp.reload()), edit: (z) => this.dialog(z, () => lp.reload()),
      del: (z) => SW.crud("zones", "name").remove(z).then(() => lp.reload()),
      columns: [
        { label: "Nome", get: (z) => `<b>${SW.esc(z.name)}</b>` },
        { label: "Descrição", get: (z) => SW.esc(z.description) },
        { label: "Membros", get: (z) => SW.chips(SW.meta.members.filter((m) => m.zone === z.name).map((m) => `${m.name} (${m.ifname})`)) },
        { label: "Intra-zona", get: (z) => (z.intrazone === "allow" ? SW.badge("permitir", "ok") : SW.badge("bloquear", "bad")) },
        { label: "IDS/IPS", get: (z) => (z.ids_mode === "block" ? SW.badge("bloqueio", "bad") : z.ids_mode === "alert" ? SW.badge("alerta", "warn") : SW.badge("off", "off")) },
        { label: "Ref.", get: (z) => z._refs },
      ],
      load: () => SW.GET("/api/config/zones"),
    });
  },
});

/* ── DNS ── */
SW.page("dns", {
  title: "DNS",
  async render(root) {
    const sys = await SW.GET("/api/settings/system");
    root.innerHTML = `<div class="page"><div class="page-head"><h2>DNS</h2></div>
      <div class="card" style="max-width:760px"><div class="body" id="f"></div><div class="modal-foot"><button class="btn primary" id="save">Aplicar</button></div></div></div>`;
    const fm = SW.form([
      { key: "dns.servers", label: "Servidores DNS", type: "list", placeholder: "8.8.8.8", help: "Encaminhadores usados pelo firewall e pelos clientes (via dnsmasq)." },
      { key: "dns.use_wan_dns", label: "DNS do provedor", type: "bool", text: "Somar os DNS recebidos via PPPoE" },
      { key: "dns.local_domain", label: "Domínio local", help: "Nomes de clientes DHCP resolvem como <i>host.domínio</i>." },
    ], sys);
    SW.$("#f", root).appendChild(fm.el);
    SW.$("#save", root).onclick = async () => { try { await SW.apply(SW.PUT("/api/settings/system", fm.get())); } catch (e) { SW.fail(e); } };
  },
});

/* ── Rotas estáticas ── */
SW.page("routes", {
  title: "Rotas estáticas",
  async render(root) {
    await SW.loadMeta(true);
    const dlg = (r) => SW.editDialog({
      title: r ? "Editar rota" : "Nova rota estática",
      value: r ? SW.clone(r) : { destination: "", gateway: "", interface: SW.meta.interfaces[0], metric: 100 },
      fields: [
        { key: "destination", label: "Destino", placeholder: "172.16.0.0/16", required: true },
        { key: "gateway", label: "Gateway", placeholder: "10.0.0.1", emptyNull: true },
        { key: "interface", label: "Interface", type: "select", options: () => [...SW.meta.interfaces, ...SW.meta.vlans] },
        { key: "metric", label: "Métrica", type: "number" },
      ],
      async onSave(o) { const c = SW.crud("static_routes", "destination"); if (r) await c.update(r.destination, o); else await c.create(o); lp.reload(); },
    });
    const lp = SW.listPage(root, {
      title: "Rotas estáticas", key: "destination", create: () => dlg(null), edit: dlg,
      del: (r) => SW.crud("static_routes", "destination").remove(r).then(() => lp.reload()),
      columns: [
        { label: "Destino", get: (r) => `<span class="mono">${SW.esc(r.destination)}</span>` },
        { label: "Gateway", get: (r) => `<span class="mono">${SW.esc(r.gateway || "—")}</span>` },
        { label: "Interface", get: (r) => SW.esc(r.interface) },
        { label: "Métrica", get: (r) => r.metric },
      ],
      load: () => SW.GET("/api/config/static_routes"),
    });
  },
});

/* ── Clientes DHCP (right-click: reservar, revogar, banir) ── */
SW.page("dhcp", {
  title: "Clientes DHCP",
  async render(root) {
    await SW.loadMeta(true);
    const scopes = async () => {
      const [ifs, vlans] = await Promise.all([SW.GET("/api/config/interfaces"), SW.GET("/api/config/vlans")]);
      return [...ifs, ...vlans].filter((x) => x.dhcp_server && x.dhcp_server.enabled).map((x) => ({ value: x.name, label: `${x.name} (${x.address})`, net: x.address }));
    };
    const reserve = async (c) => {
      const sc = await scopes();
      if (!sc.length) return SW.toast("Nenhuma interface com servidor DHCP habilitado", "err");
      SW.editDialog({
        title: "Criar reserva DHCP",
        note: "O dispositivo passará a receber sempre o mesmo IP. A reserva é gravada na configuração da interface/VLAN.",
        value: { mac: c ? c.mac : "", ip: c ? c.ip : "", hostname: c ? c.hostname : "", interface: (c && c.interface) || sc[0].value },
        fields: [
          { key: "mac", label: "Endereço MAC", required: true, disabled: !!c },
          { key: "ip", label: "IP reservado", required: true },
          { key: "hostname", label: "Nome", placeholder: "opcional" },
          { key: "interface", label: "Interface / VLAN", type: "select", options: sc },
        ],
        async onSave(o) { await SW.apply(SW.POST("/api/dhcp/reserve", o)); lp.reload(); },
      });
    };
    const unreserve = async (c) => { if (await SW.confirm(`Remover a reserva de <b>${SW.esc(c.mac)}</b> (${SW.esc(c.ip)})?`, { ok: "Remover", danger: true })) { try { await SW.apply(SW.DEL(`/api/dhcp/reserve/${c.mac}`)); lp.reload(); } catch (e) { SW.fail(e); } } };
    const revoke = async (c) => {
      if (!(await SW.confirm(`Revogar a concessão de <b>${SW.esc(c.hostname || c.mac)}</b> (${SW.esc(c.ip)})?<br><span class="muted">O dispositivo perde o IP e precisa solicitar outro. Sessões ativas são encerradas.</span>`, { ok: "Revogar", danger: true }))) return;
      try { await SW.POST("/api/dhcp/revoke", { mac: c.mac }); SW.toast("Concessão revogada", "ok"); lp.reload(); } catch (e) { SW.fail(e); }
    };
    const ban = (c) => SW.editDialog({
      title: "Banir dispositivo",
      note: `O firewall deixará de responder DHCP para <b class="mono">${SW.esc(c.mac)}</b> e descartará todo o tráfego vindo deste MAC.`,
      value: { mac: c.mac, comment: c.hostname || "" },
      fields: [{ key: "mac", label: "MAC", disabled: true }, { key: "comment", label: "Motivo / comentário" }],
      async onSave(o) { await SW.apply(SW.POST("/api/dhcp/ban", o)); lp.reload(); },
    });
    const unban = async (c) => { try { await SW.apply(SW.DEL(`/api/dhcp/ban/${c.mac}`)); lp.reload(); } catch (e) { SW.fail(e); } };

    const lp = SW.listPage(root, {
      title: "Clientes DHCP", key: "mac", autoRefresh: 10,
      intro: "Clique com o botão direito em um dispositivo para <b>criar reserva</b>, <b>revogar</b> a concessão ou <b>banir</b>.",
      buttons: [
        { label: `${SW.icon.pin} Criar reserva`, needSel: true, fn: (c) => c && reserve(c) },
        { label: `${SW.icon.x} Revogar`, needSel: true, fn: (c) => c && (c.type === "lease" ? revoke(c) : SW.toast("Sem concessão ativa", "err")) },
        { label: `${SW.icon.ban} Banir`, needSel: true, fn: (c) => c && (c.banned ? unban(c) : ban(c)) },
        { label: `${SW.icon.plus} Reserva manual`, fn: () => reserve(null) },
      ],
      ctx: (c) => [
        c.reserved ? { label: "Remover reserva", icon: SW.icon.pin, onClick: () => unreserve(c) } : { label: "Criar reserva…", icon: SW.icon.pin, onClick: () => reserve(c), disabled: !c.ip },
        { label: "Revogar concessão", icon: SW.icon.x, onClick: () => revoke(c), disabled: c.type !== "lease" },
        "-",
        c.banned ? { label: "Remover banimento", icon: SW.icon.ban, onClick: () => unban(c) } : { label: "Banir dispositivo…", icon: SW.icon.ban, danger: true, onClick: () => ban(c) },
      ],
      groupBy: (c) => c.interface || "Sem interface",
      rowClass: (c) => (c.banned ? "disabled" : ""),
      columns: [
        { label: "", width: "28px", get: (c) => `<span class="dot ${c.online ? "ok" : "off"}" title="${c.online ? "online" : "offline"}"></span>`, sort: (c) => (c.online ? 0 : 1) },
        { label: "Endereço IP", get: (c) => `<span class="mono">${SW.esc(c.ip || "—")}</span>`, sort: (c) => (c.ip ? SW.ip.toInt(c.ip) : 0) },
        { label: "MAC", get: (c) => `<span class="mono">${SW.esc(c.mac)}</span>` },
        { label: "Nome do host", get: (c) => SW.esc(c.hostname || "") },
        { label: "Tipo", get: (c) => [c.banned ? SW.badge("banido", "bad") : "", c.reserved ? SW.badge("reservado", "info") : "", c.type === "lease" ? SW.badge("dinâmico", "ok") : ""].join(" ") },
        { label: "Expira em", get: (c) => (c.remaining != null ? SW.fmtDur(c.remaining) : c.type === "lease" ? "infinito" : "—"), sort: (c) => c.remaining ?? 1e12 },
      ],
      load: () => SW.GET("/api/dhcp/clients"),
    });
  },
});
