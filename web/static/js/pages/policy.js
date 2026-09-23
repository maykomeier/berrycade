/* Política & Objetos */
"use strict";
const ANY = (arr, anyWord) => (arr || []).includes(anyWord) ? `<span class="chip">${anyWord}</span>` : SW.chips(arr);

SW.page("policies", {
  title: "Política de Firewall",
  async render(root) {
    await SW.loadMeta(true);
    // read once: SW.meta is dropped after every apply (e.g. a drag & drop move) and rebuilt lazily
    const central = !!SW.meta.central_nat;
    let view = SW.pref("polview", "pair");
    let counters = {};
    const c = SW.crud("policies", "id");
    const zones = () => [{ value: "any", label: "any (todas)" }, ...SW.meta.zones.map((z) => ({ value: z, label: z }))];
    const dlg = (p, { cloneOf, before } = {}) => {
      const isNew = !p || cloneOf;
      const base = cloneOf ? { ...SW.clone(cloneOf), id: null, name: cloneOf.name + "-copia" } : p ? SW.clone(p) :
        { name: "", enabled: true, src_zones: [], dst_zones: [], src_addr: ["all"], dst_addr: ["all"], services: ["ALL"], action: "accept", nat: { enabled: false, pool: null }, log: true, comment: "" };
      base.nat.pool = base.nat.pool || "__null";
      base.ips = base.ips || "off"; base.webfilter = base.webfilter || "__null"; base.ssl_inspection = base.ssl_inspection || "__null";
      SW.editDialog({
        title: isNew ? "Nova política" : `Editar política ${p.id}`, size: "lg", value: base,
        fields: [
          { key: "name", label: "Nome", required: true },
          { key: "src_zones", label: "Zona de origem", type: "multi", options: zones, exclusive: ["any"], required: true },
          { key: "dst_zones", label: "Zona de destino", type: "multi", options: zones, exclusive: ["any"], required: true },
          { key: "src_addr", label: "Origem", type: "multi", options: () => SW.meta.addresses, exclusive: ["all"] },
          { key: "dst_addr", label: "Destino", type: "multi", options: () => [...SW.meta.addresses, ...SW.meta.virtual_ips.map((v) => ({ value: v, label: v + " (VIP)" }))], exclusive: ["all"], help: "Use um Virtual IP como destino para liberar um port forwarding." },
          { key: "services", label: "Serviço", type: "multi", options: () => SW.meta.services, exclusive: ["ALL"] },
          { key: "action", label: "Ação", type: "select", options: [{ value: "accept", label: "ACEITAR" }, { value: "deny", label: "NEGAR (descartar)" }, { value: "reject", label: "REJEITAR (responder)" }] },
          { type: "section", label: "Opções da política", show: (v) => v.action === "accept" },
          { type: "html", show: (v) => v.action === "accept" && central,
            html: `<div class="note" style="margin:0">NAT central ativo: a tradução de origem é definida em <a href="#/snat">Política &amp; Objetos › NAT central</a>, não na política.</div>` },
          { key: "nat.enabled", label: "NAT", type: "bool", text: "Traduzir origem (SNAT)", show: (v) => v.action === "accept" && !central },
          { key: "nat.pool", label: "Endereço de saída", type: "select", show: (v) => v.action === "accept" && v.nat.enabled && !central,
            options: () => [{ value: "__null", label: "IP da interface de saída" }, ...SW.meta.ip_pools.map((x) => ({ value: x, label: "IP pool: " + x }))] },
          { key: "log", label: "Registrar tráfego", type: "bool", text: "Registrar início das sessões permitidas", show: (v) => v.action === "accept" },
          { type: "section", label: "Perfis de segurança", show: (v) => v.action === "accept" },
          { key: "ips", label: "IPS", type: "select", show: (v) => v.action === "accept",
            options: [{ value: "off", label: "Desligado" }, { value: "alert", label: "Alerta (IDS — só registra)" }, { value: "block", label: "Bloqueio (IPS inline)" }] },
          { key: "webfilter", label: "Filtro Web", type: "select", show: (v) => v.action === "accept",
            options: () => [{ value: "__null", label: "— nenhum —" }, ...SW.meta.webfilter_profiles.map((x) => ({ value: x, label: x }))],
            help: "Filtra por domínio (DNS). Com inspeção SSL, também pelo SNI/URL." },
          { key: "ssl_inspection", label: "Inspeção SSL", type: "select", show: (v) => v.action === "accept",
            options: () => [{ value: "__null", label: "— nenhuma —" }, ...SW.meta.ssl_profiles.map((x) => ({ value: x.name, label: `${x.name} (${x.mode === "deep" ? "profunda" : "certificado"})` }))] },
          { type: "section", label: "Geral" },
          { key: "comment", label: "Comentário", type: "textarea" },
          { key: "enabled", label: "Status", type: "bool", text: "Habilitada" },
        ],
        async onSave(o) {
          o.nat.pool = o.nat.pool === "__null" ? null : o.nat.pool;
          o.webfilter = o.webfilter === "__null" || o.action !== "accept" ? null : o.webfilter;
          o.ssl_inspection = o.ssl_inspection === "__null" || o.action !== "accept" ? null : o.ssl_inspection;
          if (o.action !== "accept") o.ips = "off";
          if (!o.src_zones.length || !o.dst_zones.length) throw new SW.ApiError(422, { message: "informe zona de origem e de destino", errors: [] });
          if (isNew) {
            delete o.id;
            const r = await c.create(o);
            if (before) {
              const list = await SW.GET("/api/config/policies");
              const created = list[list.length - 1];
              await SW.apply(SW.POST(`/api/config/policies/${created.id}/move`, { before: before.id }), { silent: true });
            }
          } else await c.update(p.id, o);
          lp.reload();
        },
      });
    };
    const move = async (p, dir) => {
      const list = lp.state.rows;
      const i = list.findIndex((x) => x.id === p.id), j = i + dir;
      if (j < 0 || j >= list.length) return;
      try { await SW.apply(SW.POST(`/api/config/policies/${p.id}/move`, dir < 0 ? { before: list[j].id } : { after: list[j].id }), { silent: true }); lp.reload(); } catch (e) { SW.fail(e); }
    };
    const toggle = async (p) => { try { await c.update(p.id, { ...p, enabled: !p.enabled }); lp.reload(); } catch (e) { SW.fail(e); } };
    const pairLabel = (p) => `${p.src_zones.join(", ")} → ${p.dst_zones.join(", ")}`;
    const lp = SW.listPage(root, {
      title: "Política de Firewall", key: "id",
      headExtra: `<div class="btn-group"><button class="btn sm" data-v="pair">Por par de zonas</button> <button class="btn sm" data-v="seq">Por sequência</button></div>`,
      intro: "As políticas são avaliadas de cima para baixo dentro de cada par de zonas; o primeiro acerto decide. O que não casar com nenhuma política é descartado (negação implícita, registrada no log). Para mudar a ordem, arraste a linha (ou use as setas).",
      create: () => dlg(null), edit: (p) => dlg(p), clone: (p) => dlg(null, { cloneOf: p }),
      del: (p) => c.remove(p, `política ${p.id} (${p.name})`).then(() => lp.reload()),
      buttons: [
        { label: `${SW.icon.up}`, needSel: true, fn: (p) => p && move(p, -1) },
        { label: `${SW.icon.down}`, needSel: true, fn: (p) => p && move(p, 1) },
      ],
      ctx: (p) => [
        { label: p.enabled ? "Desabilitar" : "Habilitar", onClick: () => toggle(p) },
        { label: "Inserir política acima", icon: SW.icon.plus, onClick: () => dlg(null, { before: p }) },
        { label: "Mover para cima", icon: SW.icon.up, onClick: () => move(p, -1) },
        { label: "Mover para baixo", icon: SW.icon.down, onClick: () => move(p, 1) },
        "-",
      ],
      groupBy: (p) => (view === "pair" ? pairLabel(p) : ""),
      // drag & drop: inside a zone pair when grouped (order only matters within the pair), anywhere in sequence view
      reorder: (p, target, where) => SW.apply(SW.POST(`/api/config/policies/${p.id}/move`, { [where]: target.id }), { silent: true }),
      reorderScope: (p) => (view === "pair" ? pairLabel(p) : ""),
      rowClass: (p) => (p.enabled ? "" : "disabled"),
      noSort: true,
      columns: [
        { label: "ID", width: "50px", get: (p) => p.id },
        { label: "Nome", get: (p) => `<b>${SW.esc(p.name)}</b>${p.comment ? `<div class="muted">${SW.esc(p.comment)}</div>` : ""}` },
        { label: "Origem", get: (p) => (view === "seq" ? `<div>${SW.chips(p.src_zones, "accent")}</div>` : "") + ANY(p.src_addr, "all") },
        { label: "Destino", get: (p) => (view === "seq" ? `<div>${SW.chips(p.dst_zones, "accent")}</div>` : "") + ANY(p.dst_addr, "all") },
        { label: "Serviço", get: (p) => ANY(p.services, "ALL") },
        { label: "Ação", get: (p) => (p.action === "accept" ? SW.badge("✓ ACEITAR", "ok") : p.action === "reject" ? SW.badge("✕ REJEITAR", "bad") : SW.badge("✕ NEGAR", "bad")) },
        { label: "NAT", get: (p) => (central ? (p.action === "accept" ? `<span class="muted">central</span>` : `<span class="muted">—</span>`)
          : p.action === "accept" && p.nat.enabled ? SW.badge(p.nat.pool ? "pool " + p.nat.pool : "habilitado", "info") : `<span class="muted">—</span>`) },
        { label: "Segurança", get: (p) => [p.ips && p.ips !== "off" ? SW.badge("IPS " + (p.ips === "block" ? "bloqueio" : "alerta"), p.ips === "block" ? "bad" : "warn") : "",
            p.webfilter ? SW.badge("Web: " + p.webfilter, "info") : "", p.ssl_inspection ? SW.badge("SSL: " + p.ssl_inspection, "info") : ""].join(" ") },
        { label: "Log", get: (p) => (p.action !== "accept" || p.log ? "✓" : "") },
        { label: "Bytes / Pacotes", get: (p) => { const k = counters["pol_" + p.id]; return k ? `${SW.fmtBytes(k.bytes)}<div class="muted">${k.packets.toLocaleString("pt-BR")} pkts</div>` : "0"; } },
      ],
      async load() {
        const [list, cnt] = await Promise.all([SW.GET("/api/config/policies"), SW.GET("/api/system/policy-counters").catch(() => ({}))]);
        counters = cnt;
        return list;
      },
      footer: `<div class="tbl-wrap" style="margin-top:8px"><table class="grid"><tbody><tr class="grp"><td>⊟ Negação implícita</td></tr>
        <tr><td>Todo tráfego não permitido acima é descartado e registrado. <span id="impl" class="muted"></span></td></tr></tbody></table></div>`,
    });
    const setView = () => SW.$$("[data-v]", root).forEach((b) => b.classList.toggle("primary", b.dataset.v === view));
    SW.$$("[data-v]", root).forEach((b) => (b.onclick = () => { view = b.dataset.v; SW.setPref("polview", view); setView(); lp.reload(); }));
    setView();
    SW.GET("/api/system/policy-counters").then((k) => { const x = k.implicit_deny; if (x) SW.$("#impl", root).textContent = `(${x.packets.toLocaleString("pt-BR")} pacotes descartados)`; }).catch(() => {});
  },
});

