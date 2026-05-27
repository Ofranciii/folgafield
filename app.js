/* ============================================================
   FolgaField — app.js
   Lógica com usuários, lote, folgas e excel.
   ============================================================ */

'use strict';

const App = { user: null, currentScreen: 'dashboard', colabEditando: null, usrEditando: null };

function login() {
  const e = document.getElementById('login-email').value.trim(), s = document.getElementById('login-senha').value;
  const user = FF.usuarios.find(u => u.email === e && u.senha === s);
  if (!user) return alert('Credenciais inválidas.');
  App.user = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'flex';
  document.getElementById('user-name').textContent = user.nome;
  document.getElementById('user-role').textContent = user.perfil;
  document.getElementById('user-initials').textContent = FF.initials(user.nome);
  navigate('dashboard');
}

function logout() { location.reload(); }

function navigate(screen, el) {
  App.currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`sc-${screen}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('topbar-title').textContent = screen.toUpperCase();

  const renders = { dashboard: renderDashboard, colaboradores: renderColaboradores, folgas: renderFolgas, historico: renderHistorico, usuarios: renderUsuarios };
  if (renders[screen]) renders[screen]();
}

function renderDashboard() {
  const r = FF.getResumo();
  document.getElementById('kpi-total').textContent = r.total;
  document.getElementById('kpi-vencidas').textContent = r.vencidas;
  document.getElementById('kpi-proximas').textContent = r.proximas7 + r.proximas30;
  document.getElementById('kpi-emfolga').textContent = r.emFolga;
}

/* ── COLABORADORES (Listagem e Exclusão em Lote) ── */
let colabPage = 1;
function renderColaboradores() {
  const adminRh = ['Administrador', 'RH'].includes(App.user?.perfil);
  document.getElementById('btn-batch-delete').style.display = adminRh && FF.colaboradores.length > 0 ? 'inline-flex' : 'none';
  
  const q = (document.getElementById('f-colab-busca')?.value||'').toLowerCase();
  let list = FF.colaboradores.filter(c => c.nome.toLowerCase().includes(q) || c.chapa.includes(q));
  
  const tbody = document.getElementById('colab-tbody');
  tbody.innerHTML = list.length === 0 ? `<tr><td colspan="8">Nenhum dado.</td></tr>` : list.map(c => {
    const s = FF.statusFolga(c);
    return `<tr>
      <td>${adminRh ? `<input type="checkbox" class="col-check" value="${c.id}">` : ''}</td>
      <td><div class="person-cell"><div class="avatar av-blue">${FF.initials(c.nome)}</div>${c.nome}</div></td>
      <td>${c.chapa}</td><td>${c.cpf || '—'} / ${c.cip || '—'}</td><td>${c.obra}</td>
      <td>${FF.fmt(FF.calcProximaFolga(c))}</td>
      <td><span class="badge ${s.cls}">${s.label}</span></td>
      <td><button class="btn-icon" onclick="editarColaborador(${c.id})"><i class="ti ti-edit"></i></button></td>
    </tr>`;
  }).join('');
}

function toggleAllCols() {
  const master = document.getElementById('check-all-colab').checked;
  document.querySelectorAll('.col-check').forEach(cb => cb.checked = master);
}

function excluirColaboradores() {
  const selecionados = Array.from(document.querySelectorAll('.col-check:checked')).map(cb => parseInt(cb.value));
  if (selecionados.length === 0) return alert('Selecione ao menos um colaborador.');
  if (!confirm(`Excluir ${selecionados.length} colaborador(es)?`)) return;
  FF.colaboradores = FF.colaboradores.filter(c => !selecionados.includes(c.id));
  renderColaboradores();
  showToast('Excluídos com sucesso.');
}

/* ── EDIÇÃO E NOVO COLABORADOR ── */
function abrirNovoColaborador() { App.colabEditando = null; ['novo-chapa','novo-nome','novo-cpf','novo-cip','novo-funcao','novo-cidade','novo-estado'].forEach(id => document.getElementById(id).value = ''); openModal('modal-novo-colab'); }
function editarColaborador(id) {
  const c = FF.colaboradores.find(x => x.id === id); if(!c) return;
  App.colabEditando = id;
  document.getElementById('novo-chapa').value = c.chapa; document.getElementById('novo-nome').value = c.nome;
  document.getElementById('novo-cpf').value = c.cpf || ''; document.getElementById('novo-cip').value = c.cip || '';
  document.getElementById('novo-funcao').value = c.funcao; document.getElementById('novo-cidade').value = c.cidade || '';
  document.getElementById('novo-estado').value = c.estado || ''; document.getElementById('novo-obra').value = c.obra;
  document.getElementById('novo-periodo').value = c.periodoDias; document.getElementById('novo-admissao').value = (c.dataAdmissao?.split('/').reverse().join('-')) || '';
  openModal('modal-novo-colab');
}
function salvarColaborador() {
  const dados = {
    chapa: document.getElementById('novo-chapa').value, nome: document.getElementById('novo-nome').value.toUpperCase(),
    cpf: document.getElementById('novo-cpf').value, cip: document.getElementById('novo-cip').value,
    funcao: document.getElementById('novo-funcao').value, cidade: document.getElementById('novo-cidade').value,
    estado: document.getElementById('novo-estado').value, obra: document.getElementById('novo-obra').value,
    periodoDias: parseInt(document.getElementById('novo-periodo').value),
    dataAdmissao: document.getElementById('novo-admissao').value.split('-').reverse().join('/'),
    dataApresentacao: document.getElementById('novo-apresentacao').value.split('-').reverse().join('/'), status: 'Ativo'
  };
  if(App.colabEditando) Object.assign(FF.colaboradores.find(x=>x.id===App.colabEditando), dados);
  else FF.addColaborador(dados);
  closeModal('modal-novo-colab'); renderColaboradores();
}

/* ── FOLGAS ── */
let folgaTab = 'programar';
function renderFolgas() { setFolgaTab(folgaTab); }
function setFolgaTab(tab) {
  folgaTab = tab;
  document.querySelectorAll('#sc-folgas .tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`#sc-folgas .tab[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('#sc-folgas .tab-pane').forEach(p => p.style.display = 'none');
  document.getElementById(`folga-${tab}`).style.display = 'block';
  if(tab === 'gestao') renderGestaoFolgas();
}
function buscarColabParaFolga() {
  const q = document.getElementById('f-colabNome').value.toLowerCase();
  const res = FF.colaboradores.filter(c => c.nome.toLowerCase().includes(q));
  document.getElementById('f-sugestoes').innerHTML = res.map(c => `<div class="sugg-item" onclick="selecionarColabFolga(${c.id})">${c.nome}</div>`).join('');
  document.getElementById('f-sugestoes').style.display = res.length && q.length>1 ? 'block' : 'none';
}
function selecionarColabFolga(id) {
  const c = FF.colaboradores.find(x => x.id === id);
  document.getElementById('f-colabId').value = id;
  document.getElementById('f-colabNome').value = c.nome;
  document.getElementById('f-destino').value = `${c.cidade || ''} / ${c.estado || ''}`;
  document.getElementById('f-sugestoes').style.display = 'none';
  document.getElementById('info-colab').style.display = 'block';
  document.getElementById('info-nome-colab').textContent = c.nome;
}
function confirmarFolga() {
  const c = FF.colaboradores.find(x => x.id === parseInt(document.getElementById('f-colabId').value));
  if(!c) return alert('Selecione colab');
  FF.registrarFolga(c, { 
    dataSaida: document.getElementById('f-saida').value.split('-').reverse().join('/'), 
    dataRetorno: document.getElementById('f-retorno').value.split('-').reverse().join('/'),
    origem: document.getElementById('f-origem').value, destino: document.getElementById('f-destino').value
  });
  showToast('Folga agendada'); document.getElementById('f-colabNome').value = ''; renderFolgas();
}

