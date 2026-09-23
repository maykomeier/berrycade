/* VPN: túneis IPsec (wizard), certificados, Tailscale. */
"use strict";
const DEF_ADV = { ike_version: 2, ike_proposals: ["aes256-sha256-modp2048", "aes128-sha256-modp2048"], esp_proposals: ["aes256-sha256-modp2048", "aes128-sha256-modp2048"], ike_lifetime: 28800, esp_lifetime: 3600, dpd_delay: 30, start_action: "start", force_encap: false };
const advFields = (p) => [
  { type: "section", label: "Parâmetros avançados (fase 1 / fase 2)", show: (v) => v._adv },
  { key: `${p}ike_version`, label: "Versão IKE", type: "select", number: true, options: [{ value: 2, label: "IKEv2" }, { value: 1, label: "IKEv1" }], show: (v) => v._adv },
  { key: `${p}ike_proposals`, label: "Propostas fase 1 (IKE)", type: "list", show: (v) => v._adv, help: "formato strongSwan: cifra-integridade-grupoDH" },
  { key: `${p}esp_proposals`, label: "Propostas fase 2 (ESP)", type: "list", show: (v) => v._adv, help: "incluir grupo DH ativa PFS" },
  { key: `${p}ike_lifetime`, label: "Vida da fase 1 (s)", type: "number", show: (v) => v._adv },
  { key: `${p}esp_lifetime`, label: "Vida da fase 2 (s)", type: "number", show: (v) => v._adv },
  { key: `${p}dpd_delay`, label: "Dead Peer Detection (s)", type: "number", show: (v) => v._adv },
  { key: `${p}start_action`, label: "Iniciar túnel", type: "select", options: [{ value: "start", label: "sempre (ativo)" }, { value: "trap", label: "sob demanda (tráfego)" }, { value: "none", label: "aguardar o peer" }], show: (v) => v._adv },
  { key: `${p}force_encap`, label: "NAT-T", type: "bool", text: "Forçar encapsulamento UDP", show: (v) => v._adv },
];

