/* Sistema */
"use strict";
SW.page("settings", {
  title: "Configurações",
  async render(root) {
    const sys = await SW.GET("/api/settings/system");
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Configurações do sistema</h2></div>
      <div class="card" style="max-width:780px"><div class="body" id="f"></div><div class="modal-foot"><button class="btn primary" id="save">Aplicar</button></div></div></div>`;
    const fm = SW.form([
      { type: "section", label: "Identificação" },
      { key: "hostname", label: "Hostname", help: "Aplicado ao sistema operacional (hostnamectl e /etc/hosts) — exceto no modo pré-visualização." },
      { key: "timezone", label: "Fuso horário", placeholder: "America/Sao_Paulo" },
      { type: "section", label: "Administração" },
      { key: "admin.https_port", label: "Porta HTTPS", type: "number" },
      { key: "admin.trusted_hosts", label: "Hosts confiáveis", type: "list", placeholder: "vazio = qualquer origem\n10.0.0.200\n10.0.0.0/24",
        help: "Somente estes IPs/redes alcançam o painel (HTTPS) e o SSH — bloqueio feito no nftables. O IP de onde você está acessando precisa estar na lista." },
      { key: "admin.session_timeout", label: "Tempo de inatividade (s)", type: "number" },
      { key: "admin.confirm_timeout", label: "Janela anti-bloqueio (s)", type: "number", help: "Alterações não confirmadas pelo navegador neste prazo são revertidas." },
      { key: "drift_autofix", label: "Sincronia", type: "bool", text: "Corrigir automaticamente divergências entre configuração e kernel" },
      { type: "section", label: "NAT" },
      { key: "central_nat", label: "NAT central", type: "bool", text: "Definir a tradução de origem numa tabela central, e não em cada política",
        help: "Desligado (padrão): cada política decide se faz NAT e com qual endereço. Ligado: aparece <b>Política &amp; Objetos › NAT central</b> e a opção NAT some das políticas." },
    ], sys);
    SW.$("#f", root).appendChild(fm.el);
    SW.$("#save", root).onclick = async () => {
      const v = fm.get(), port = Number(v.admin.https_port);
      if (port === Number(sys.admin.https_port)) {
        try {
          await SW.apply(SW.PUT("/api/settings/system", v));
          if (v.central_nat !== sys.central_nat) { await SW.loadMeta(true); SW.buildMenu(); SW.route(); }   // menu item depends on the NAT mode
        } catch (e) { SW.fail(e); }
        return;
      }
      // port change: the panel starts listening on the new port and the old one closes — confirm from the new address
      const url = `https://${location.hostname}${port === 443 ? "" : ":" + port}/`;
      if (!(await SW.confirm(`O painel passará a responder em <b>${SW.esc(url)}</b> e a porta atual será fechada. Depois de aplicar, abra o novo endereço e clique em <b>Confirmar</b> na faixa amarela — se não confirmar a tempo, a porta anterior volta sozinha.`, { ok: "Aplicar" }))) return;
      try {
        const r = await SW.PUT("/api/settings/system", v);
        SW.modal({ title: "Confirme no novo endereço", body: `<p>Abra <a href="${SW.esc(url)}" target="_blank">${SW.esc(url)}</a> e clique em <b>Confirmar</b> na faixa amarela em até <b>${r.confirm_timeout || 60} s</b>.</p><p class="muted">Seu login continua valendo no novo endereço.</p>`, buttons: [{ label: "Fechar" }] });
      } catch (e) { SW.fail(e); }
    };
    const wiz = SW.h(`<button class="btn" style="margin-left:8px">Executar assistente de configuração inicial</button>`);
    wiz.onclick = () => SW.setupWizard().catch(SW.fail);
    SW.$("#save", root).parentElement.prepend(wiz);
    SW.themeEditor(SW.$(".page", root));
  },
});

