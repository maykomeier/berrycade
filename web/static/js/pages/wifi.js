/* WiFi: UniFi access points and wireless clients (read-only via SSH). */
"use strict";
SW.signal = (dbm) => {
  if (dbm == null) return "—";
  const q = dbm >= -55 ? ["excelente", "ok", 4] : dbm >= -67 ? ["bom", "ok", 3] : dbm >= -75 ? ["regular", "warn", 2] : ["fraco", "bad", 1];
  const bars = [1, 2, 3, 4].map((i) => `<i style="display:inline-block;width:4px;height:${4 + i * 3}px;margin-right:1px;vertical-align:bottom;border-radius:1px;background:${i <= q[2] ? `var(--${q[1] === "ok" ? "ok" : q[1] === "warn" ? "warn" : "bad"})` : "var(--border)"}"></i>`).join("");
  return `<span title="${q[0]}">${bars}</span> <span class="mono">${dbm} dBm</span>`;
};

SW.apKeyHelp = async () => {
  const key = await SW.GET("/api/wifi/pubkey");
  const cmd = `mkdir -p ~/.ssh /etc/dropbear; K='${key}'; for F in ~/.ssh/authorized_keys /etc/dropbear/authorized_keys; do grep -qF "$K" $F 2>/dev/null || echo "$K" >> $F; chmod 600 $F; done; echo ok`;
  SW.modal({ title: "Autorizar o firewall no access point", size: "lg", body: `
    <p>O firewall acessa os APs <b>somente para leitura</b> (clientes, sinal, canais), usando a própria chave SSH — nenhuma senha fica armazenada.
    Faça uma vez em cada AP: entre por SSH com o usuário do dispositivo (definido na controladora em <i>Device SSH Authentication</i>; padrão de fábrica <span class="mono">ubnt</span>) e cole o comando abaixo.</p>
    <pre class="code" id="kcmd">${SW.esc(cmd)}</pre>
    <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="kcopy">Copiar comando</button></div>
    <p class="muted">Se o AP estiver adotado por uma controladora UniFi, prefira cadastrar a chave nela (Settings › System › Device SSH Authentication › SSH Keys), senão ela pode removê-la ao reprovisionar. Chave pública:</p>
    <pre class="code">${SW.esc(key)}</pre>`, buttons: [{ label: "Fechar" }],
    onOpen: (m) => { SW.$("#kcopy", m.el).onclick = async () => { try { await navigator.clipboard.writeText(cmd); SW.toast("Copiado", "ok"); } catch (e) { SW.toast("Selecione o texto e copie manualmente", "err"); } }; } });
};