/* ── Endereços ── */
SW.page("addresses", {
  title: "Endereços",
  async render(root) {
    await SW.loadMeta(true);
    const c = SW.crud("addresses", "name");
    const types = { subnet: "Sub-rede / IP", range: "Faixa de IPs", fqdn: "FQDN", group: "Grupo" };
    const dlg = (a, isGroup) => {
      const isNew = !a;
      SW.editDialog({
        title: isNew ? (isGroup ? "Novo grupo de endereços" : "Novo endereço") : `Editar ${a.name}`,
        value: a ? SW.clone(a) : { name: "", type: isGroup ? "group" : "subnet", value: "", members: [], comment: "" },
        fields: [
          { key: "name", label: "Nome", required: true },
          { key: "type", label: "Tipo", type: "select", options: Object.entries(types).filter(([k]) => (isGroup || (a && a.type === "group") ? k === "group" : k !== "group")).map(([value, label]) => ({ value, label })) },
          { key: "value", label: "Valor", show: (v) => v.type !== "group", placeholder: "192.168.10.0/24 · 10.0.0.1-10.0.0.50 · host.exemplo.com",
            help: "FQDN é resolvido no momento da aplicação." },
          { key: "members", label: "Membros", type: "multi", show: (v) => v.type === "group", options: () => SW.meta.addresses.filter((x) => x !== "all" && (!a || x !== a.name)) },
          { key: "comment", label: "Comentário" },
        ],
        async onSave(o) { if (isNew) await c.create(o); else await c.update(a.name, o); await SW.loadMeta(true); lp.reload(); },
      });
    };
    const lp = SW.listPage(root, {
      title: "Endereços", key: "name",
      create: [{ label: "Endereço", fn: () => dlg(null, false) }, { label: "Grupo de endereços", fn: () => dlg(null, true) }],
      edit: (a) => dlg(a), canEdit: (a) => !a._builtin, clone: (a) => dlg({ ...a, name: a.name + "-copia", _refs: 0 }),
      del: (a) => c.remove(a).then(() => lp.reload()),
      groupBy: (a) => types[a.type], groupOrder: Object.values(types),
      columns: [
        { label: "Nome", get: (a) => `<b>${SW.esc(a.name)}</b>${a._builtin ? " " + SW.badge("pré-definido", "off") : ""}` },
        { label: "Detalhes", get: (a) => (a.type === "group" ? SW.chips(a.members) : `<span class="mono">${SW.esc(a.value)}</span>`) },
        { label: "Comentário", get: (a) => SW.esc(a.comment) },
        { label: "Ref.", get: (a) => a._refs || 0 },
      ],
      load: () => SW.GET("/api/config/addresses"),
    });
  },
});

