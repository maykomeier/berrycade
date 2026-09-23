/* Perfis de Segurança: Filtro Web e Inspeção SSL. */
"use strict";
SW.categoryPicker = (catalog, selected, { exemptMode = false } = {}) => {
  const groups = {};
  catalog.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
  const sel = new Set(selected || []);
  const el = SW.h(`<div class="catpick"></div>`);
  Object.entries(groups).forEach(([g, cats]) => {
    const box = SW.h(`<fieldset class="catgrp"><legend><label><input type="checkbox" class="all"> ${SW.esc(g)}</label></legend><div class="checks"></div></fieldset>`);
    const list = SW.$(".checks", box);
    cats.forEach((c) => {
      const cnt = c.count != null ? `<span class="muted">(${c.count.toLocaleString("pt-BR")})</span>` : `<span class="muted">(não baixada)</span>`;
      const item = SW.h(`<label title="${SW.esc(c.sources.join(", "))}"><input type="checkbox" value="${c.id}" ${sel.has(c.id) ? "checked" : ""}> ${SW.esc(c.label)} ${cnt}</label>`);
      list.appendChild(item);
    });
    const all = SW.$(".all", box);
    const sync = () => { const cb = SW.$$("input[value]", box); all.checked = cb.every((x) => x.checked); all.indeterminate = !all.checked && cb.some((x) => x.checked); };
    all.onchange = () => { SW.$$("input[value]", box).forEach((x) => (x.checked = all.checked)); };
    SW.$$("input[value]", box).forEach((x) => (x.onchange = sync));
    sync();
    el.appendChild(box);
  });
  return { el, get: () => SW.$$("input[value]:checked", el).map((x) => x.value) };
};

/* Per-category action picker (Permitir / Monitorar / Bloquear). value: {cat: "block"|"monitor"}; unlisted = allow */
SW.categoryActions = (catalog, value) => {
  const cur = { ...(value || {}) };
  const groups = {};
  catalog.filter((c) => c.group !== "Financeiro (isenção de inspeção)").forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
  const el = SW.h(`<div class="catpick"></div>`);
  const ACTS = [["allow", "Permitir"], ["monitor", "Monitorar"], ["block", "Bloquear"]];
  const seg = (id) => `<span class="seg" data-c="${id}">${ACTS.map(([a, l]) => `<button type="button" data-a="${a}" class="${(cur[id] || "allow") === a ? "on " + a : ""}">${l}</button>`).join("")}</span>`;
  Object.entries(groups).forEach(([g, cats]) => {
    const box = SW.h(`<fieldset class="catgrp"><legend>${SW.esc(g)}</legend>
      <div class="catrow grpall"><span class="muted">Definir todas</span>${seg("__all")}</div></fieldset>`);
    SW.$$(".grpall button", box).forEach((b) => b.classList.remove("on", "allow", "monitor", "block"));
    cats.forEach((c) => {
      const cnt = c.count != null ? `<span class="muted">${c.count.toLocaleString("pt-BR")}</span>` : `<span class="muted">não baixada</span>`;
      box.appendChild(SW.h(`<div class="catrow"><span title="${SW.esc(c.sources.join(", "))}">${SW.esc(c.label)} ${cnt}</span>${seg(c.id)}</div>`));
    });
    const set = (id, a) => {
      if (a === "allow") delete cur[id]; else cur[id] = a;
      SW.$$(`.seg[data-c="${id}"] button`, box).forEach((b) => { b.className = b.dataset.a === a ? "on " + a : ""; });
    };
    SW.$$(".seg button", box).forEach((b) => (b.onclick = () => {
      const id = b.parentElement.dataset.c, a = b.dataset.a;
      if (id === "__all") cats.forEach((c) => set(c.id, a)); else set(id, a);
    }));
    el.appendChild(box);
  });
  return { el, get: () => ({ ...cur }) };
};