SW.page("wifi-aps", {
  title: "Access Points",
  async render(root) {
    const c = SW.crud("access_points", "name");
    let st = { aps: [] };
    const authorizeDlg = (a) => SW.editDialog({
      title: `Reautorizar ${a.name}`,
      note: "Informe a senha SSH do AP. Ela é usada uma única vez para instalar a chave do firewall e <b>não é armazenada</b>.",
      value: { username: a.username, password: "" },
      fields: [{ key: "username", label: "Usuário SSH" }, { key: "password", label: "Senha SSH", type: "password", required: true }],
      async onSave(o) {
        const r = await SW.POST("/api/wifi/authorize", { host: a.host, username: o.username, password: o.password });
        if (o.username !== a.username) await c.update(a.name, { ...a, username: o.username });
        SW.toast(r.message, "ok"); await SW.POST("/api/wifi/refresh").catch(() => {}); lp.reload();
      },
    });
    const dlg = (a) => SW.editDialog({
      title: a ? `Editar ${a.name}` : "Adicionar access point",
      note: a ? "" : "Informe o IP e o acesso SSH do AP (usuário definido na controladora em <i>Device SSH Authentication</i>; padrão de fábrica <span class=\"mono\">ubnt</span>/<span class=\"mono\">ubnt</span>). A senha é usada <b>uma única vez</b> para o firewall instalar a própria chave no AP — ela não é armazenada. Depois disso o monitoramento é feito somente por chave e somente leitura.",
      value: a ? { name: a.name, host: a.host, username: a.username, enabled: a.enabled, comment: a.comment } : { name: "", host: "", username: "ubnt", password: "", enabled: true, comment: "" },
      fields: [
        { key: "name", label: "Nome", required: true, placeholder: "ex.: Sala" },
        { key: "host", label: "IP do AP", required: true, placeholder: "10.0.0.167" },
        { key: "username", label: "Usuário SSH" },
        ...(a ? [] : [{ key: "password", label: "Senha SSH", type: "password", placeholder: "deixe em branco se a chave já foi autorizada" }]),
        { key: "comment", label: "Local / comentário" },
        { key: "enabled", label: "Status", type: "bool", text: "Monitorar" },
      ],
      async onSave(o) {
        const pw = o.password; delete o.password;
        if (!a && pw) {
          const r = await SW.POST("/api/wifi/authorize", { host: o.host, username: o.username, password: pw });
          SW.toast(r.message, "ok");
        }
        if (a) await c.update(a.name, o); else await c.create(o);
        await SW.POST("/api/wifi/refresh").catch(() => {});
        lp.reload();
      },
    });
    const lp = SW.listPage(root, {
      title: "Access Points", key: "name", autoRefresh: 15,
      intro: `Access points UniFi monitorados diretamente por SSH (<span class="mono">mca-dump</span>), sem depender da controladora. Coleta a cada 30 s. <a href="#/wifi-clients">Ver clientes Wi-Fi</a>`,
      create: () => dlg(null), edit: dlg, del: (a) => c.remove(a, `AP ${a.name}`).then(() => lp.reload()),
      buttons: [{ label: `${SW.icon.refresh} Coletar agora`, fn: async () => { await SW.POST("/api/wifi/refresh").catch(SW.fail); lp.reload(); } },
        { label: "Reautorizar (senha)…", needSel: true, fn: (a) => a && authorizeDlg(a) },
        { label: "Autorização manual…", fn: () => SW.apKeyHelp().catch(SW.fail) }],
      ctx: (a) => [{ label: "Reautorizar com senha…", onClick: () => authorizeDlg(a) }, "-"],
      rowClass: (a) => (a.enabled ? "" : "disabled"),
      columns: [
        { label: "", width: "28px", get: (a) => `<span class="dot ${a.online ? "ok" : a.online === false ? "bad" : "off"}"></span>` },
        { label: "Nome", get: (a) => `<b>${SW.esc(a.name)}</b><div class="muted">${SW.esc(a.hostname || a.comment || "")}</div>` },
        { label: "IP", get: (a) => `<span class="mono">${SW.esc(a.host)}</span>` },
        { label: "Modelo / firmware", get: (a) => (a.online ? `${SW.esc(a.model)}<div class="muted mono">${SW.esc(a.version)}</div>` : a.error ? `<span style="color:var(--bad)">${SW.esc(a.error)}</span>` : `<span class="muted">aguardando coleta</span>`) },
        { label: "Rádios", get: (a) => (a.radios || []).map((r) => `<span class="chip">${SW.esc(r.band)} · canal ${SW.esc(r.channel)} · ${r.clients} cli.</span>`).join(" ") },
        { label: "SSIDs", get: (a) => (a.ssids || []).map((s) => `<span class="chip accent">${SW.esc(s.ssid)} (${s.clients})</span>`).join(" ") },
        { label: "Clientes", get: (a) => a.num_clients ?? 0, sort: (a) => a.num_clients || 0 },
        { label: "Uplink", get: (a) => (a.uplink ? (a.uplink >= 1000 ? a.uplink / 1000 + " Gbps" : a.uplink + " Mbps") : "—") },
        { label: "Uptime", get: (a) => (a.uptime ? SW.fmtDur(a.uptime) : "—"), sort: (a) => a.uptime || 0 },
        { label: "Controladora", get: (a) => (a.managed_by ? `<span class="muted mono" title="AP adotado por uma controladora">${SW.esc(a.managed_by.replace(/^https?:\/\//, "").replace("/inform", ""))}</span>` : a.online ? SW.badge("independente", "ok") : "") },
      ],
      async load() { st = await SW.GET("/api/wifi"); return st.aps; },
    });
  },
});