function renderGestaoFolgas() {
  const tb = document.getElementById('gestao-tbody');
  const isAdminRh = ['Administrador', 'RH'].includes(App.user?.perfil);
  const folgas = FF.colaboradores.flatMap(c => (c.historico||[]).map(h => ({c, h})));
  tb.innerHTML = folgas.map(({c, h}) => `<tr>
    <td>${c.nome}</td><td>${c.obra}</td><td>${h.dataSaida} a ${h.dataRetorno||'—'}</td><td>${h.destino}</td>
    <td>
      ${isAdminRh ? `<select onchange="mudarStatusPassagem(${c.id}, ${h.id}, this.value)" style="padding:2px;font-size:12px">
        <option ${h.statusPassagem==='Aguardando emissão'?'selected':''}>Aguardando emissão</option>
        <option ${h.statusPassagem==='Em tratativa'?'selected':''}>Em tratativa</option>
        <option ${h.statusPassagem==='Emitido'?'selected':''}>Emitido</option>
        <option ${h.statusPassagem==='Cancelado'?'selected':''}>Cancelado</option>
      </select>` : `<span class="badge badge-info">${h.statusPassagem||'—'}</span>`}
    </td>
  </tr>`).join('');
}
function mudarStatusPassagem(cId, hId, val) {
  const c = FF.colaboradores.find(x=>x.id===cId);
  const h = c.historico.find(x=>x.id===hId);
  h.statusPassagem = val; showToast('Status atualizado');
}

