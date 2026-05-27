/* ============================================================
   FolgaField — data.js
   Regras de negócio + dados vazios (pronto para produção)
   ============================================================ */

'use strict';

const PERIODOS = {
  30: { label: '30 dias', extra1: 0, extra2: 5  },
  45: { label: '45 dias', extra1: 0, extra2: 9  },
  60: { label: '60 dias', extra1: 0, extra2: 9  },
  90: { label: '90 dias', extra1: 0, extra2: 9  },
   0: { label: 'Sem direito', extra1: 0, extra2: 0 }
};

const PERIODO_MAP = { 1: 30, 2: 60, 3: 45, 4: 90, 5: 0 };

const FF = {
  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  fmt(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR');
  },

  parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return str;
    const parts = String(str).split(/[\/\-]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  },

  calcProximaFolga(colaborador) {
    const periodo = colaborador.periodoDias;
    if (!periodo) return null;
    const cfg = PERIODOS[periodo];
    if (!cfg) return null;
    const numFolgas = colaborador.historico ? colaborador.historico.length : 0;

    if (numFolgas === 0) {
      const apres = FF.parseDate(colaborador.dataApresentacao);
      if (!apres) return null;
      return FF.addDays(apres, periodo);
    }
    const ultima = colaborador.historico[colaborador.historico.length - 1];
    const retorno = FF.parseDate(ultima.dataRetorno);
    if (!retorno) return null;

    const ciclo = periodo + cfg.extra2;
    return FF.addDays(retorno, ciclo);
  },

  diasParaVencer(colaborador) {
    const prox = FF.calcProximaFolga(colaborador);
    if (!prox) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    return Math.round((prox - hoje) / 86400000);
  },

  statusFolga(colaborador) {
    if (!colaborador.periodoDias) return { label: 'Sem direito', cls: 'badge-gray' };
    if (colaborador.emFolga) return { label: 'Em folga', cls: 'badge-info' };
    const dias = FF.diasParaVencer(colaborador);
    if (dias === null) return { label: 'Sem dados', cls: 'badge-gray' };
    if (dias < 0)   return { label: `Vencida há ${Math.abs(dias)}d`, cls: 'badge-danger' };
    if (dias <= 7)  return { label: `Vence em ${dias}d`, cls: 'badge-danger' };
    if (dias <= 30) return { label: `Vence em ${dias}d`, cls: 'badge-warning' };
    return { label: 'Em dia', cls: 'badge-success' };
  },

  initials(nome) {
    const parts = (nome || '').trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  },

  avatarCls(colaborador) {
    const s = FF.statusFolga(colaborador);
    if (s.cls === 'badge-danger')  return 'av-red';
    if (s.cls === 'badge-warning') return 'av-amber';
    if (s.cls === 'badge-info')    return 'av-blue';
    return 'av-teal';
  },

  /* ── DADOS ZERADOS ── */
  colaboradores: [],

  /* ── Usuários base ── */
  usuarios: [
    { id: 1, nome: 'Administrador', email: 'admin@azulao.com.br', perfil: 'Administrador', senha: '123' },
  ],

  /* ── Obras ── */
  obras: ['UHE Sinop MT','LT Norte AM','PCH Itapiranga','Sub Boa Vista','LT Pará'],

  getResumo() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    let vencidas = 0, proximas7 = 0, proximas30 = 0, emFolga = 0, semDireito = 0;
    for (const c of this.colaboradores) {
      if (!c.periodoDias) { semDireito++; continue; }
      if (c.emFolga) { emFolga++; continue; }
      const dias = FF.diasParaVencer(c);
      if (dias === null) continue;
      if (dias < 0)   vencidas++;
      else if (dias <= 7)  proximas7++;
      else if (dias <= 30) proximas30++;
    }
    return {
      total: this.colaboradores.length,
      ativos: this.colaboradores.filter(c => c.status === 'Ativo').length,
      emFolga, vencidas, proximas7, proximas30, semDireito,
      alertas: vencidas + proximas7
    };
  },

  getPorObra() {
    const map = {};
    for (const c of this.colaboradores) {
      map[c.obra] = (map[c.obra] || 0) + 1;
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  },

  addColaborador(dados) {
    const id = Math.max(...this.colaboradores.map(c=>c.id), 0) + 1;
    this.colaboradores.push({ id, historico: [], emFolga: false, ...dados });
  },

  registrarFolga(colab, folga) {
    if (!colab.historico) colab.historico = [];
    const idFolga = Math.max(...this.colaboradores.flatMap(c => c.historico?.map(h=>h.id)||[]), 0) + 1;
    colab.historico.push({ id: idFolga, num: colab.historico.length + 1, statusPassagem: 'Aguardando emissão', ...folga });
    colab.emFolga = !folga.dataRetorno;
  },

  registrarRetorno(colab, dataRetorno) {
    if (!colab.historico || colab.historico.length === 0) return;
    colab.historico[colab.historico.length-1].dataRetorno = dataRetorno;
    colab.emFolga = false;
  },

  descricaoRegra(periodoDias, numFolga) {
    if (!periodoDias) return 'Sem direito a folga';
    if (numFolga <= 1) {
      return `${numFolga === 0 ? '1ª' : '2ª'} folga: Data de apresentação + ${periodoDias} dias`;
    }
    const cfg = PERIODOS[periodoDias];
    const ciclo = periodoDias + (cfg ? cfg.extra2 : 0);
    return `${numFolga}ª+ folga: Data retorno anterior + ${periodoDias}d + ${cfg.extra2}d = ${ciclo} dias de ciclo`;
  }
};