/* Appearance: presets, custom accent/sidebar colors, light/dark default, density — live preview */
SW.themeEditor = async (host) => {
  const saved = await SW.GET("/api/ui/theme");
  let t = { ...saved };
  const card = SW.h(`<div class="card" style="max-width:780px;margin-top:14px"><h3>Aparência</h3><div class="body">
    <div class="muted" style="margin-bottom:8px">Temas prontos</div><div class="swatches"></div>
    <div class="form" style="margin-top:14px">
      <label class="l">Cor de destaque</label><div class="colorrow"><input type="color" data-k="accent"><input class="in mono" data-hex="accent" maxlength="7"></div>
      <label class="l">Barra lateral / topo</label><div class="colorrow"><input type="color" data-k="sidebar"><input class="in mono" data-hex="sidebar" maxlength="7"></div>
      <label class="l">Texto do menu</label><div class="colorrow"><input type="color" data-k="sidebar_text"><input class="in mono" data-hex="sidebar_text" maxlength="7">
        <label class="toggle"><input type="checkbox" data-auto> automático (contraste)</label></div>
      <label class="l">Modo padrão</label><div><select class="in" data-k="mode"><option value="auto">Automático (segue o sistema)</option><option value="light">Claro</option><option value="dark">Escuro</option></select></div>
      <label class="l">Densidade</label><div><select class="in" data-k="density"><option value="normal">Normal</option><option value="compact">Compacta</option></select></div>
      <label class="l">Dicas</label><div><label class="toggle"><input type="checkbox" data-tips> Mostrar dicas (caixas explicativas e textos de ajuda dos campos)</label></div>
    </div>
    <div class="theme-preview"><span class="btn primary sm">Botão</span> <span class="chip accent">objeto</span> ${SW.badge("ativo", "ok")} <a>link de exemplo</a></div>
    <p class="muted" style="font-size:12.5px">O tema vale para todos os administradores. O botão ◐ no topo alterna claro/escuro só neste navegador.</p></div>
    <div class="modal-foot">${SW.meta && SW.meta.dev_mode ? `<button class="btn" data-a="factory" title="Grava este tema como padrão dos próximos firmwares e imagens" style="margin-right:auto">Definir como padrão de fábrica</button>` : ""}<button class="btn" data-a="reset">Restaurar padrão</button><button class="btn" data-a="cancel">Descartar</button><button class="btn primary" data-a="save">Salvar tema</button></div></div>`);
  host.appendChild(card);
  const sw = SW.$(".swatches", card);
  const sync = () => {
    const auto = !t.sidebar_text;
    SW.$$("[data-k]", card).forEach((i) => (i.value = t[i.dataset.k] || (i.dataset.k === "sidebar_text" ? getComputedStyle(document.documentElement).getPropertyValue("--side-text").trim() || "#c9d3df" : "")));
    SW.$$("[data-hex]", card).forEach((i) => (i.value = t[i.dataset.hex] || (i.dataset.hex === "sidebar_text" ? "automático" : "")));
    SW.$("[data-auto]", card).checked = auto;
    SW.$("[data-tips]", card).checked = t.show_tips !== false;
    SW.$$('[data-k="sidebar_text"], [data-hex="sidebar_text"]', card).forEach((i) => (i.disabled = auto));
    SW.$$(".swatch", card).forEach((b) => b.classList.toggle("on", b.dataset.p === t.preset));
    localStorage.removeItem("sw.theme");
    SW.applyTheme(t);
  };
  Object.entries(SW.themePresets).forEach(([id, p]) => {
    const b = SW.h(`<button class="swatch" data-p="${id}" title="${SW.esc(p.label)}"><span style="background:${p.sidebar}"><i style="background:${p.accent}"></i></span>${SW.esc(p.label)}</button>`);
    b.onclick = () => { t = { ...t, preset: id, accent: p.accent, sidebar: p.sidebar, sidebar_text: "" }; sync(); };
    sw.appendChild(b);
  });
  SW.$$("[data-k]", card).forEach((i) => (i.oninput = () => { t[i.dataset.k] = i.value; if (i.type === "color") t.preset = "custom"; sync(); }));
  SW.$$("[data-hex]", card).forEach((i) => (i.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(i.value)) { t[i.dataset.hex] = i.value.toLowerCase(); t.preset = "custom"; } sync(); }));
  SW.$("[data-tips]", card).onchange = (e) => { t.show_tips = e.target.checked; sync(); };
  SW.$("[data-auto]", card).onchange = (e) => { t.sidebar_text = e.target.checked ? "" : (getComputedStyle(document.documentElement).getPropertyValue("--side-text").trim() || "#c9d3df"); sync(); };
  SW.$('[data-a="save"]', card).onclick = async () => { try { await SW.PUT("/api/ui/theme", t); Object.assign(saved, t); SW.toast("Tema salvo", "ok"); } catch (e) { SW.fail(e); } };
  SW.$('[data-a="cancel"]', card).onclick = () => { t = { ...saved }; sync(); };
  SW.$('[data-a="reset"]', card).onclick = async () => { try { t = await SW.GET("/api/ui/theme/default"); sync(); SW.toast("Padrão carregado — clique em Salvar tema para aplicar"); } catch (e) { SW.fail(e); } };
  const fb = SW.$('[data-a="factory"]', card);
  if (fb) fb.onclick = async () => {
    if (!(await SW.confirm("Definir este tema como <b>padrão de fábrica</b>?<br><span class=\"muted\">Ele passa a acompanhar os próximos firmwares e imagens: equipamentos novos nascem com ele e “Restaurar padrão” volta para ele.</span>", { ok: "Definir padrão" }))) return;
    try { await SW.PUT("/api/ui/theme/default", t); SW.toast("Tema definido como padrão de fábrica", "ok"); } catch (e) { SW.fail(e); }
  };
  sync();
};