SW.page("webfilter", {
  title: "Filtro Web",
  async render(root) {
    let cat = await SW.GET("/api/webfilter/catalog");
    const labels = Object.fromEntries(cat.categories.map((c) => [c.id, c.label]));
    const c = SW.crud("webfilter_profiles", "name");
    const dlg = (p) => {
      const isNew = !p;
      const v = p ? SW.clone(p) : { name: "", categories: { malware: "block", phishing: "block", fraud: "block", ransomware: "block", cryptojacking: "block", stalkerware: "block" },
        block_domains: [], allow_domains: [], block_bypass: true, comment: "" };
      const fm = SW.form([
        { key: "name", label: "Nome", required: true, disabled: !isNew && p._refs > 0 },
        { key: "block_bypass", label: "Anti-contorno", type: "bool", text: "Bloquear DNS-over-TLS (853) e resolvedores DoH conhecidos" },
        { key: "block_domains", label: "Domínios bloqueados", type: "list", placeholder: "um por linha — inclui subdomínios" },
        { key: "allow_domains", label: "Domínios permitidos", type: "list", placeholder: "exceções: têm prioridade sobre as categorias" },
        { key: "comment", label: "Comentário" },
      ], v);
      const pick = SW.categoryActions(cat.categories, v.categories);
      const body = document.createElement("div");
      body.appendChild(fm.el);
      body.appendChild(SW.h(`<div class="sect" style="font-weight:600;color:var(--accent);border-bottom:1px solid var(--border);padding:12px 0 4px;margin-bottom:8px">Ação por categoria
        <div class="muted" style="font-weight:400;font-size:12.5px">Permitir = sem ação · Monitorar = libera e registra no log · Bloquear = nega. Se um domínio estiver em várias categorias, Bloquear prevalece (exceto os "Domínios permitidos").</div></div>`));
      body.appendChild(pick.el);
      SW.modal({ title: isNew ? "Novo perfil de filtro web" : `Editar perfil ${p.name}`, size: "lg", body, buttons: [
        { label: "Cancelar" },
        { label: "OK", primary: true, onClick: async (m) => {
          const o = { ...fm.get(), categories: pick.get() };
          if (isNew) await c.create(o); else await c.update(p.name, o);
          m.close(); lp.reload();
          const missing = Object.keys(o.categories).filter((x) => cat.categories.find((k) => k.id === x).count == null);
          if (missing.length) { SW.toast(`Baixando ${missing.length} categoria(s) nova(s)…`); await SW.POST("/api/webfilter/update", { categories: missing }); refreshStatus(); }
        } },
      ] });
    };
    const lp = SW.listPage(root, {
      title: "Filtro Web", key: "name",
      intro: `Perfis aplicados nas <a href="#/policies">políticas de firewall</a>. O filtro atua no <b>DNS</b> (os clientes da origem da política são redirecionados para um resolvedor filtrado) e,
        quando a política também tem <b>inspeção SSL</b>, no <b>SNI</b> (modo certificado) ou na <b>URL completa</b> (modo profundo, com página de bloqueio).
        Listas: <a href="https://dsi.ut-capitole.fr/blacklists/" target="_blank" rel="noopener">UT1 (CC BY-SA)</a>, <a href="https://github.com/blocklistproject/Lists" target="_blank" rel="noopener">Block List Project</a> e <a href="https://github.com/hagezi/dns-blocklists" target="_blank" rel="noopener">HaGeZi</a>.`,
      create: () => dlg(null), edit: dlg, clone: (p) => dlg({ ...p, name: p.name + "-copia", _refs: 0 }),
      del: (p) => c.remove(p, `perfil ${p.name}`).then(() => lp.reload()),
      columns: [
        { label: "Nome", get: (p) => `<b>${SW.esc(p.name)}</b>${p.comment ? `<div class="muted">${SW.esc(p.comment)}</div>` : ""}` },
        { label: "Bloqueadas", get: (p) => SW.chips(Object.keys(p.categories).filter((x) => p.categories[x] === "block").map((x) => labels[x] || x), "bad") },
        { label: "Monitoradas", get: (p) => SW.chips(Object.keys(p.categories).filter((x) => p.categories[x] === "monitor").map((x) => labels[x] || x)) || `<span class="muted">—</span>` },
        { label: "Domínios", get: (p) => `${p.block_domains.length} bloqueados · ${p.allow_domains.length} permitidos` },
        { label: "Anti-contorno", get: (p) => (p.block_bypass ? "✓" : "") },
        { label: "Ref.", get: (p) => p._refs || 0 },
      ],
      load: () => SW.GET("/api/config/webfilter_profiles"),
      footer: `<div class="cards" style="margin-top:12px"><div class="card full"><h3>Listas de categorias<span class="spacer"></span>
        <label class="toggle" style="font-weight:400"><input type="checkbox" id="wf-auto"> atualizar diariamente (04:00)</label>
        <button class="btn sm primary" id="wf-upd">${SW.icon.dl} Atualizar agora</button></h3><div class="body" id="wf-status"></div></div></div>`,
    });
    const refreshStatus = async () => {
      cat = await SW.GET("/api/webfilter/catalog");
      const used = new Set(cat.used);
      const rows = cat.categories.filter((k) => used.has(k.id));
      SW.$("#wf-auto", root).checked = cat.auto_update;
      SW.$("#wf-upd", root).disabled = cat.updating;
      SW.$("#wf-status", root).innerHTML = `<div class="kv" style="margin-bottom:10px"><div>Última atualização</div><div>${SW.esc(cat.last_update || "nunca")} ${cat.updating ? SW.badge("baixando…", "info") : ""}</div>
        <div>IPs de resolvedores DoH</div><div>${cat.doh_ips.toLocaleString("pt-BR")}</div></div>
        ${cat.errors.length ? `<div class="errbox"><b>Falhas no último download</b><ul>${cat.errors.map((e) => `<li>${SW.esc(e)}</li>`).join("")}</ul></div>` : ""}
        <table class="grid"><thead><tr><th>Categoria em uso</th><th>Fontes</th><th>Domínios</th><th>Atualizada</th></tr></thead><tbody>
        ${rows.map((k) => `<tr><td>${SW.esc(k.label)}</td><td class="muted">${SW.esc(k.sources.join(", "))}</td><td>${k.count != null ? k.count.toLocaleString("pt-BR") : SW.badge("não baixada", "warn")}</td><td>${SW.esc(k.updated || "")}</td></tr>`).join("") || `<tr><td class="empty" colspan="4">Nenhuma categoria em uso</td></tr>`}
        </tbody></table>`;
    };
    SW.$("#wf-upd", root).onclick = async () => { await SW.POST("/api/webfilter/update").catch(SW.fail); SW.toast("Download das listas iniciado"); refreshStatus(); };
    SW.$("#wf-auto", root).onchange = async (e) => { try { await SW.apply(SW.PUT("/api/settings/webfilter", { auto_update: e.target.checked })); } catch (x) { SW.fail(x); } };
    refreshStatus().catch(SW.fail);
    SW.every(10, () => refreshStatus().catch(() => {}));
  },
});

