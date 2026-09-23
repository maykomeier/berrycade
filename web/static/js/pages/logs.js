/* Logs & Relatórios */
"use strict";
const trafficPage = (id, title, kind, intro) => SW.page(id, {
  title,
  async render(root) {
    await SW.loadMeta(true);
    root.innerHTML = `<div class="page"><div class="page-head"><h2>${title}</h2><div class="spacer"></div><span class="muted" id="cnt"></span></div>
      <div class="note tip">${intro}</div>
      <div class="toolbar"><select class="in" id="z" style="width:auto"><option value="">Todas as zonas</option>${SW.meta.zones.map((z) => `<option>${SW.esc(z)}</option>`).join("")}<option value="local">local (firewall)</option></select>
      ${kind === "all" ? `<select class="in" id="k" style="width:auto"><option value="all">Todas as ações</option><option value="accepted">Permitidas</option><option value="denied">Bloqueadas</option></select>` : ""}
      <div class="search"><input id="q" placeholder="IP, porta, política…"><span>${SW.icon.search}</span></div>
      <label class="toggle"><input type="checkbox" id="live" checked> tempo real</label><div class="spacer"></div>
      <button class="btn" id="r">${SW.icon.refresh}</button></div>
      <div class="tbl-wrap" style="max-height:calc(100vh - 250px)"><table class="grid"><thead><tr><th>Data/Hora</th><th>Ação</th><th>Origem</th><th>Destino</th><th>Proto</th><th>Zona origem</th><th>Zona destino</th><th>Interfaces</th><th>Política</th><th>Bytes</th></tr></thead><tbody id="b"></tbody></table></div></div>`;
    const $ = (x) => SW.$("#" + x, root);
    const load = async () => {
      const p = new URLSearchParams({ kind: $("k") ? $("k").value : kind, zone: $("z").value, q: $("q").value, limit: 1000 });
      const rows = await SW.GET("/api/logs/traffic?" + p);
      $("cnt").textContent = `${rows.length} registros`;
      $("b").innerHTML = rows.length ? rows.map((r) => `<tr data-ctx="1" data-src="${SW.esc(r.src)}"><td class="nowrap">${SW.fmtTime(r.time)}</td>
        <td>${r.action === "accept" ? SW.badge("aceito", "ok") : r.action === "deny-local" ? SW.badge("negado (local)", "bad") : SW.badge("negado", "bad")}</td>
        <td class="mono">${SW.esc(r.src)}${r.sport ? ":" + r.sport : ""}</td><td class="mono">${SW.esc(r.dst)}${r.dport ? ":" + r.dport : ""}</td>
        <td>${SW.esc(r.proto)}</td><td>${SW.esc(r.src_zone)}</td><td>${SW.esc(r.dst_zone)}</td><td class="mono">${SW.esc(r.in)} → ${SW.esc(r.out)}</td>
        <td>${r.policy_id ? r.policy_id + " · " : ""}${SW.esc(r.policy)}</td><td>${r.len || ""}</td></tr>`).join("") : `<tr><td class="empty" colspan="10">Nenhum registro</td></tr>`;
      SW.$$("tr[data-src]", $("b")).forEach((tr) => (tr.oncontextmenu = (e) => { e.preventDefault(); SW.ctxMenu(e.clientX, e.clientY, [
        { label: `Filtrar por ${tr.dataset.src}`, onClick: () => { $("q").value = tr.dataset.src; load(); } },
        { label: "Criar objeto de endereço", icon: SW.icon.plus, onClick: () => SW.editDialog({ title: "Novo endereço", value: { name: "host-" + tr.dataset.src.replace(/\./g, "-"), type: "subnet", value: tr.dataset.src + "/32", comment: "criado a partir do log" },
          fields: [{ key: "name", label: "Nome" }, { key: "value", label: "Valor" }, { key: "comment", label: "Comentário" }], onSave: (o) => SW.apply(SW.POST("/api/config/addresses", o)) }) },
      ]); }));
    };
    ["z", "k"].forEach((x) => $(x) && ($(x).onchange = load));
    $("q").oninput = SW.debounce(load, 300);
    $("r").onclick = load;
    load().catch(SW.fail);
    SW.every(5, () => $("live").checked && load().catch(() => {}));
  },
});
trafficPage("log-traffic", "Tráfego", "all", "Sessões iniciadas em políticas com registro habilitado e conexões bloqueadas. Clique com o botão direito numa linha para filtrar ou criar um objeto.");
trafficPage("log-denied", "Conexões bloqueadas", "denied", "Tráfego descartado pela negação implícita, por políticas NEGAR/REJEITAR ou destinado ao próprio firewall sem acesso administrativo.");