SW.page("admins", {
  title: "Administradores",
  render(root) {
    const hostsDlg = (a) => SW.editDialog({
      title: `Hosts confiáveis — ${a.username}`,
      note: "Este administrador só consegue fazer login a partir destes IPs/redes. Vazio = qualquer origem (ainda sujeito aos hosts confiáveis globais em Configurações).",
      value: { trusted_hosts: a.trusted_hosts },
      fields: [{ key: "trusted_hosts", label: "IPs / redes", type: "list", placeholder: "10.0.0.200\n192.168.10.0/24" }],
      async onSave(o) { await SW.PUT(`/api/system/admins/${encodeURIComponent(a.username)}/trusted-hosts`, o); SW.toast("Hosts confiáveis atualizados", "ok"); lp.reload(); },
    });
    const lp = SW.listPage(root, {
      title: "Administradores", key: "username",
      create: () => SW.editDialog({ title: "Novo administrador", value: { username: "", password: "" },
        fields: [{ key: "username", label: "Usuário", required: true }, { key: "password", label: "Senha inicial", type: "password", required: true, help: "Mínimo 8 caracteres; troca obrigatória no primeiro login." }],
        async onSave(o) { await SW.POST("/api/system/admins", o); SW.toast("Administrador criado", "ok"); lp.reload(); } }),
      del: async (a) => { if (await SW.confirm(`Remover o administrador <b>${SW.esc(a.username)}</b>?`, { danger: true, ok: "Remover" })) { await SW.DEL(`/api/system/admins/${a.username}`).catch(SW.fail); lp.reload(); } },
      edit: (a) => hostsDlg(a),
      buttons: [{ label: "Alterar minha senha", fn: () => SW.changePassword(false) }],
      ctx: (a) => [{ label: "Hosts confiáveis…", onClick: () => hostsDlg(a) }, "-"],
      columns: [
        { label: "Usuário", get: (a) => `<b>${SW.esc(a.username)}</b>${a.username === SW.user ? " " + SW.badge("você", "info") : ""}` },
        { label: "Hosts confiáveis", get: (a) => (a.trusted_hosts.length ? SW.chips(a.trusted_hosts) : `<span class="muted">qualquer origem</span>`) },
        { label: "Situação", get: (a) => (a.must_change ? SW.badge("troca de senha pendente", "warn") : SW.badge("ativo", "ok")) },
      ],
      load: () => SW.GET("/api/system/admins"),
    });
  },
});