SW.deviceNameDlg = (c, done) => SW.editDialog({
  title: "Nome do dispositivo",
  note: `Nome exibido para <span class="mono">${SW.esc(c.mac)}</span> em todo o painel (Wi-Fi, DHCP). Tem prioridade sobre o nome detectado.`,
  value: { name: c.name_source === "personalizado" ? c.hostname : c.hostname || "" },
  fields: [{ key: "name", label: "Nome", required: true, placeholder: "ex.: Echo da sala" }],
  async onSave(o) {
    const crud = SW.crud("device_names", "mac");
    if (c.name_source === "personalizado") await crud.update(c.mac, { mac: c.mac, name: o.name });
    else await crud.create({ mac: c.mac, name: o.name });
    done && done();
  },
});

SW.page("wifi-clients", {
  title: "Clientes Wi-Fi",
  render(root) {
    const lp = SW.listPage(root, {
      title: "Clientes Wi-Fi", key: "mac", autoRefresh: 15,
      buttons: [{ label: `${SW.icon.edit} Definir nome`, needSel: true, fn: (c) => c && SW.deviceNameDlg(c, () => lp.reload()) }],
      ctx: (c) => [
        { label: "Definir nome…", icon: SW.icon.edit, onClick: () => SW.deviceNameDlg(c, () => lp.reload()) },
        c.name_source === "personalizado" ? { label: "Remover nome personalizado", onClick: async () => { try { await SW.apply(SW.DEL(`/api/config/device_names/${encodeURIComponent(c.mac)}`)); lp.reload(); } catch (e) { SW.fail(e); } } } : null,
        { label: "Filtrar sessões deste IP", onClick: () => { location.hash = "#/sessions"; } },
      ].filter(Boolean),
      intro: "Dispositivos conectados aos access points monitorados. Nome: personalizado → DHCP do firewall → aprendido pelo AP → DNS reverso da LAN (clique com o botão direito para definir um nome). Sinal: acima de −55 dBm excelente, até −67 bom, até −75 regular, abaixo disso fraco.",
      groupBy: (c) => c.ssid,
      columns: [
        { label: "Dispositivo", get: (c) => `<b title="${SW.esc(c.name_source ? "nome via " + c.name_source : "sem nome — clique com o botão direito para definir")}">${SW.esc(c.hostname || c.ip || c.mac)}</b>${c.name_source === "personalizado" ? ` <span class="muted" title="nome personalizado">✎</span>` : ""}
            <div class="muted mono">${SW.esc(c.ip)} · ${SW.esc(c.mac)}</div>
            <div>${c.random_mac ? `<span class="chip" title="MAC aleatório/privado: o fabricante não pode ser identificado">MAC privado</span>` : c.vendor ? `<span class="chip">${SW.esc(c.vendor)}</span>` : ""}</div>`,
          text: (c) => `${c.hostname} ${c.ip} ${c.mac} ${c.vendor}` },
        { label: "AP", get: (c) => SW.esc(c.ap) },
        { label: "Banda / canal", get: (c) => `${SW.esc(c.band)} · ${SW.esc(c.channel)}<div class="muted">802.11${SW.esc(c.standard)}${c.nss ? ` · ${c.nss}x${c.nss}` : ""}</div>`, sort: (c) => c.band },
        { label: "Sinal", get: (c) => SW.signal(c.signal), sort: (c) => -(c.signal ?? -100) },
        { label: "Taxa ↓ / ↑", get: (c) => `${c.tx_rate} / ${c.rx_rate} Mbps`, sort: (c) => c.tx_rate },
        { label: "Tráfego ↓ / ↑", get: (c) => `${SW.fmtBytes(c.tx_bytes)} / ${SW.fmtBytes(c.rx_bytes)}`, sort: (c) => c.tx_bytes + c.rx_bytes },
        { label: "Conectado há", get: (c) => SW.fmtDur(c.uptime), sort: (c) => c.uptime },
        { label: "Qualidade", get: (c) => (c.satisfaction >= 0 ? SW.badge(c.satisfaction + "%", c.satisfaction >= 80 ? "ok" : c.satisfaction >= 50 ? "warn" : "bad") : "—"), sort: (c) => c.satisfaction },
        { label: "VLAN", get: (c) => (c.vlan ? c.vlan : `<span class="muted">nativa</span>`) },
      ],
      load: async () => (await SW.GET("/api/wifi")).clients,
    });
  },
});