SW.page("log-ids", {
  title: "Eventos IDS/IPS",
  async render(root) {
    await SW.loadMeta(true);
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Eventos IDS/IPS</h2></div>
      <div class="toolbar"><select class="in" id="z" style="width:auto"><option value="">Todas as zonas</option>${SW.meta.zones.map((z) => `<option>${SW.esc(z)}</option>`).join("")}</select>
      <div class="search"><input id="q" placeholder="assinatura, IP, SID…"></div></div>
      <div class="tbl-wrap" style="max-height:calc(100vh - 200px)"><table class="grid"><thead>${SW.alertHead}</thead><tbody id="b"></tbody></table></div></div>`;
    const load = async () => { SW.$("#b", root).innerHTML = SW.alertTable(await SW.GET(`/api/ids/alerts?${new URLSearchParams({ zone: SW.$("#z", root).value, q: SW.$("#q", root).value, limit: 1000 })}`)); };
    SW.$("#z", root).onchange = load; SW.$("#q", root).oninput = SW.debounce(load, 300);
    load().catch(SW.fail); SW.every(10, () => load().catch(() => {}));
  },
});

SW.page("sessions", {
  title: "Sessões ativas",
  async render(root) {
    const pol = Object.fromEntries((await SW.GET("/api/config/policies")).map((p) => [p.id, p.name]));
    let total = 0;
    const lp = SW.listPage(root, {
      title: "Sessões ativas", key: "_k", autoRefresh: 5,
      buttons: [{ label: `${SW.icon.x} Encerrar sessões da origem`, needSel: true, fn: async (s) => { if (s && await SW.confirm(`Encerrar todas as sessões de <b>${SW.esc(s.src)}</b>?`, { danger: true, ok: "Encerrar" })) { await SW.POST("/api/sessions/clear", { src: s.src }); lp.reload(); } } }],
      ctx: (s) => [{ label: `Encerrar sessões de ${s.src}`, icon: SW.icon.x, danger: true, onClick: async () => { await SW.POST("/api/sessions/clear", { src: s.src }); lp.reload(); } }],
      columns: [
        { label: "Proto", get: (s) => SW.esc(s.proto) },
        { label: "Origem", get: (s) => `<span class="mono">${SW.esc(s.src)}:${SW.esc(s.sport || "")}</span>${s.nat_src ? `<div class="muted mono">NAT ${SW.esc(s.nat_src)}</div>` : ""}` },
        { label: "Destino", get: (s) => `<span class="mono">${SW.esc(s.dst)}:${SW.esc(s.dport || "")}</span>${s.nat_dst ? `<div class="muted mono">→ ${SW.esc(s.nat_dst)}</div>` : ""}` },
        { label: "Estado", get: (s) => SW.esc(s.state) },
        { label: "Política", get: (s) => (s.policy ? `${s.policy} · ${SW.esc(pol[s.policy] || "")}` : `<span class="muted">local</span>`), sort: (s) => s.policy },
        { label: "Bytes", get: (s) => SW.fmtBytes(s.bytes), sort: (s) => s.bytes },
        { label: "Expira (s)", get: (s) => s.ttl, sort: (s) => s.ttl },
      ],
      async load() { const r = await SW.GET("/api/sessions?limit=1000"); total = r.total; SW.$(".page-head h2", root).textContent = `Sessões ativas (${total})`; return r.sessions.map((s, i) => ({ ...s, _k: `${s.proto}${s.src}${s.sport}${s.dst}${s.dport}` })); },
    });
  },
});

SW.page("log-audit", {
  title: "Auditoria",
  render(root) {
    SW.listPage(root, {
      title: "Auditoria (alterações e acessos)", key: "_k",
      columns: [
        { label: "Data/Hora", get: (a) => SW.fmtTime(a.ts) },
        { label: "Usuário", get: (a) => SW.esc(a.user) },
        { label: "Ação", get: (a) => SW.badge(a.action, a.action.includes("fail") || a.action.includes("rollback") ? "bad" : a.action === "commit" ? "ok" : "info") },
        { label: "Detalhes", get: (a) => SW.esc(a.message || a.reason || a.revision || a.ip || a.target || a.mac || "") + (a.actions ? `<div class="muted">${SW.esc(a.actions.join(" · "))}</div>` : "") + (a.error ? `<div style="color:var(--bad)">${SW.esc(a.error)}</div>` : "") },
      ],
      load: async () => (await SW.GET("/api/logs/audit")).map((a, i) => ({ ...a, _k: i })),
    });
  },
});

SW.page("log-system", {
  title: "Logs do sistema",
  render(root) {
    const units = [["berrycade-api", "API / Painel"], ["systemd-networkd", "Rede"], ["berrycade-pppoe", "PPPoE"], ["berrycade-dnsmasq", "DNS/DHCP"], ["strongswan", "IPsec"], ["berrycade-suricata@alert", "Suricata alerta"], ["berrycade-suricata@block", "Suricata bloqueio"], ["berrycade-rules-update", "Atualização de regras"], ["tailscaled", "Tailscale"], ["berrycade-ulogd", "Log de tráfego"], ["berrycade-firewall", "Firewall (boot)"]];
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Logs do sistema</h2></div>
      <div class="toolbar"><select class="in" id="u" style="width:auto">${units.map(([u, l]) => `<option value="${u}">${l}</option>`).join("")}</select><button class="btn" id="r">${SW.icon.refresh}</button></div>
      <pre class="code" id="log" style="max-height:calc(100vh - 210px)"></pre></div>`;
    const load = async () => { const r = await SW.GET(`/api/logs/system?unit=${encodeURIComponent(SW.$("#u", root).value)}&lines=400`); const el = SW.$("#log", root); el.textContent = r.log || "(vazio)"; el.scrollTop = el.scrollHeight; };
    SW.$("#u", root).onchange = load; SW.$("#r", root).onclick = load;
    load().catch(SW.fail);
  },
});