/* ── Serviços ── */
SW.page("services", {
  title: "Serviços",
  async render(root) {
    await SW.loadMeta(true);
    const c = SW.crud("services", "name");
    const detail = (s) => s.protocol === "group" ? SW.chips(s.members) : s.protocol === "icmp" ? `ICMP ${s.icmp_type ?? "qualquer"}` :
      s.protocol === "ip" ? `IP ${s.ip_protocol ?? "qualquer"}` : [s.tcp.length ? "TCP/" + s.tcp.join(",") : "", s.udp.length ? "UDP/" + s.udp.join(",") : ""].filter(Boolean).join(" · ");
    const dlg = (s, isGroup) => {
      const isNew = !s;
      SW.editDialog({
        title: isNew ? (isGroup ? "Novo grupo de serviços" : "Novo serviço") : `Editar ${s.name}`,
        value: s ? SW.clone(s) : { name: "", protocol: isGroup ? "group" : "tcp_udp", tcp: [], udp: [], icmp_type: null, ip_protocol: null, members: [], comment: "" },
        fields: [
          { key: "name", label: "Nome", required: true },
          { key: "protocol", label: "Protocolo", type: "select", options: isGroup || (s && s.protocol === "group") ? [{ value: "group", label: "Grupo" }] : [{ value: "tcp_udp", label: "TCP/UDP" }, { value: "icmp", label: "ICMP" }, { value: "ip", label: "IP (número de protocolo)" }] },
          { key: "tcp", label: "Portas TCP", type: "list", placeholder: "80, 443, 8000-8080", show: (v) => v.protocol === "tcp_udp" },
          { key: "udp", label: "Portas UDP", type: "list", placeholder: "53, 5060", show: (v) => v.protocol === "tcp_udp" },
          { key: "icmp_type", label: "Tipo ICMP", type: "number", placeholder: "vazio = qualquer", show: (v) => v.protocol === "icmp" },
          { key: "ip_protocol", label: "Protocolo IP", type: "number", placeholder: "ex.: 47 (GRE)", show: (v) => v.protocol === "ip" },
          { key: "members", label: "Membros", type: "multi", options: () => SW.meta.services.filter((x) => !s || x !== s.name), show: (v) => v.protocol === "group" },
          { key: "comment", label: "Comentário" },
        ],
        async onSave(o) { if (isNew) await c.create(o); else await c.update(s.name, o); await SW.loadMeta(true); lp.reload(); },
      });
    };
    const lp = SW.listPage(root, {
      title: "Serviços", key: "name",
      create: [{ label: "Serviço", fn: () => dlg(null, false) }, { label: "Grupo de serviços", fn: () => dlg(null, true) }],
      edit: (s) => dlg(s), canEdit: (s) => !s._builtin, clone: (s) => dlg({ ...s, name: s.name + "-copia", _refs: 0, _builtin: false }),
      del: (s) => c.remove(s).then(() => lp.reload()),
      groupBy: (s) => (s._builtin ? "Pré-definidos" : s.protocol === "group" ? "Grupos" : "Personalizados"),
      groupOrder: ["Personalizados", "Grupos", "Pré-definidos"],
      columns: [
        { label: "Nome", get: (s) => `<b>${SW.esc(s.name)}</b>` },
        { label: "Detalhes", get: (s) => `<span class="mono">${detail(s)}</span>` },
        { label: "Comentário", get: (s) => SW.esc(s.comment) },
        { label: "Ref.", get: (s) => s._refs || 0 },
      ],
      load: () => SW.GET("/api/config/services"),
    });
  },
});

