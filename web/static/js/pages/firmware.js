/* Sistema › Firmware (all units) and Sistema › Desenvolvimento (development unit only). */
"use strict";
SW.logBox = (lines) => `<pre class="code logbox" style="max-height:220px">${SW.esc((lines || []).join("\n"))}</pre>`;
/* re-render a container holding log boxes while keeping them "tailing": a box that was at the bottom (or is new)
   stays at the bottom as lines arrive; one the user scrolled up keeps its position */
SW.setLogsHTML = (el, html) => {
  const prev = SW.$$(".logbox", el).map((b) => ({ top: b.scrollTop, atEnd: b.scrollTop + b.clientHeight >= b.scrollHeight - 8 }));
  el.innerHTML = html;
  SW.$$(".logbox", el).forEach((b, i) => { const p = prev[i]; b.scrollTop = !p || p.atEnd ? b.scrollHeight : p.top; });
};

SW.page("firmware", {
  title: "Firmware",
  async render(root) {
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Firmware</h2></div><div id="fw"></div></div>`;
    const box = SW.$("#fw", root);
    let pollT = null;
    const draw = async () => {
      let d;
      try { d = await SW.GET("/api/firmware"); } catch (e) { box.innerHTML = `<div class="note">Aguardando o painel voltar…</div>`; return; }
      const u = d.update || {};
      const busy = d.updating || ["queued", "running"].includes(u.state);
      const dev = d.mode === "development";
      SW.setLogsHTML(box, `<div class="cards">
        <div class="card"><h3>Versão instalada</h3><div class="body"><div class="kv">
          <div>Versão</div><div><b style="font-size:18px">${SW.esc(d.version)}</b></div>
          <div>Modo</div><div>${dev ? SW.badge("desenvolvimento", "warn") : SW.badge("produção", "ok")}</div>
          <div>Chaves confiáveis</div><div class="mono">${SW.esc(d.trusted_keys.join(", ") || "nenhuma")}</div></div>
          ${dev ? `<p class="muted">Este é o equipamento de desenvolvimento: aqui você <b>gera</b> firmwares e imagens (Sistema › Desenvolvimento). A instalação por upload é feita nos equipamentos de produção.</p>` : ""}</div></div>
        <div class="card"><h3>Atualizar firmware</h3><div class="body">
          ${dev ? `<p class="muted">Indisponível no equipamento de desenvolvimento.</p>` : `
          <p>Envie um arquivo <b>.swfw</b> gerado no equipamento de desenvolvimento. A assinatura digital é verificada antes de qualquer instalação.</p>
          <div class="dropzone" id="dz">Arraste o firmware aqui ou <b>clique para escolher</b></div><input type="file" id="file" accept=".swfw" class="hidden">
          <div id="up"></div>`}
          ${d.staged && !d.staged.error ? `<div class="note" style="margin-top:12px"><div class="kv">
            <div>Firmware carregado</div><div><b>${SW.esc(d.staged.version)}</b> ${d.staged.checks.is_upgrade ? SW.badge("atualização", "ok") : SW.badge("mesma versão ou anterior", "warn")}</div>
            <div>Gerado em</div><div>${SW.fmtTime(d.staged.created)}</div><div>Assinatura</div><div>${SW.badge("válida", "ok")} <span class="mono muted">${SW.esc(d.staged.key_id)}</span></div>
            ${d.staged.notes ? `<div>Notas</div><div style="white-space:pre-wrap">${SW.esc(d.staged.notes)}</div>` : ""}</div>
            ${!d.staged.checks.min_version_ok ? `<div class="errbox" style="margin-top:8px">Exige a versão ${SW.esc(d.staged.min_version)} ou superior instalada antes.</div>` : ""}
            <div class="toolbar" style="margin-top:10px"><button class="btn primary" id="inst" ${busy || !d.staged.checks.min_version_ok ? "disabled" : ""}>Instalar ${SW.esc(d.staged.version)}</button><button class="btn" id="disc" ${busy ? "disabled" : ""}>Descartar</button></div></div>` : ""}
        </div></div>
        ${u.state ? `<div class="card full"><h3>Última atualização<span class="spacer"></span>${u.state === "done" ? SW.badge("concluída", "ok") : u.state === "failed" ? SW.badge("falhou", "bad") : u.state === "rolled-back" ? SW.badge("revertida", "warn") : SW.badge("em andamento", "info")}</h3>
          <div class="body"><div class="muted" style="margin-bottom:6px">${SW.esc(u.from ? `${u.from} → ${u.to || "?"}` : "")} · ${SW.esc(u.step || "")}</div>${SW.logBox(u.log)}</div></div>` : ""}
        ${!dev ? `<div class="card full"><h3>Versões instaladas</h3><div class="body" style="padding:0"><table class="grid"><thead><tr><th>Versão</th><th>Instalada em</th><th>Estado</th><th></th></tr></thead><tbody>
          ${d.releases.map((r) => `<tr><td><b>${SW.esc(r.version)}</b></td><td>${SW.esc(r.installed)}</td><td>${r.current ? SW.badge("em uso", "ok") : ""}</td>
            <td>${r.current ? "" : `<button class="btn sm" data-rb="${SW.esc(r.version)}" ${busy ? "disabled" : ""}>Ativar esta versão</button>`}</td></tr>`).join("") || `<tr><td class="empty" colspan="4">—</td></tr>`}
          </tbody></table><p class="muted" style="padding:0 12px">São mantidas as 3 versões mais recentes. Ativar uma versão anterior passa pelo mesmo autoteste e verificação de saúde.</p></div></div>` : ""}
      </div>`);
      const dz = SW.$("#dz", box), fi = SW.$("#file", box);
      const upload = async (f) => {
        const up = SW.$("#up", box);
        up.innerHTML = `<div class="note" style="margin-top:10px">Enviando e verificando ${SW.esc(f.name)} (${SW.fmtBytes(f.size)})…</div>`;
        const fd = new FormData(); fd.append("file", f);
        try { await SW.api("POST", "/api/firmware/upload", fd); SW.toast("Firmware verificado", "ok"); draw(); }
        catch (e) { up.innerHTML = SW.errHtml(e); }
      };
      if (dz) {
        dz.onclick = () => fi.click();
        fi.onchange = () => fi.files[0] && upload(fi.files[0]);
        dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("over"); };
        dz.ondragleave = () => dz.classList.remove("over");
        dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("over"); e.dataTransfer.files[0] && upload(e.dataTransfer.files[0]); };
      }
      const inst = SW.$("#inst", box);
      if (inst) inst.onclick = async () => {
        if (!(await SW.confirm(`Instalar a versão <b>${SW.esc(d.staged.version)}</b>?<br><span class="muted">O painel reinicia durante a troca (cerca de 1 minuto). O tráfego da rede não é interrompido; se a nova versão não subir corretamente, a atual é restaurada automaticamente.</span>`, { ok: "Instalar" }))) return;
        try { await SW.POST("/api/firmware/install"); SW.toast("Atualização iniciada"); watch(); } catch (e) { SW.fail(e); }
      };
      const disc = SW.$("#disc", box);
      if (disc) disc.onclick = async () => { await SW.DEL("/api/firmware/staged").catch(SW.fail); draw(); };
      SW.$$("[data-rb]", box).forEach((b) => (b.onclick = async () => {
        if (!(await SW.confirm(`Ativar a versão <b>${SW.esc(b.dataset.rb)}</b>?`, { ok: "Ativar" }))) return;
        try { await SW.POST("/api/firmware/rollback", { version: b.dataset.rb }); watch(); } catch (e) { SW.fail(e); }
      }));
      if (busy) watch();
    };
    const watch = () => { clearTimeout(pollT); pollT = setTimeout(async () => { await draw(); }, 2500); };
    draw();
  },
});

SW.page("devtools", {
  title: "Desenvolvimento",
  async render(root) {
    root.innerHTML = `<div class="page"><div class="page-head"><h2>Desenvolvimento — firmware e imagens</h2></div><div id="dv"></div></div>`;
    const box = SW.$("#dv", root);
    let d;
    try { d = await SW.GET("/api/firmware"); } catch (e) { return SW.fail(e); }
    if (d.mode !== "development") { box.innerHTML = `<div class="note">Disponível apenas no equipamento de desenvolvimento.</div>`; return; }
    const next = d.version.split(".").map(Number); next[2] += 1;
    box.innerHTML = `<div class="cards">
      <div class="card"><h3>Gerar firmware (.swfw)</h3><div class="body"><div id="ff"></div>
        <p class="muted">Se a versão for maior que a atual (${SW.esc(d.version)}), o arquivo VERSION é atualizado e a seção "Não lançado" do CHANGELOG vira as notas desta versão (somadas ao que você digitar abaixo). Essas notas vão dentro do firmware e aparecem no equipamento de produção antes de instalar.</p></div>
        <div class="modal-foot"><button class="btn primary" id="bfw">Gerar firmware</button></div></div>
      <div class="card"><h3>Gerar imagem para gravação (.img.xz)</h3><div class="body"><div id="fi"></div>
        <p class="muted">Monta um sistema Raspberry Pi OS Lite novo (Pi 3, 4 e 5) a partir dos repositórios oficiais — nada é copiado deste equipamento — e instala a versão ${SW.esc(d.version)} em modo produção.
        Grave com o Raspberry Pi Imager ("Use custom", sem personalização). Baixa ~600 MB; leva de 20 a 40 minutos.</p></div>
        <div class="modal-foot"><button class="btn primary" id="bimg">Gerar imagem</button></div></div>
      <div class="card"><h3>Gerar imagem para Proxmox ARM64 (.qcow2)</h3><div class="body"><div id="fv"></div>
        <p class="muted">Instala um Debian 13 arm64 novo (boot UEFI, VirtIO, console serial) com a versão ${SW.esc(d.version)} em modo produção — as atualizações por firmware funcionam igual ao Raspberry.
        Para Proxmox em ARM64 (não serve para Proxmox Intel/AMD). Baixa ~500 MB do Debian; leva de 15 a 30 minutos.
        No Proxmox: <span class="mono">qm importdisk &lt;vmid&gt; arquivo.qcow2 &lt;storage&gt;</span>, BIOS OVMF (UEFI), duas placas VirtIO.</p></div>
        <div class="modal-foot"><button class="btn primary" id="bvm">Gerar imagem Proxmox</button></div></div>
      <div class="card"><h3>Chave de assinatura</h3><div class="body"><div class="kv">
        <div>Identificador</div><div class="mono">${SW.esc(d.signing.key_id || "será criada na primeira geração")}</div></div>
        <p class="muted">A chave privada fica apenas neste equipamento (<span class="mono">/etc/berrycade-dev</span>) e nunca vai para imagens ou backups. Os equipamentos gerados por imagem já confiam nela. Guarde uma cópia segura: sem ela não é possível gerar atualizações aceitas pelos equipamentos em campo.</p>
        <a class="btn" href="/api/dev/signing-key.pub">${SW.icon.dl} Baixar chave pública</a></div></div>
      <div class="card full" id="jobs"></div>
      <div class="card full"><h3>Arquivos gerados</h3><div class="body" style="padding:0"><table class="grid"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Gerado em</th><th></th></tr></thead><tbody id="blist"></tbody></table></div></div>
    </div>`;
    const ff = SW.form([
      { key: "version", label: "Versão", placeholder: "1.0.12" },
      { key: "notes", label: "Notas adicionais", type: "textarea", placeholder: "- Correções…\n- Novidades…" },
      { key: "min_version", label: "Versão mínima", placeholder: "opcional — exige esta versão instalada antes" },
    ], { version: next.join("."), notes: "", min_version: "" });
    SW.$("#ff", box).appendChild(ff.el);
    const fi = SW.form([
      { key: "hostname", label: "Hostname" },
      { key: "lan_address", label: "IP da LAN", help: "Use um IP diferente deste equipamento para evitar conflito na mesma rede." },
      { key: "lan_gateway", label: "Gateway", placeholder: "opcional" },
      { key: "dns", label: "DNS" },
      { key: "keep_ssh_keys", label: "Chaves SSH", type: "bool", text: "Manter as chaves autorizadas (authorized_keys) dos usuários" },
      { key: "expire_passwords", label: "Senhas do sistema", type: "bool", text: "Exigir troca da senha dos usuários do SO no primeiro login" },
    ], { hostname: "berrycade", lan_address: "10.0.0.98/24", lan_gateway: "10.0.0.254", dns: "8.8.8.8", keep_ssh_keys: true, expire_passwords: true });
    SW.$("#fi", box).appendChild(fi.el);
    const fv = SW.form([
      { key: "hostname", label: "Hostname" },
      { key: "lan_address", label: "IP da LAN (eth0)" },
      { key: "lan_gateway", label: "Gateway", placeholder: "opcional" },
      { key: "dns", label: "DNS" },
      { key: "keep_ssh_keys", label: "Chaves SSH", type: "bool", text: "Levar as chaves autorizadas (authorized_keys) do usuário berrycade" },
      { key: "expire_passwords", label: "Senha do sistema", type: "bool", text: "Exigir troca da senha no primeiro login" },
    ], { hostname: "berrycade", lan_address: "10.0.0.97/24", lan_gateway: "10.0.0.254", dns: "8.8.8.8", keep_ssh_keys: true, expire_passwords: true });
    SW.$("#fv", box).appendChild(fv.el);
    SW.$("#bvm", box).onclick = async () => {
      if (!(await SW.confirm("Gerar a imagem para Proxmox agora? O equipamento continua funcionando normalmente.", { ok: "Gerar" }))) return;
      try { await SW.POST("/api/dev/vm-image", fv.get()); SW.toast("Geração da imagem Proxmox iniciada"); refresh(); } catch (e) { SW.fail(e); }
    };
    SW.$("#bfw", box).onclick = async () => { try { await SW.POST("/api/dev/firmware", ff.get()); SW.toast("Gerando firmware…"); refresh(); } catch (e) { SW.fail(e); } };
    SW.$("#bimg", box).onclick = async () => {
      if (!(await SW.confirm("Gerar a imagem agora? O equipamento continua funcionando normalmente; a cópia usa baixa prioridade de disco.", { ok: "Gerar" }))) return;
      try { await SW.POST("/api/dev/image", fi.get()); SW.toast("Geração da imagem iniciada"); refresh(); } catch (e) { SW.fail(e); }
    };
    const refresh = async () => {
      try { d = await SW.GET("/api/firmware"); } catch (e) { return; }
      const f = d.fw_build || {}, im = d.image_build || {}, vm = d.vm_build || {};
      const vmBusy = d.vm_building || ["queued", "running"].includes(vm.state);
      if (SW.meta && SW.meta.version !== d.version) { SW.meta.version = d.version; SW.navFoot(); }
      const badge = (s) => (s === "done" ? SW.badge("concluído", "ok") : s === "failed" ? SW.badge("falhou", "bad") : s ? SW.badge("em andamento", "info") : "");
      SW.setLogsHTML(SW.$("#jobs", box), `<h3>Tarefas</h3><div class="body">
        ${f.state ? `<div><b>Firmware ${SW.esc(f.version || "")}</b> ${badge(f.state)}</div>${SW.logBox(f.log)}` : ""}
        ${im.state ? `<div style="margin-top:10px"><b>Imagem</b> ${badge(im.state)} <span class="muted">${im.percent || 0}% · ${SW.esc(im.step || "")}</span>
          ${d.image_building || ["queued", "running"].includes(im.state) ? `<button class="btn sm danger" id="bimg-cancel" style="margin-left:8px">Cancelar</button>` : ""}</div>
          <div style="height:8px;background:var(--border);border-radius:4px;margin:6px 0"><div style="height:8px;width:${im.percent || 0}%;background:var(--accent);border-radius:4px"></div></div>${SW.logBox(im.log)}` : ""}
        ${vm.state ? `<div style="margin-top:10px"><b>Imagem Proxmox ARM64</b> ${badge(vm.state)} <span class="muted">${vm.percent || 0}% · ${SW.esc(vm.step || "")}</span>
          ${vmBusy ? `<button class="btn sm danger" id="bvm-cancel" style="margin-left:8px">Cancelar</button>` : ""}</div>
          <div style="height:8px;background:var(--border);border-radius:4px;margin:6px 0"><div style="height:8px;width:${vm.percent || 0}%;background:var(--accent);border-radius:4px"></div></div>${SW.logBox(vm.log)}` : ""}
        ${!f.state && !im.state && !vm.state ? `<span class="muted">Nenhuma tarefa executada ainda.</span>` : ""}</div>`);
      const vcancel = SW.$("#bvm-cancel", box);
      if (vcancel) vcancel.onclick = async () => {
        if (!(await SW.confirm("Cancelar a geração da imagem Proxmox? O arquivo parcial é apagado.", { danger: true, ok: "Cancelar geração" }))) return;
        vcancel.disabled = true;
        try { await SW.POST("/api/dev/vm-image/cancel"); SW.toast("Geração cancelada"); } catch (e) { SW.fail(e); }
        refresh();
      };
      const cancel = SW.$("#bimg-cancel", box);
      if (cancel) cancel.onclick = async () => {
        if (!(await SW.confirm("Cancelar a geração da imagem? O arquivo parcial é apagado.", { danger: true, ok: "Cancelar geração" }))) return;
        cancel.disabled = true;
        try { await SW.POST("/api/dev/image/cancel"); SW.toast("Geração da imagem cancelada"); } catch (e) { SW.fail(e); }
        refresh();
      };
      SW.$("#blist", box).innerHTML = d.builds.map((b) => `<tr><td class="mono">${SW.esc(b.name)}</td><td>${SW.esc(b.type)}</td><td>${SW.fmtBytes(b.size)}</td><td>${SW.esc(b.created)}</td>
        <td class="nowrap"><a class="btn sm" href="/api/dev/builds/${encodeURIComponent(b.name)}">${SW.icon.dl} Baixar</a>
        ${b.type.startsWith("imagem") ? `<a class="btn sm" href="/api/dev/builds/${encodeURIComponent(b.name)}.sha256">SHA-256</a>` : ""}
        <button class="btn sm danger" data-del="${SW.esc(b.name)}">${SW.icon.trash}</button></td></tr>`).join("") || `<tr><td class="empty" colspan="5">Nenhum arquivo</td></tr>`;
      SW.$$("[data-del]", box).forEach((b) => (b.onclick = async () => { if (await SW.confirm(`Apagar <b>${SW.esc(b.dataset.del)}</b>?`, { danger: true, ok: "Apagar" })) { await SW.DEL(`/api/dev/builds/${encodeURIComponent(b.dataset.del)}`).catch(SW.fail); refresh(); } }));
      const busy = f.state === "running" || d.image_building || ["queued", "running"].includes(im.state) || d.vm_building || ["queued", "running"].includes(vm.state);
      SW.$("#bfw", box).disabled = f.state === "running";
      const imgBusy = d.image_building || ["queued", "running"].includes(im.state);
      SW.$("#bimg", box).disabled = imgBusy || vmBusy;
      SW.$("#bvm", box).disabled = imgBusy || vmBusy;
      return busy;
    };
    refresh();
    SW.every(4, refresh);
  },
});