SW.page("ipsec", {
  title: "Túneis IPsec",
  async render(root) {
    await SW.loadMeta(true);
    let status = {};
    const c = SW.crud("ipsec", "name");
    const certOpts = async () => { const x = await SW.GET("/api/vpn/certs"); return { local: x.local.map((k) => k.name), ca: x.ca.map((k) => k.name) }; };
    const edit = async (t) => {
      const certs = await certOpts();
      const v = SW.clone(t); v._adv = false;
      SW.editDialog({
        title: `Editar túnel ${t.name}`, size: "lg", value: v,
        fields: [
          { key: "remote_gateway", label: "Gateway remoto", required: true },
          { key: "local_interface", label: "Interface local", type: "select", options: () => SW.meta.interfaces },
          { key: "zone", label: "Zona", type: "select", options: () => SW.meta.zones },
          { key: "enabled", label: "Status", type: "bool", text: "Habilitado" },
          { key: "auth.method", label: "Autenticação", type: "select", options: [{ value: "psk", label: "Chave pré-compartilhada" }, { value: "cert", label: "Certificado" }] },
          { key: "auth.psk", label: "Chave (PSK)", type: "password", show: (x) => x.auth.method === "psk" },
          { key: "auth.local_cert", label: "Certificado local", type: "select", options: ["", ...certs.local], show: (x) => x.auth.method === "cert" },
          { key: "auth.ca_cert", label: "CA do peer", type: "select", options: ["", ...certs.ca], show: (x) => x.auth.method === "cert" },
          { key: "auth.local_id", label: "ID local", placeholder: "vazio = IP local" },
          { key: "auth.remote_id", label: "ID remoto", placeholder: "vazio = qualquer" },
          { key: "local_subnets", label: "Redes locais", type: "list" },
          { key: "remote_subnets", label: "Redes remotas", type: "list" },
          { key: "_adv", label: "Modo avançado", type: "bool", text: "Mostrar parâmetros de criptografia" },
          ...advFields("advanced."),
        ],
        async onSave(o) { delete o._adv; await c.update(t.name, o); lp.reload(); },
      });
    };
    const act = async (t, a) => { SW.toast(a === "up" ? "Iniciando túnel…" : "Derrubando túnel…"); try { await SW.POST(`/api/vpn/ipsec/${t.name}/${a}`); } catch (e) { SW.fail(e); } lp.reload(); };
    const lp = SW.listPage(root, {
      title: "Túneis IPsec", key: "name", autoRefresh: 10,
      create: () => (location.hash = "#/ipsec-wizard"), edit, del: (t) => c.remove(t, `túnel ${t.name}`).then(() => lp.reload()),
      buttons: [{ label: `${SW.icon.play} Subir`, needSel: true, fn: (t) => t && act(t, "up") }, { label: `${SW.icon.stop} Derrubar`, needSel: true, fn: (t) => t && act(t, "down") }],
      ctx: (t) => [{ label: "Subir túnel", icon: SW.icon.play, onClick: () => act(t, "up") }, { label: "Derrubar túnel", icon: SW.icon.stop, onClick: () => act(t, "down") }, "-"],
      rowClass: (t) => (t.enabled ? "" : "disabled"),
      columns: [
        { label: "Status", get: (t) => { const s = status[t.name] || {}; return s.up ? SW.badge("● up", "ok") : s.ike_state === "ESTABLISHED" ? SW.badge("fase 1 ok", "warn") : SW.badge("● down", "bad"); } },
        { label: "Nome", get: (t) => `<b>${SW.esc(t.name)}</b><div class="muted mono">xfrm-${SW.esc(t.name)}</div>` },
        { label: "Gateway remoto", get: (t) => `<span class="mono">${SW.esc(t.remote_gateway)}</span>` },
        { label: "Redes locais", get: (t) => SW.chips(t.local_subnets) },
        { label: "Redes remotas", get: (t) => SW.chips(t.remote_subnets) },
        { label: "Autenticação", get: (t) => (t.auth.method === "psk" ? "PSK" : "Certificado") },
        { label: "Tráfego", get: (t) => { const s = status[t.name] || {}; return s.up ? `↓ ${SW.fmtBytes(s.bytes_in)} · ↑ ${SW.fmtBytes(s.bytes_out)}` : ""; } },
        { label: "Estabelecido", get: (t) => SW.esc((status[t.name] || {}).established || "") },
      ],
      async load() {
        const [list, st] = await Promise.all([SW.GET("/api/config/ipsec"), SW.GET("/api/vpn/ipsec/status").catch(() => [])]);
        status = Object.fromEntries(st.map((s) => [s.name, s]));
        return list;
      },
    });
  },
});