SW.page("sslinspect", {
  title: "Inspeção SSL",
  async render(root) {
    const cat = await SW.GET("/api/webfilter/catalog");
    const labels = Object.fromEntries(cat.categories.map((c) => [c.id, c.label]));
    const c = SW.crud("ssl_profiles", "name");
    const dlg = (p) => {
      const isNew = !p;
      const v = p ? SW.clone(p) : { name: "", mode: "certificate", exempt_categories: ["bank", "financial"], exempt_domains: ["gov.br"], untrusted_certs: "block", block_quic: true, comment: "" };
      const fm = SW.form([
        { key: "name", label: "Nome", required: true, disabled: !isNew && p._refs > 0 },
        { key: "mode", label: "Modo", type: "select", options: [{ value: "certificate", label: "Inspeção de certificado (leve — sem descriptografar)" }, { value: "deep", label: "Inspeção profunda (descriptografa — exige a CA nos clientes)" }] },
        { type: "html", html: `<div class="note" style="margin:0"><b>Certificado:</b> lê o nome do site (SNI) do handshake TLS e encerra conexões de domínios bloqueados pelo filtro web. Não quebra nada e não exige instalar certificado.<br>
          <b>Profunda:</b> o firewall abre o HTTPS, filtra pela URL completa e exibe página de bloqueio. Os dispositivos precisam confiar na CA abaixo; apps com <i>certificate pinning</i> podem falhar (use as isenções). Informe os usuários — dados pessoais trafegam descriptografados no firewall (LGPD).</div>` },
        { key: "exempt_domains", label: "Domínios isentos", type: "list", show: (x) => x.mode === "deep", placeholder: "nunca descriptografar (inclui subdomínios)" },
        { key: "untrusted_certs", label: "Certificados inválidos", type: "select", show: (x) => x.mode === "deep", options: [{ value: "block", label: "Bloquear (recomendado)" }, { value: "allow", label: "Permitir" }] },
        { key: "block_quic", label: "QUIC / HTTP3", type: "bool", text: "Bloquear UDP 443 para forçar HTTPS por TCP (necessário para inspecionar)" },
        { key: "comment", label: "Comentário" },
      ], v);
      const pick = SW.categoryPicker(cat.categories.filter((k) => ["Financeiro (isenção de inspeção)", "Produtividade"].includes(k.group)), v.exempt_categories);
      const body = document.createElement("div");
      body.appendChild(fm.el);
      const ex = SW.h(`<div><div style="font-weight:600;color:var(--accent);border-bottom:1px solid var(--border);padding:12px 0 4px;margin-bottom:8px">Categorias isentas (modo profundo)</div></div>`);
      ex.appendChild(pick.el);
      body.appendChild(ex);
      SW.modal({ title: isNew ? "Novo perfil de inspeção SSL" : `Editar perfil ${p.name}`, size: "lg", body, buttons: [
        { label: "Cancelar" },
        { label: "OK", primary: true, onClick: async (m) => { const o = { ...fm.get(), exempt_categories: pick.get() }; if (isNew) await c.create(o); else await c.update(p.name, o); m.close(); lp.reload(); } },
      ] });
    };
    const lp = SW.listPage(root, {
      title: "Inspeção SSL", key: "name",
      intro: "O tráfego HTTP/HTTPS das políticas com inspeção SSL passa por um proxy transparente (Squid) no firewall. O IPS da política continua valendo para essas conexões.",
      create: () => dlg(null), edit: dlg, del: (p) => c.remove(p, `perfil ${p.name}`).then(() => lp.reload()),
      columns: [
        { label: "Nome", get: (p) => `<b>${SW.esc(p.name)}</b>` },
        { label: "Modo", get: (p) => (p.mode === "deep" ? SW.badge("profunda", "warn") : SW.badge("certificado", "info")) },
        { label: "Isenções", get: (p) => (p.mode === "deep" ? SW.chips([...p.exempt_categories.map((x) => labels[x] || x), ...p.exempt_domains]) : `<span class="muted">—</span>`) },
        { label: "QUIC bloqueado", get: (p) => (p.block_quic ? "✓" : "") },
        { label: "Ref.", get: (p) => p._refs || 0 },
      ],
      load: () => SW.GET("/api/config/ssl_profiles"),
      footer: `<div class="cards" style="margin-top:12px"><div class="card full"><h3>Autoridade certificadora (CA) da inspeção profunda</h3><div class="body" id="ca"></div></div></div>`,
    });
    const drawCA = async () => {
      const ca = await SW.GET("/api/ssl/ca");
      SW.$("#ca", root).innerHTML = `<div class="kv">${ca.exists ? `<div>Titular</div><div>${SW.esc(ca.subject)}</div><div>Validade</div><div>${SW.esc(ca.expires)}</div><div>SHA-256</div><div class="mono" style="word-break:break-all">${SW.esc(ca.fingerprint)}</div>` : `<div>Estado</div><div>será criada automaticamente</div>`}</div>
        <div class="toolbar" style="margin-top:10px"><a class="btn primary" href="/api/ssl/ca/crt">${SW.icon.dl} Baixar CA (.crt — Windows, Android, iOS)</a><a class="btn" href="/api/ssl/ca/pem">${SW.icon.dl} Baixar CA (.pem — Linux, macOS)</a>
        <button class="btn danger" id="ca-regen">Gerar nova CA</button></div>
        <details><summary>Como instalar nos dispositivos</summary><ul>
          <li><b>Windows:</b> abrir o .crt › Instalar certificado › Máquina local › "Autoridades de Certificação Raiz Confiáveis" (em domínio: GPO).</li>
          <li><b>macOS:</b> abrir no Acesso às Chaves › Sistema › marcar como "Sempre confiar".</li>
          <li><b>Android:</b> Configurações › Segurança › Criptografia e credenciais › Instalar certificado › Certificado CA.</li>
          <li><b>iOS:</b> instalar o perfil e ativar em Ajustes › Geral › Sobre › Ajustes de Certificados Confiáveis.</li>
          <li><b>Linux:</b> copiar o .pem para <span class="mono">/usr/local/share/ca-certificates/berrycade.crt</span> e rodar <span class="mono">update-ca-certificates</span>. Firefox usa repositório próprio.</li></ul></details>`;
      SW.$("#ca-regen", root).onclick = async () => { if (await SW.confirm("Gerar uma nova CA? Todos os dispositivos precisarão instalar o novo certificado.", { danger: true, ok: "Gerar" })) { await SW.POST("/api/ssl/ca/regenerate").catch(SW.fail); drawCA(); } };
    };
    drawCA().catch(SW.fail);
  },
});