/* ── Virtual IPs (port forwarding) ── */
SW.page("vips", {
  title: "Virtual IPs",
  async render(root) {
    await SW.loadMeta(true);
    const c = SW.crud("virtual_ips", "name");
    const dlg = (v) => SW.editDialog({
      title: v ? `Editar ${v.name}` : "Novo Virtual IP (port forwarding)",
      note: "Depois de criar o VIP, crie uma política da zona externa para a zona interna usando o VIP como <b>destino</b>.",
      value: v ? SW.clone(v) : { name: "", interface: "wan", external_ip: "", mapped_ip: "", protocol: "tcp", external_port: "", mapped_port: "", comment: "" },
      fields: [
        { key: "name", label: "Nome", required: true },
        { key: "interface", label: "Interface externa", type: "select", options: () => ["any", ...SW.meta.interfaces] },
        { key: "external_ip", label: "IP externo", placeholder: "vazio = qualquer IP da interface" },
        { key: "mapped_ip", label: "IP interno (mapeado)", required: true },
        { key: "protocol", label: "Protocolo", type: "select", options: [{ value: "tcp", label: "TCP" }, { value: "udp", label: "UDP" }, { value: "tcp_udp", label: "TCP e UDP" }] },
        { key: "external_port", label: "Porta externa", required: true, placeholder: "8443 ou 5000-5010" },
        { key: "mapped_port", label: "Porta interna", required: true, placeholder: "443" },
        { key: "comment", label: "Comentário" },
      ],
      async onSave(o) { if (v) await c.update(v.name, o); else await c.create(o); lp.reload(); },
    });
    const lp = SW.listPage(root, {
      title: "Virtual IPs (port forwarding)", key: "name", create: () => dlg(null), edit: dlg, del: (v) => c.remove(v).then(() => lp.reload()),
      columns: [
        { label: "Nome", get: (v) => `<b>${SW.esc(v.name)}</b>` },
        { label: "Interface", get: (v) => SW.esc(v.interface) },
        { label: "Externo", get: (v) => `<span class="mono">${SW.esc(v.external_ip || "*")}:${SW.esc(v.external_port)}</span>` },
        { label: "Mapeado para", get: (v) => `<span class="mono">${SW.esc(v.mapped_ip)}:${SW.esc(v.mapped_port)}</span>` },
        { label: "Protocolo", get: (v) => v.protocol.replace("_", "/").toUpperCase() },
        { label: "Comentário", get: (v) => SW.esc(v.comment) },
        { label: "Ref.", get: (v) => v._refs || 0 },
      ],
      load: () => SW.GET("/api/config/virtual_ips"),
    });
  },
});