SW.page("ipsec-wizard", {
  title: "Assistente IPsec",
  async render(root) {
    await SW.loadMeta(true);
    const certs = await SW.GET("/api/vpn/certs");
    const netOf = (cidr) => { const [ip, p] = cidr.split("/"); const m = SW.ip.mask(+p); return SW.ip.toStr(SW.ip.toInt(ip) & m) + "/" + p; };
    const v = { name: "", remote_gateway: "", local_interface: "wan", auth_method: "psk", psk: "", local_cert: "", ca_cert: "", local_id: "", remote_id: "",
      local_subnets: SW.meta.members.filter((m) => m.network && m.zone === "lan").map((m) => netOf(m.network)), remote_subnets: [], zone: "vpn", local_zones: ["lan"], create_policies: true, advanced: SW.clone(DEF_ADV), _adv: false };
    const steps = [
      { t: "1. Peer remoto", f: [
        { key: "name", label: "Nome do túnel", required: true, placeholder: "ex.: matriz (até 10 caracteres)" },
        { key: "remote_gateway", label: "IP / FQDN do peer", required: true, placeholder: "200.200.200.200" },
        { key: "local_interface", label: "Interface local", type: "select", options: () => SW.meta.interfaces, help: "Por onde o túnel sai (normalmente a WAN)." },
      ] },
      { t: "2. Autenticação", f: [
        { key: "auth_method", label: "Método", type: "select", options: [{ value: "psk", label: "Chave pré-compartilhada (PSK)" }, { value: "cert", label: "Certificado" }] },
        { key: "psk", label: "Chave pré-compartilhada", type: "password", show: (x) => x.auth_method === "psk", help: "Mínimo 8 caracteres; use a mesma no peer." },
        { key: "local_cert", label: "Certificado local", type: "select", options: ["", ...certs.local.map((c) => c.name)], show: (x) => x.auth_method === "cert", help: "Gere em VPN › Certificados." },
        { key: "ca_cert", label: "CA do peer", type: "select", options: ["", ...certs.ca.map((c) => c.name)], show: (x) => x.auth_method === "cert" },
        { key: "local_id", label: "ID local", placeholder: "opcional", show: (x) => x.auth_method === "cert" },
        { key: "remote_id", label: "ID remoto", placeholder: "opcional (ex.: CN do certificado do peer)", show: (x) => x.auth_method === "cert" },
      ] },
      { t: "3. Redes", f: [
        { key: "local_subnets", label: "Sub-redes locais", type: "list", placeholder: "192.168.10.0/24", help: "Redes deste lado que poderão usar o túnel." },
        { key: "remote_subnets", label: "Sub-redes remotas", type: "list", placeholder: "172.16.50.0/24", help: "Redes do outro lado (recebem rota pelo túnel)." },
        { key: "zone", label: "Zona do túnel", type: "select", options: () => [...new Set(["vpn", ...SW.meta.zones])] },
        { key: "create_policies", label: "Políticas", type: "bool", text: "Criar políticas de ida e volta automaticamente" },
        { key: "local_zones", label: "Zonas locais", type: "multi", options: () => SW.meta.zones, show: (x) => x.create_policies },
        { key: "_adv", label: "Modo avançado", type: "bool", text: "Editar parâmetros de criptografia (fase 1/2)" },
        ...advFields("advanced."),
      ] },
    ];
    let i = 0;
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Assistente de VPN IPsec (site-to-site)</h2></div>
      <div class="card" style="max-width:860px"><div class="body"><div class="steps">${steps.map((s) => `<div>${s.t}</div>`).join("")}<div>4. Revisão</div></div><div id="err"></div><div id="step"></div></div>
      <div class="modal-foot"><button class="btn" id="back">Voltar</button><button class="btn primary" id="next">Avançar</button></div></div></div>`;
    let fm;
    const draw = () => {
      SW.$$(".steps div", root).forEach((d, k) => d.classList.toggle("on", k === i));
      SW.$("#err", root).innerHTML = "";
      const box = SW.$("#step", root); box.innerHTML = "";
      SW.$("#back", root).disabled = i === 0;
      SW.$("#next", root).textContent = i === steps.length ? "Criar túnel" : "Avançar";
      if (i < steps.length) { fm = SW.form(steps[i].f, v); box.appendChild(fm.el); return; }
      const a = v.advanced;
      box.innerHTML = `<div class="kv"><div>Túnel</div><div><b>${SW.esc(v.name)}</b> (interface xfrm-${SW.esc(v.name)}, zona ${SW.esc(v.zone)})</div>
        <div>Peer</div><div class="mono">${SW.esc(v.remote_gateway)} via ${SW.esc(v.local_interface)}</div>
        <div>Autenticação</div><div>${v.auth_method === "psk" ? "PSK" : "Certificado " + SW.esc(v.local_cert)}</div>
        <div>Redes locais</div><div>${SW.chips(v.local_subnets)}</div><div>Redes remotas</div><div>${SW.chips(v.remote_subnets)}</div>
        <div>Fase 1</div><div class="mono">IKEv${a.ike_version} · ${SW.esc(a.ike_proposals.join(", "))} · ${a.ike_lifetime}s</div>
        <div>Fase 2</div><div class="mono">${SW.esc(a.esp_proposals.join(", "))} · ${a.esp_lifetime}s · DPD ${a.dpd_delay}s</div>
        <div>Políticas</div><div>${v.create_policies ? `${SW.esc(v.local_zones.join(", "))} ⇄ ${SW.esc(v.zone)} (sem NAT)` : "não criar"}</div></div>
        <p class="muted">Configure o peer com os mesmos parâmetros (redes invertidas).</p>`;
    };
    SW.$("#back", root).onclick = () => { if (i < steps.length) Object.assign(v, fm.get()); i--; draw(); };
    SW.$("#next", root).onclick = async () => {
      if (i < steps.length) { Object.assign(v, fm.get()); i++; return draw(); }
      const body = SW.clone(v); delete body._adv;
      try { await SW.apply(SW.POST("/api/vpn/ipsec/wizard", body)); location.hash = "#/ipsec"; } catch (e) { SW.$("#err", root).innerHTML = SW.errHtml(e); }
    };
    draw();
  },
});

SW.page("certs", {
  title: "Certificados",
  async render(root) {
    const draw = async () => {
      const c = await SW.GET("/api/vpn/certs");
      const rows = (list, kind) => list.length ? list.map((x) => `<tr><td><b>${SW.esc(x.name)}</b></td><td class="mono" style="white-space:pre-wrap">${SW.esc(x.info)}</td>
        <td><a class="btn sm" href="/api/vpn/certs/${kind}/${encodeURIComponent(x.name)}">${SW.icon.dl} Baixar</a></td></tr>`).join("") : `<tr><td class="empty" colspan="3">Nenhum</td></tr>`;
      root.innerHTML = `<div class="page"><div class="page-head"><h2>Certificados IPsec</h2></div>
        <div class="toolbar"><button class="btn primary" id="gen">${SW.icon.plus} Gerar certificado local</button><button class="btn" id="imp">${SW.icon.plus} Importar CA do peer</button></div>
        <div class="cards"><div class="card full"><h3>Certificados locais</h3><div class="body" style="padding:0"><table class="grid"><tbody>${rows(c.local, "local")}</tbody></table></div></div>
        <div class="card full"><h3>Autoridades certificadoras (CA)</h3><div class="body" style="padding:0"><table class="grid"><tbody>${rows(c.ca, "ca")}</tbody></table></div></div></div></div>`;
      SW.$("#gen", root).onclick = () => SW.editDialog({ title: "Gerar certificado local", note: "Cria (uma vez) a CA local <b>berrycade-ca</b> e emite um certificado ECDSA assinado por ela. Envie a CA ao peer.",
        value: { name: "", common_name: "", days: 3650 },
        fields: [{ key: "name", label: "Nome do arquivo", required: true }, { key: "common_name", label: "CN / ID", required: true, placeholder: "fw.empresa.com.br" }, { key: "days", label: "Validade (dias)", type: "number" }],
        async onSave(o) { await SW.POST("/api/vpn/certs/generate", o); SW.toast("Certificado gerado", "ok"); draw(); } });
      SW.$("#imp", root).onclick = () => SW.editDialog({ title: "Importar CA do peer", value: { name: "", pem: "" },
        fields: [{ key: "name", label: "Nome", required: true }, { key: "pem", label: "Certificado (PEM)", type: "textarea", placeholder: "-----BEGIN CERTIFICATE-----" }],
        async onSave(o) { await SW.POST("/api/vpn/certs/import-ca", o); SW.toast("CA importada", "ok"); draw(); } });
    };
    draw().catch(SW.fail);
  },
});

SW.page("tailscale", {
  title: "Tailscale",
  async render(root) {
    await SW.loadMeta(true);
    const draw = async () => {
      const d = await SW.GET("/api/vpn/tailscale/status");
      const st = d.status, cfg = d.config;
      const state = !st.installed ? SW.badge("não instalado", "bad") : !st.daemon ? SW.badge("parado", "off") : st.backend_state === "Running" ? SW.badge("conectado", "ok") : SW.badge(st.backend_state || "?", "warn");
      root.innerHTML = `<div class="page"><div class="page-head"><h2>Tailscale</h2></div>
        <div class="cards">
          <div class="card wide"><h3>Configuração</h3><div class="body" id="f"></div><div class="modal-foot"><button class="btn primary" id="save">Aplicar</button></div></div>
          <div class="card wide"><h3>Estado do nó</h3><div class="body"><div class="kv">
            <div>Estado</div><div>${state}</div>
            ${st.self ? `<div>Nome</div><div>${SW.esc(st.self.dns_name || st.self.hostname)}</div><div>IPs Tailscale</div><div class="mono">${SW.esc(st.self.ips.join(", "))}</div>
            <div>Tailnet</div><div>${SW.esc(st.tailnet || "")}</div><div>Rotas aprovadas</div><div>${SW.chips(st.self.primary_routes)}</div>` : ""}
            <div>Rotas anunciadas</div><div>${SW.chips(d.routes)}</div></div>
            ${st.auth_url ? `<div class="note" style="margin-top:10px">Autentique este nó: <a href="${SW.esc(st.auth_url)}" target="_blank" rel="noopener">${SW.esc(st.auth_url)}</a></div>` : ""}
            <p class="muted">As rotas anunciadas precisam ser aprovadas no console administrativo do Tailscale.</p></div>
            <div class="modal-foot"><button class="btn" id="ts-login" ${cfg.enabled ? "" : "disabled"}>Autenticar / conectar</button><button class="btn danger" id="ts-logout" ${st.backend_state === "Running" ? "" : "disabled"}>Desconectar (logout)</button></div></div>
          <div class="card full"><h3>Peers</h3><div class="body" style="padding:0"><table class="grid"><thead><tr><th></th><th>Nome</th><th>IP</th><th>SO</th><th>Rotas</th><th>Tráfego</th></tr></thead><tbody>
            ${(st.peers || []).map((p) => `<tr><td><span class="dot ${p.online ? "ok" : "off"}"></span></td><td>${SW.esc(p.hostname)}<div class="muted">${SW.esc(p.dns_name)}</div></td><td class="mono">${SW.esc((p.ips || [])[0] || "")}</td>
              <td>${SW.esc(p.os)}</td><td>${SW.chips(p.routes)}</td><td>↓ ${SW.fmtBytes(p.rx)} · ↑ ${SW.fmtBytes(p.tx)}</td></tr>`).join("") || `<tr><td class="empty" colspan="6">Nenhum peer</td></tr>`}
          </tbody></table></div></div></div></div>`;
      const fm = SW.form([
        { key: "enabled", label: "Tailscale", type: "bool", text: "Habilitar cliente" },
        { key: "hostname", label: "Nome do nó" },
        { key: "zone", label: "Zona", type: "select", options: () => [...new Set(["tailscale", ...SW.meta.zones])] },
        { key: "advertise_routes", label: "Anunciar redes (subnet router)", type: "multi", options: () => [...SW.meta.interfaces, ...SW.meta.vlans] },
        { key: "extra_routes", label: "Rotas adicionais", type: "list", placeholder: "CIDR por linha" },
        { key: "accept_routes", label: "Aceitar rotas", type: "bool", text: "Usar rotas anunciadas por outros nós" },
        { key: "advertise_exit_node", label: "Exit node", type: "bool", text: "Oferecer este firewall como exit node" },
        { key: "allow_access", label: "Acesso administrativo", type: "checks", options: [{ value: "https", label: "HTTPS" }, { value: "ssh", label: "SSH" }, { value: "ping", label: "PING" }] },
      ], cfg);
      SW.$("#f", root).appendChild(fm.el);
      SW.$("#save", root).onclick = async () => { try { await SW.apply(SW.PUT("/api/settings/tailscale", fm.get())); draw(); } catch (e) { SW.fail(e); } };
      SW.$("#ts-login", root).onclick = () => SW.editDialog({ title: "Autenticar Tailscale", note: "Informe uma <b>auth key</b> (gerada no console do Tailscale) ou deixe em branco para obter um link de login.",
        value: { auth_key: "" }, fields: [{ key: "auth_key", label: "Auth key", type: "password", placeholder: "tskey-auth-… (opcional)" }],
        async onSave(o) {
          SW.toast("Conectando ao Tailscale…");
          const r = await SW.POST("/api/vpn/tailscale/login", o);
          if (r.auth_url) SW.modal({ title: "Login Tailscale", body: `<p>Abra o link para autorizar este nó:</p><p><a href="${SW.esc(r.auth_url)}" target="_blank" rel="noopener">${SW.esc(r.auth_url)}</a></p>`, buttons: [{ label: "Fechar", onClick: (m) => { m.close(); draw(); } }] });
          else draw();
        } });
      SW.$("#ts-logout", root).onclick = async () => { if (await SW.confirm("Desconectar este nó do Tailscale?", { danger: true, ok: "Desconectar" })) { await SW.POST("/api/vpn/tailscale/logout").catch(SW.fail); draw(); } };
    };
    draw().catch(SW.fail);
  },
});