/* ── RELATÓRIOS (EXCEL E CSV) ── */
function gerarRelatorio(tipo, formato) {
  let rows = [];
  if (tipo === 'completo') rows = FF.colaboradores.map(c => ({ Chapa: c.chapa, CPF: c.cpf, Nome: c.nome, Obra: c.obra, Status: FF.statusFolga(c).label }));
  else rows = FF.colaboradores.filter(c => FF.diasParaVencer(c) < 0).map(c => ({ Chapa: c.chapa, Nome: c.nome, VencidaHa: Math.abs(FF.diasParaVencer(c)) }));
  
  if(formato === 'xlsx' && typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, `Relatorio_${tipo}.xlsx`);
  } else {
    const csv = [Object.keys(rows[0]||{}).join(',')].concat(rows.map(r => Object.values(r).join(','))).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
    a.download = `Relatorio_${tipo}.csv`; a.click();
  }
}

/* ── DOCUMENTOS GENÉRICO ── */
function gerarDocumento() {
  const c = FF.colaboradores.find(x=>x.id===docColabId); if(!c) return;
  const texto = `TERMO DE PROGRAMAÇÃO DE FOLGA\n\nNome: ${c.nome}\nCPF: ${c.cpf}\nCIP: ${c.cip}\nOrigem (Obra): ${c.obra}\nDestino (Residência): ${c.cidade}/${c.estado}\nSaída: ${document.getElementById('doc-saida').value}\n\nAssinatura: _________________________`;
  const a = document.createElement('a'); a.href = 'data:text/plain;charset=utf-8,'+encodeURIComponent(texto);
  a.download = `Folga_${c.cpf}.txt`; a.click();
}
let docColabId;
function buscarColabDoc() {
  const q = document.getElementById('doc-colab').value;
  const res = FF.colaboradores.filter(c => c.nome.includes(q.toUpperCase()));
  document.getElementById('doc-sugestoes').innerHTML = res.map(c => `<div class="sugg-item" onclick="docColabId=${c.id};document.getElementById('doc-colab').value='${c.nome}';this.parentElement.style.display='none'">${c.nome}</div>`).join('');
  document.getElementById('doc-sugestoes').style.display = 'block';
}

/* ── USUÁRIOS ── */
function renderUsuarios() {
  const tb = document.getElementById('usuarios-tbody');
  tb.innerHTML = FF.usuarios.map(u => `<tr><td>${u.nome}</td><td>${u.email}</td><td>${u.perfil}</td><td>
    ${App.user?.perfil === 'Administrador' ? `<button class="btn-icon" onclick="editarUsuario(${u.id})"><i class="ti ti-edit"></i></button> <button class="btn-icon" onclick="excluirUsuario(${u.id})"><i class="ti ti-trash"></i></button>` : '—'}
  </td></tr>`).join('');
}
function abrirNovoUsuario() { App.usrEditando=null; document.getElementById('usr-nome').value=''; openModal('modal-usuario'); }
function editarUsuario(id) {
  const u = FF.usuarios.find(x=>x.id===id); App.usrEditando = id;
  document.getElementById('usr-nome').value=u.nome; document.getElementById('usr-email').value=u.email;
  document.getElementById('usr-perfil').value=u.perfil; document.getElementById('usr-senha').value=u.senha;
  openModal('modal-usuario');
}
function salvarUsuario() {
  const u = { nome: document.getElementById('usr-nome').value, email: document.getElementById('usr-email').value, perfil: document.getElementById('usr-perfil').value, senha: document.getElementById('usr-senha').value };
  if(App.usrEditando) Object.assign(FF.usuarios.find(x=>x.id===App.usrEditando), u);
  else FF.usuarios.push({id: Date.now(), ...u});
  closeModal('modal-usuario'); renderUsuarios(); showToast('Usuário salvo');
}
function excluirUsuario(id) { if(id===App.user.id) return alert('Não pode excluir a si'); FF.usuarios = FF.usuarios.filter(x=>x.id!==id); renderUsuarios(); }

function downloadModelo() {
  const csv = "CHAPA,CPF,CIP,NOME,FUNCAO,ADMISSAO,PERIODO(Dias),CIDADE,ESTADO,OBRA\n123,000.000.000-00,123456,TESTE SILVA,ENGENHEIRO,01/01/2026,60,SAO PAULO,SP,UHE Sinop";
  const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURI(csv); a.download='modelo.csv'; a.click();
}

/* Utils */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showToast(msg) { const t = document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 3000); }