SW.page("log-webfilter", {
  title: "Filtro Web — bloqueios",
  render(root) {
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Filtro Web — bloqueios</h2></div>
      <div class="toolbar"><div class="search"><input id="q" placeholder="domínio, cliente…"><span>${SW.icon.search}</span></div><button class="btn" id="r">${SW.icon.refresh}</button></div>
      <div class="tbl-wrap" style="max-height:calc(100vh - 200px)"><table class="grid"><thead><tr><th>Hora</th><th>Camada</th><th>Perfil</th><th>Cliente</th><th>Domínio / URL</th></tr></thead><tbody id="b"></tbody></table></div></div>`;
    const load = async () => {
      const rows = await SW.GET(`/api/webfilter/log?q=${encodeURIComponent(SW.$("#q", root).value)}`);
      SW.$("#b", root).innerHTML = rows.length ? rows.map((r) => `<tr><td class="nowrap">${SW.esc(r.time)}</td><td>${SW.badge(r.source, r.source === "DNS" ? "info" : "warn")}</td>
        <td>${SW.esc(r.profile)}</td><td class="mono">${SW.esc(r.client)}</td><td class="mono" style="word-break:break-all">${SW.esc(r.url || r.domain)}</td></tr>`).join("") : `<tr><td class="empty" colspan="5">Nenhum bloqueio</td></tr>`;
    };
    SW.$("#q", root).oninput = SW.debounce(load, 300); SW.$("#r", root).onclick = load;
    load().catch(SW.fail); SW.every(10, () => load().catch(() => {}));
  },
});
