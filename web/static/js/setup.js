/* First-access setup wizard: ports (LAN/WAN by MAC), LAN, WAN, identity. */
"use strict";
SW.setupWizard = async ({ forced = false } = {}) => {
  const [nics, ifs, sys] = await Promise.all([SW.GET("/api/setup/nics"), SW.GET("/api/config/interfaces"), SW.GET("/api/settings/system")]);
  const lanIf = ifs.find((i) => i.name === "lan") || {}, wanIf = ifs.find((i) => i.name === "wan") || {};
  const onboard = nics.find((n) => n.onboard) || nics[0];
  const usb = nics.find((n) => n !== onboard);
  const v = {
    roles: Object.fromEntries(nics.map((n) => [n.device, n.assigned_to === "lan" ? "lan" : n.assigned_to === "wan" ? "wan" : ""])),
    lan_alias: lanIf.alias && !/onboard|usb/i.test(lanIf.alias) ? lanIf.alias : "porta1",
    wan_alias: wanIf.alias && !/onboard|usb|pppoe/i.test(wanIf.alias) ? wanIf.alias : "porta2",
    lan_address: lanIf.address || "10.0.0.99/24", lan_gateway: lanIf.gateway || "", lan_dhcp: !!(lanIf.dhcp_server && lanIf.dhcp_server.enabled),
    dns: (sys.dns.servers || ["8.8.8.8"]).join(", "),
    wan: { mode: wanIf.enabled ? wanIf.mode : "pppoe", address: wanIf.address || "", gateway: wanIf.gateway || "",
      pppoe_username: (wanIf.pppoe && wanIf.pppoe.username) || "", pppoe_password: "", pppoe_auth: (wanIf.pppoe && wanIf.pppoe.auth) || ["pap", "chap"] },
    hostname: sys.hostname, timezone: sys.timezone,
  };
  if (!Object.values(v.roles).includes("lan") && onboard) v.roles[onboard.device] = "lan";
  if (!Object.values(v.roles).includes("wan") && usb) v.roles[usb.device] = "wan";

  let step = 0, fm = null;
  const titles = ["Portas", "LAN", "WAN", "Sistema", "Resumo"];
  const body = SW.h(`<div><div class="steps">${titles.map((t, i) => `<div>${i + 1}. ${t}</div>`).join("")}</div><div id="wz"></div></div>`);
  const wz = SW.$("#wz", body);
  const dev = (role) => Object.keys(v.roles).find((d) => v.roles[d] === role);

  const draw = () => {
    SW.$$(".steps div", body).forEach((d, i) => d.classList.toggle("on", i === step));
    m.setError(null);
    wz.innerHTML = "";
    fm = null;
    if (step === 0) {
      wz.appendChild(SW.h(`<div><p>Detectamos as portas de rede abaixo. Escolha qual será a <b>LAN</b> (rede interna, onde fica o painel) e qual será a <b>WAN</b> (internet). A escolha é gravada pelo endereço MAC, então os nomes não trocam entre reinicializações.</p>
        <table class="grid"><thead><tr><th>Porta</th><th>Adaptador</th><th>MAC</th><th>Link</th><th>Função</th></tr></thead><tbody>
        ${nics.map((n) => `<tr><td><b>${SW.esc(n.device)}</b></td><td>${SW.esc(n.description)}<div class="muted">${SW.esc(n.chip)}</div></td><td class="mono">${SW.esc(n.mac)}</td>
          <td>${n.carrier ? SW.badge(n.speed ? (n.speed >= 1000 ? n.speed / 1000 + " Gbps" : n.speed + " Mbps") : "up", "ok") : SW.badge("sem cabo", "warn")}</td>
          <td><select class="in" data-dev="${SW.esc(n.device)}"><option value="">— não usar —</option><option value="lan" ${v.roles[n.device] === "lan" ? "selected" : ""}>LAN</option><option value="wan" ${v.roles[n.device] === "wan" ? "selected" : ""}>WAN</option></select></td></tr>`).join("")}
        </tbody></table>
        <div class="form" style="margin-top:12px"><label class="l">Nome da porta LAN</label><div><input class="in" id="la" value="${SW.esc(v.lan_alias)}"></div>
        <label class="l">Nome da porta WAN</label><div><input class="in" id="wa" value="${SW.esc(v.wan_alias)}"></div></div>
        <p class="muted">Dica: conecte ou desconecte o cabo e reabra o assistente para identificar qual porta física é qual (a coluna "Link" mostra onde há cabo).</p></div>`));
      SW.$$("select[data-dev]", wz).forEach((s) => (s.onchange = () => {
        if (s.value) Object.keys(v.roles).forEach((d) => { if (d !== s.dataset.dev && v.roles[d] === s.value) v.roles[d] = ""; });
        v.roles[s.dataset.dev] = s.value; draw();
      }));
      SW.$("#la", wz).oninput = (e) => (v.lan_alias = e.target.value);
      SW.$("#wa", wz).oninput = (e) => (v.wan_alias = e.target.value);
    } else if (step === 1) {
      fm = SW.form([
        { type: "html", html: `<div class="note" style="margin:0">Porta LAN: <b>${SW.esc(dev("lan"))}</b> (${SW.esc(v.lan_alias)})</div>` },
        { key: "lan_address", label: "IP/Máscara da LAN", placeholder: "10.0.0.99/24", help: `Você está acessando por <b>${SW.esc(location.hostname)}</b>. Se mudar o IP, será preciso abrir o novo endereço e confirmar em até 60 s.` },
        { key: "lan_gateway", label: "Gateway na LAN", placeholder: "opcional — só se a internet vier pela LAN" },
        { key: "dns", label: "DNS", placeholder: "8.8.8.8, 1.1.1.1" },
        { key: "lan_dhcp", label: "Servidor DHCP", type: "bool", text: "Distribuir IPs na LAN (faixa .100–.200)" },
      ], v);
      wz.appendChild(fm.el);
    } else if (step === 2) {
      if (!dev("wan")) { wz.innerHTML = `<div class="note">Nenhuma porta foi escolhida como WAN — a internet deverá vir pelo gateway da LAN. Você pode configurar a WAN depois em Rede › Interfaces.</div>`; return; }
      fm = SW.form([
        { type: "html", html: `<div class="note" style="margin:0">Porta WAN: <b>${SW.esc(dev("wan"))}</b> (${SW.esc(v.wan_alias)})</div>` },
        { key: "wan.mode", label: "Conexão com a internet", type: "select", options: [{ value: "pppoe", label: "PPPoE (usuário e senha do provedor)" }, { value: "dhcp", label: "DHCP (modem/roteador entrega o IP)" }, { value: "static", label: "IP fixo" }, { value: "none", label: "Configurar depois" }] },
        { key: "wan.pppoe_username", label: "Usuário PPPoE", show: (x) => x.wan.mode === "pppoe" },
        { key: "wan.pppoe_password", label: "Senha PPPoE", type: "password", show: (x) => x.wan.mode === "pppoe" },
        { key: "wan.pppoe_auth", label: "Autenticação", type: "checks", options: [{ value: "pap", label: "PAP" }, { value: "chap", label: "CHAP" }], show: (x) => x.wan.mode === "pppoe" },
        { key: "wan.address", label: "IP/Máscara", placeholder: "200.1.2.3/29", show: (x) => x.wan.mode === "static" },
        { key: "wan.gateway", label: "Gateway", show: (x) => x.wan.mode === "static" },
      ], v);
      wz.appendChild(fm.el);
    } else if (step === 3) {
      fm = SW.form([
        { key: "hostname", label: "Nome do equipamento" },
        { key: "timezone", label: "Fuso horário", type: "select", options: ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "UTC"] },
      ], v);
      wz.appendChild(fm.el);
    } else {
      const w = v.wan;
      wz.innerHTML = `<div class="kv">
        <div>LAN</div><div><b>${SW.esc(dev("lan"))}</b> (${SW.esc(v.lan_alias)}) — <span class="mono">${SW.esc(v.lan_address)}</span>${v.lan_gateway ? ` gw ${SW.esc(v.lan_gateway)}` : ""}${v.lan_dhcp ? " · DHCP ativo" : ""}</div>
        <div>WAN</div><div>${dev("wan") ? `<b>${SW.esc(dev("wan"))}</b> (${SW.esc(v.wan_alias)}) — ${{ pppoe: "PPPoE " + SW.esc(w.pppoe_username), dhcp: "DHCP", static: "IP fixo " + SW.esc(w.address), none: "configurar depois" }[w.mode]}` : "não utilizada"}</div>
        <div>DNS</div><div>${SW.esc(v.dns)}</div><div>Equipamento</div><div>${SW.esc(v.hostname)} · ${SW.esc(v.timezone)}</div></div>
        ${v.lan_address.split("/")[0] !== location.hostname ? `<div class="errbox" style="margin-top:12px">O IP da LAN vai mudar para <b>${SW.esc(v.lan_address.split("/")[0])}</b>. Depois de aplicar, abra <b>https://${SW.esc(v.lan_address.split("/")[0])}/</b> e confirme em até 60 s — caso contrário a configuração anterior volta sozinha.</div>` : ""}`;
    }
    SW.$("button[data-n='back']", m.el).disabled = step === 0;
    SW.$("button[data-n='next']", m.el).textContent = step === titles.length - 1 ? "Aplicar" : "Avançar";
  };

  const m = SW.modal({ title: "Assistente de configuração inicial", size: "lg", body, buttons: [] });
  const foot = SW.h(`<div class="modal-foot"><button class="btn" data-n="skip">${forced ? "Pular (configurar depois)" : "Cancelar"}</button><span style="flex:1"></span><button class="btn" data-n="back">Voltar</button><button class="btn primary" data-n="next">Avançar</button></div>`);
  SW.$(".modal", m.el).appendChild(foot);
  const collect = () => { if (fm) Object.assign(v, SW.clone({ ...v, ...fm.get() })); };
  SW.$("[data-n='back']", foot).onclick = () => { collect(); step--; draw(); };
  SW.$("[data-n='skip']", foot).onclick = async () => { if (forced) await SW.apply(SW.POST("/api/setup/skip"), { silent: true }).catch(() => {}); m.close(); };
  SW.$("[data-n='next']", foot).onclick = async (e) => {
    collect();
    if (step === 0 && !dev("lan")) return m.setError(new SW.ApiError(400, "escolha uma porta para a LAN"));
    if (step < titles.length - 1) { step++; return draw(); }
    const payload = { lan_device: dev("lan"), lan_alias: v.lan_alias, wan_device: dev("wan") || null, wan_alias: v.wan_alias,
      lan_address: v.lan_address, lan_gateway: v.lan_gateway, lan_dhcp: v.lan_dhcp,
      dns: v.dns.split(/[\s,]+/).filter(Boolean), wan: v.wan, hostname: v.hostname, timezone: v.timezone };
    const newIp = v.lan_address.split("/")[0];
    e.target.disabled = true;
    try {
      if (newIp !== location.hostname) {
        const r = await SW.POST("/api/setup", payload);
        m.close();
        SW.modal({ title: "Confirme no novo endereço", body: `<p>A configuração foi aplicada. Abra <a href="https://${SW.esc(newIp)}/" target="_blank">https://${SW.esc(newIp)}/</a>, faça login e clique em <b>Confirmar</b> na faixa amarela em até <b>${r.confirm_timeout || 60} s</b>.</p>`, buttons: [{ label: "Fechar" }] });
      } else {
        await SW.apply(SW.POST("/api/setup", payload));
        m.close();
        SW.meta = null;
        SW.route();
      }
    } catch (err) { m.setError(err); } finally { e.target.disabled = false; }
  };
  draw();
};