SW.page("revisions", {
  title: "Revisões de configuração",
  render(root) {
    const colorDiff = (t) => SW.esc(t).split("\n").map((l) => (l.startsWith("+") ? `<span class="add">${l}</span>` : l.startsWith("-") ? `<span class="del">${l}</span>` : l)).join("\n");
    const lp = SW.listPage(root, {
      title: "Revisões de configuração", key: "id",
      intro: "Cada alteração aplicada gera uma revisão versionada (git). É possível ver o que mudou e voltar a qualquer revisão — o rollback também passa pela aplicação atômica.",
      buttons: [
        { label: "Ver alterações", needSel: true, fn: async (r) => { const d = await SW.api("GET", `/api/revisions/${r.id}/diff`); SW.modal({ title: `Revisão ${r.id}: ${r.message}`, size: "lg", body: `<pre class="code">${colorDiff(d)}</pre>`, buttons: [{ label: "Fechar" }] }); } },
        { label: "Restaurar esta revisão", needSel: true, fn: async (r) => { if (await SW.confirm(`Voltar a configuração para a revisão <b>${r.id}</b> (${SW.esc(r.message)})?`, { ok: "Restaurar" })) { try { await SW.apply(SW.POST(`/api/revisions/${r.id}/rollback`)); lp.reload(); } catch (e) { SW.fail(e); } } } },
        { label: `${SW.icon.dl} Backup e restauração…`, fn: () => { location.hash = "#/backup"; } },
      ],
      columns: [
        { label: "Revisão", get: (r) => `<span class="mono">${SW.esc(r.id)}</span>` },
        { label: "Data", get: (r) => SW.fmtTime(r.date) },
        { label: "Autor", get: (r) => SW.esc(r.author) },
        { label: "Descrição", get: (r) => SW.esc(r.message) },
      ],
      noSort: true,
      load: () => SW.GET("/api/revisions"),
    });
  },
});

SW.page("services-status", {
  title: "Serviços",
  async render(root) {
    const dash = await SW.GET("/api/dashboard").catch(() => ({}));
    const lp = SW.listPage(root, {
      title: "Serviços", key: "unit", autoRefresh: 5,
      intro: (dash.dryrun ? SW.dryrunNote : "") + "Os serviços opcionais sobem <b>sob demanda</b>: o motor de aplicação liga cada um só quando a configuração precisa dele (ex.: IPsec só com túnel habilitado) e desliga quando deixa de precisar.",
      groupBy: (u) => (u.needed ? "Necessários pela configuração atual" : "Sob demanda (não utilizados agora)"),
      groupOrder: ["Necessários pela configuração atual", "Sob demanda (não utilizados agora)"],
      rowClass: (u) => (u.needed || u.state === "unused-active" ? "" : "disabled"),
      buttons: [
        { label: `${SW.icon.refresh} Reiniciar serviço`, needSel: true, fn: async (u) => { if (u && await SW.confirm(`Reiniciar <b>${SW.esc(u.label)}</b>?`)) { await SW.POST(`/api/system/services/${encodeURIComponent(u.unit)}/restart`).catch(SW.fail); SW.toast("Reiniciando…"); } } },
        { label: "Reaplicar configuração", fn: async () => { try { const r = await SW.POST("/api/system/reapply"); SW.toast("Reaplicado: " + r.actions.join(", "), "ok"); } catch (e) { SW.fail(e); } } },
        { label: "Reiniciar o firewall", fn: async () => { if (await SW.confirm("Reiniciar o Raspberry Pi agora?", { danger: true, ok: "Reiniciar" })) { await SW.POST("/api/system/reboot"); SW.toast("Reiniciando… aguarde cerca de 1 minuto."); } } },
      ],
      columns: [
        { label: "Serviço", get: (u) => `<b>${SW.esc(u.label)}</b><div class="muted mono">${SW.esc(u.unit)}</div>` },
        { label: "Estado", get: (u) => { const [cls, txt] = SW.svcState(u); return `<span class="dot ${cls}"></span>${txt}`; }, sort: (u) => u.state },
        { label: "Motivo", get: (u) => SW.esc(u.reason || "—") },
        { label: "systemd", get: (u) => `<span class="muted">${SW.esc(u.active)} (${SW.esc(u.sub)}) · ${SW.esc(u.enabled)}</span>` },
      ],
      load: () => SW.GET("/api/system/services"),
    });
  },
});