/* ── IP Pools ── */
SW.page("pools", {
  title: "IP Pools",
  async render(root) {
    const c = SW.crud("ip_pools", "name");
    const dlg = (p) => SW.editDialog({
      title: p ? `Editar ${p.name}` : "Novo IP pool",
      value: p ? SW.clone(p) : { name: "", start: "", end: "", comment: "" },
      fields: [{ key: "name", label: "Nome", required: true }, { key: "start", label: "IP inicial", required: true }, { key: "end", label: "IP final", required: true }, { key: "comment", label: "Comentário" }],
      async onSave(o) { if (p) await c.update(p.name, o); else await c.create(o); lp.reload(); },
    });
    const lp = SW.listPage(root, {
      title: "IP Pools (NAT de origem)", key: "name", create: () => dlg(null), edit: dlg, del: (p) => c.remove(p).then(() => lp.reload()),
      columns: [
        { label: "Nome", get: (p) => `<b>${SW.esc(p.name)}</b>` },
        { label: "Faixa", get: (p) => `<span class="mono">${SW.esc(p.start)} – ${SW.esc(p.end)}</span>` },
        { label: "Comentário", get: (p) => SW.esc(p.comment) },
        { label: "Ref.", get: (p) => p._refs || 0 },
      ],
      load: () => SW.GET("/api/config/ip_pools"),
    });
  },
});