SW.changePassword = (forced) => {
  const m = SW.editDialog({
    title: forced ? "Troca de senha obrigatória" : "Alterar senha",
    note: forced ? "Por segurança, defina uma nova senha para continuar." : "",
    value: { old_password: "", new_password: "", confirm: "" },
    fields: [{ key: "old_password", label: "Senha atual", type: "password" }, { key: "new_password", label: "Nova senha", type: "password", help: "mínimo 8 caracteres" }, { key: "confirm", label: "Confirmar", type: "password" }],
    async onSave(o) {
      if (o.new_password !== o.confirm) throw new SW.ApiError(400, "as senhas não conferem");
      await SW.POST("/api/auth/password", { old_password: o.old_password, new_password: o.new_password });
      SW.toast("Senha alterada", "ok");
      if (forced) SW.boot();
    },
  });
  return m;
};

SW.page("backup", {
  title: "Backup e Restauração",
  render(root) {
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Backup e Restauração</h2></div>
      <div class="cards">
        <div class="card"><h3>${SW.icon.dl} Fazer backup</h3><div class="body">
          <p>Gera um arquivo <b>.swbk</b> com a configuração completa, <b>incluindo senhas</b> (PPPoE, chaves IPsec), e opcionalmente os administradores e certificados.</p>
          <div id="bf"></div></div>
          <div class="modal-foot"><button class="btn primary" id="bdl">${SW.icon.dl} Baixar backup</button></div></div>
        <div class="card"><h3>${SW.icon.up} Restaurar backup</h3><div class="body">
          <div class="dropzone" id="dz">Arraste o arquivo .swbk aqui ou <b>clique para escolher</b></div><input type="file" id="file" accept=".swbk,.json,.yaml,.yml" class="hidden">
          <div id="rf" style="margin-top:12px"></div><div id="rs"></div></div>
          <div class="modal-foot"><button class="btn" id="rinspect" disabled>Analisar</button><button class="btn primary" id="rgo" disabled>Restaurar</button></div></div>
      </div></div>`;
    const $ = (id) => SW.$("#" + id, root);
    const bf = SW.form([
      { key: "passphrase", label: "Senha do backup", type: "password", placeholder: "recomendado (mín. 8)", help: "Cifra o arquivo com AES-256. Sem ela, as senhas ficam legíveis no arquivo." },
      { key: "passphrase2", label: "Confirmar senha", type: "password" },
      { key: "include_admins", label: "Administradores", type: "bool", text: "Incluir usuários do painel (hash das senhas)" },
      { key: "include_certs", label: "Certificados", type: "bool", text: "Incluir certificados IPsec, CA da inspeção SSL e HTTPS do painel" },
    ], { passphrase: "", passphrase2: "", include_admins: true, include_certs: true });
    $("bf").appendChild(bf.el);
    $("bdl").onclick = async () => {
      const v = bf.get();
      if (v.passphrase !== v.passphrase2) return SW.toast("As senhas não conferem", "err");
      if (!v.passphrase && !(await SW.confirm("Baixar backup <b>sem criptografia</b>? As senhas de PPPoE e IPsec ficarão legíveis no arquivo.", { ok: "Baixar mesmo assim" }))) return;
      try {
        const res = await fetch("/api/backup/export", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": SW.csrf },
          body: JSON.stringify({ passphrase: v.passphrase, include_admins: v.include_admins, include_certs: v.include_certs }) });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new SW.ApiError(res.status, d.detail || "falha no backup"); }
        const name = (res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "berrycade.swbk";
        const url = URL.createObjectURL(await res.blob());
        const a = SW.h(`<a href="${url}" download="${SW.esc(name)}"></a>`);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        SW.toast("Backup gerado", "ok");
      } catch (e) { SW.fail(e); }
    };

    let file = null;
    const rf = SW.form([
      { key: "passphrase", label: "Senha do backup", type: "password", placeholder: "se o arquivo for cifrado" },
      { key: "restore_certs", label: "Certificados", type: "bool", text: "Restaurar certificados contidos no backup" },
      { key: "restore_admins", label: "Administradores", type: "bool", text: "Substituir os administradores atuais pelos do backup" },
    ], { passphrase: "", restore_certs: true, restore_admins: false });
    $("rf").appendChild(rf.el);
    const pickFile = (f) => { file = f; $("dz").innerHTML = `📄 <b>${SW.esc(f.name)}</b> (${SW.fmtBytes(f.size)}) — clique para trocar`; $("rinspect").disabled = false; $("rgo").disabled = true; $("rs").innerHTML = ""; };
    const fileInput = $("file");
    $("dz").onclick = () => fileInput.click();
    fileInput.onchange = () => fileInput.files[0] && pickFile(fileInput.files[0]);
    $("dz").ondragover = (e) => { e.preventDefault(); $("dz").classList.add("over"); };
    $("dz").ondragleave = () => $("dz").classList.remove("over");
    $("dz").ondrop = (e) => { e.preventDefault(); $("dz").classList.remove("over"); e.dataTransfer.files[0] && pickFile(e.dataTransfer.files[0]); };
    const form = () => { const v = rf.get(); const fd = new FormData(); fd.append("file", file); fd.append("passphrase", v.passphrase); fd.append("restore_certs", v.restore_certs); fd.append("restore_admins", v.restore_admins); return fd; };
    $("rinspect").onclick = async () => {
      try {
        const s = await SW.api("POST", "/api/backup/inspect", form());
        const c = s.counts;
        $("rs").innerHTML = `<div class="note" style="margin-top:12px"><div class="kv">
          <div>Criado em</div><div>${SW.fmtTime(s.created) || "—"}</div><div>Versão</div><div>${SW.esc(s.version || "anterior à 1.0.11")}</div><div>Hostname</div><div>${SW.esc(s.hostname)}</div>
          <div>IP da LAN</div><div class="mono">${SW.esc(s.lan || "—")}</div>
          <div>Conteúdo</div><div>${c.interfaces} interfaces · ${c.vlans} VLANs · ${c.policies} políticas · ${c.addresses} endereços · ${c.virtual_ips} VIPs · ${c.tunnels} túneis · ${c.webfilter_profiles} perfis web · ${c.reservations} reservas DHCP</div>
          <div>Senhas</div><div>${s.secrets.pppoe ? SW.badge("PPPoE", "ok") : SW.badge("sem PPPoE", "off")} ${s.secrets.ipsec_psk ? SW.badge(s.secrets.ipsec_psk + " PSK IPsec", "ok") : ""}</div>
          <div>Administradores</div><div>${s.has_admins ? "incluídos" : "não incluídos"}</div><div>Certificados</div><div>${s.files.length} arquivo(s)</div></div></div>
          ${s.lan && location.hostname !== s.lan.split("/")[0] ? `<div class="errbox">O IP da LAN do backup (${SW.esc(s.lan)}) é diferente do endereço atual. Após restaurar, acesse o novo IP e confirme em até 60 s, senão a restauração é desfeita.</div>` : ""}`;
        $("rgo").disabled = false;
      } catch (e) { $("rs").innerHTML = SW.errHtml(e); }
    };
    $("rgo").onclick = async () => {
      if (!(await SW.confirm("Restaurar este backup? A configuração atual será substituída (ela continua disponível em <b>Revisões</b>).", { ok: "Restaurar", danger: true }))) return;
      try { const r = await SW.apply(SW.api("POST", "/api/backup/restore", form())); SW.toast(`Backup restaurado (${r.restored_files} arquivo(s) de certificado)`, "ok"); }
      catch (e) { $("rs").innerHTML = SW.errHtml(e); }
    };
  },
});