/* ── NAT central (central SNAT table, per VLAN/zone) — only applied when system.central_nat is on ── */
SW.page("snat", {
  title: "NAT central",
  async render(root) {
    await SW.loadMeta(true);
    const central = !!SW.meta.central_nat;
    const c = SW.crud("snat_rules", "id");
    const dlg = (r) => {
      const v = r ? SW.clone(r) : { enabled: true, src_zones: [], src_addr: ["all"], out_interface: "wan", action: "masquerade", pool: null, comment: "" };
      v.pool = v.pool || "";
      SW.editDialog({
        title: r ? `Editar regra ${r.id}` : "Nova regra de NAT central", value: v,
        fields: [
          { key: "src_zones", label: "Zona / VLAN de origem", type: "multi", options: () => ["any", ...SW.meta.zones], exclusive: ["any"] },
          { key: "src_addr", label: "Endereço de origem", type: "multi", options: () => SW.meta.addresses, exclusive: ["all"] },
          { key: "out_interface", label: "Interface de saída", type: "select", options: () => SW.meta.interfaces },
          { key: "action", label: "Tradução", type: "select", options: [{ value: "masquerade", label: "IP da interface de saída (masquerade)" }, { value: "snat", label: "IP pool" }, { value: "no-nat", label: "Sem NAT (exceção)" }] },
          { key: "pool", label: "IP pool", type: "select", show: (x) => x.action === "snat", options: () => [{ value: "", label: "—" }, ...SW.meta.ip_pools] },
          { key: "comment", label: "Comentário" },
          { key: "enabled", label: "Status", type: "bool", text: "Habilitada" },
        ],
        async onSave(o) { o.pool = o.action === "snat" ? o.pool || null : null; if (r) await c.update(r.id, o); else await c.create(o); lp.reload(); },
      });
    };
    const lp = SW.listPage(root, {
      title: "NAT central", key: "id",
      intro: central
        ? "Modo NAT central: somente estas regras traduzem a origem (a opção NAT das políticas é ignorada). São avaliadas de cima para baixo — arraste para reordenar. Use <i>Sem NAT</i> para exceções (ex.: tráfego para túneis IPsec)."
        : "O NAT central está desligado (Sistema › Configurações): estas regras <b>não</b> são aplicadas, e a tradução é definida em cada política.",
      create: () => dlg(null), edit: dlg, del: (r) => c.remove(r, `regra ${r.id}`).then(() => lp.reload()),
      rowClass: (r) => (r.enabled ? "" : "disabled"), noSort: true,
      reorder: (r, target, where) => SW.apply(SW.POST(`/api/config/snat_rules/${r.id}/move`, { [where]: target.id }), { silent: true }),
      columns: [
        { label: "ID", get: (r) => r.id },
        { label: "Origem", get: (r) => SW.chips(r.src_zones, "accent") + " " + ANY(r.src_addr, "all") },
        { label: "Saída", get: (r) => SW.esc(r.out_interface) },
        { label: "Tradução", get: (r) => (r.action === "masquerade" ? SW.badge("IP da interface", "info") : r.action === "snat" ? SW.badge("pool " + r.pool, "info") : SW.badge("sem NAT", "off")) },
        { label: "Comentário", get: (r) => SW.esc(r.comment) },
      ],
      load: () => SW.GET("/api/config/snat_rules"),
    });
  },
});
