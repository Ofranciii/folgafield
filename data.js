/* ============================================================
   FolgaField — data.js
   Regras de negócio + dados de exemplo + cálculo de período
   ============================================================ */

'use strict';

/* ── Periodicidade ── */
const PERIODOS = {
  30: { label: '30 dias', extra1: 0, extra2: 5  },
  45: { label: '45 dias', extra1: 0, extra2: 9  },
  60: { label: '60 dias', extra1: 0, extra2: 9  },
  90: { label: '90 dias', extra1: 0, extra2: 9  },
   0: { label: 'Sem direito', extra1: 0, extra2: 0 }
};

/* ── Mapa de período numérico (planilha) → dias ── */
const PERIODO_MAP = { 1: 30, 2: 60, 3: 45, 4: 90, 5: 0 };

/* ──────────────────────────────────────────────
   REGRA DE PERÍODO AQUISITIVO:
   • 1ª folga  = data_apresentacao + periodo_dias
   • 2ª+ folga = data_retorno_anterior + periodo_dias + extra
     - 30 dias → +5  = 35 dias de ciclo
     - 45 dias → +9  = 54 dias de ciclo
     - 60 dias → +9  = 69 dias de ciclo
     - 90 dias → +9  = 99 dias de ciclo
   ────────────────────────────────────────────── */

const FF = {

  /* Adiciona dias a uma Date */
  addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  },

  /* Formata Date → DD/MM/AAAA */
  fmt(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR');
  },

  /* Parse DD/MM/AAAA ou YYYY-MM-DD → Date */
  parseDate(str) {
    if (!str) return null;
    if (str instanceof Date) return str;
    const parts = String(str).split(/[\/\-]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  },

  /* Calcula próximo vencimento de folga */
  calcProximaFolga(colaborador) {
    const periodo = colaborador.periodoDias;
    if (!periodo) return null;

    const cfg = PERIODOS[periodo];
    if (!cfg) return null;

    const numFolgas = colaborador.historico ? colaborador.historico.length : 0;

    /* Sem nenhuma folga registrada → vencimento = apresentacao + periodo */
    if (numFolgas === 0) {
      const apres = FF.parseDate(colaborador.dataApresentacao);
      if (!apres) return null;
      return FF.addDays(apres, periodo);
    }

    /* Com folgas → usa o retorno da última + ciclo da 2ª+ */
    const ultima = colaborador.historico[colaborador.historico.length - 1];
    const retorno = FF.parseDate(ultima.dataRetorno);
    if (!retorno) return null;

    const ciclo = periodo + cfg.extra2;
    return FF.addDays(retorno, ciclo);
  },

  /* Dias até / desde o vencimento (negativo = vencido) */
  diasParaVencer(colaborador) {
    const prox = FF.calcProximaFolga(colaborador);
    if (!prox) return null;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    return Math.round((prox - hoje) / 86400000);
  },

  /* Status de folga */
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

  /* Iniciais do nome */
  initials(nome) {
    const parts = (nome || '').trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  },

  /* Cor do avatar baseada no status */
  avatarCls(colaborador) {
    const s = FF.statusFolga(colaborador);
    if (s.cls === 'badge-danger')  return 'av-red';
    if (s.cls === 'badge-warning') return 'av-amber';
    if (s.cls === 'badge-info')    return 'av-blue';
    return 'av-teal';
  },

  /* ── Dados de exemplo (baseado na planilha Azulão) ── */
  colaboradores: [
    {
      id: 1, chapa: '50006', nome: 'RAFAEL RODRIGUES DA SILVA',
      funcao: 'COORDENADOR DEPTO. RECURSOS HUMANOS',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 30, dataAdmissao: '06/02/2018', dataApresentacao: '02/10/2022',
      cidade: 'Altos', estado: 'PI', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '10/01/2026', dataRetorno: '19/01/2026', tipo: 'Gozo', destino: 'Altos / PI' },
        { num: 2, dataSaida: '25/02/2026', dataRetorno: '05/03/2026', tipo: 'Gozo', destino: 'Altos / PI' },
        { num: 3, dataSaida: '10/04/2026', dataRetorno: '19/04/2026', tipo: 'Gozo', destino: 'Altos / PI' },
      ]
    },
    {
      id: 2, chapa: '50015', nome: 'MARIANA DOMINIQUE DE ALENCAR SOUZA',
      funcao: 'ENGENHEIRO CIVIL',
      obra: 'LT Norte AM', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '01/03/2023', dataApresentacao: '01/03/2023',
      cidade: 'Araripina', estado: 'PE', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '28/02/2026', dataRetorno: '09/03/2026', tipo: 'Gozo', destino: 'Araripina / PE' },
      ]
    },
    {
      id: 3, chapa: '50028', nome: 'GUSTAVO FRANCISCO DA SILVA',
      funcao: 'ENCARREGADO DEPTO PESSOAL',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 90, dataAdmissao: '14/01/2022', dataApresentacao: '08/11/2025',
      cidade: 'Miranorte', estado: 'TO', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '30/01/2026', dataRetorno: '09/02/2026', tipo: 'Gozo', destino: 'Miranorte / TO' },
      ]
    },
    {
      id: 4, chapa: '50047', nome: 'PEDRO RAMOS DOS SANTOS SILVA JUNIOR',
      funcao: 'SUPERVISOR DEPTO PESSOAL',
      obra: 'LT Norte AM', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '20/01/2024', dataApresentacao: '17/03/2026',
      cidade: 'Itaboraí', estado: 'RJ', status: 'Em Folga', emFolga: true,
      historico: [
        { num: 1, dataSaida: '14/05/2026', dataRetorno: '24/05/2026', tipo: 'Gozo', destino: 'Itaboraí / RJ' },
      ]
    },
    {
      id: 5, chapa: '50056', nome: 'JOSENILTON MARQUES DA SILVA',
      funcao: 'MONTADOR III',
      obra: 'PCH Itapiranga', empresa: 'Azulão Engenharia',
      periodoDias: 90, dataAdmissao: '12/01/2022', dataApresentacao: '14/02/2025',
      cidade: 'Presidente Dutra', estado: 'MA', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '15/01/2026', dataRetorno: '24/01/2026', tipo: 'Indenização', destino: 'Pres. Dutra / MA' },
      ]
    },
    {
      id: 6, chapa: '50421', nome: 'ALTAMIRO ALVES RODRIGUES',
      funcao: 'COORDENADOR DE QUALIDADE',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 30, dataAdmissao: '15/10/2019', dataApresentacao: '14/01/2026',
      cidade: 'Serra', estado: 'ES', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '26/04/2026', dataRetorno: '05/05/2026', tipo: 'Gozo', destino: 'Serra / ES' },
      ]
    },
    {
      id: 7, chapa: '50112', nome: 'ADEMIR PEREIRA RODRIGUES',
      funcao: 'SUPERVISOR DE ELETRICA',
      obra: 'LT Norte AM', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '05/01/2024', dataApresentacao: '05/01/2024',
      cidade: 'Goiânia', estado: 'GO', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '02/03/2026', dataRetorno: '10/03/2026', tipo: 'Gozo', destino: 'Goiânia / GO' },
        { num: 2, dataSaida: '19/05/2026', dataRetorno: '27/05/2026', tipo: 'Gozo', destino: 'Goiânia / GO' },
      ]
    },
    {
      id: 8, chapa: '50097', nome: 'GESIVALDO SILVA NASCIMENTO',
      funcao: 'ENCARREGADO DE ELETRICA',
      obra: 'Sub Boa Vista', empresa: 'Azulão Engenharia',
      periodoDias: 90, dataAdmissao: '08/01/2021', dataApresentacao: '16/02/2025',
      cidade: 'Cascavel', estado: 'CE', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '20/02/2026', dataRetorno: '01/03/2026', tipo: 'Gozo', destino: 'Cascavel / CE' },
      ]
    },
    {
      id: 9, chapa: '50492', nome: 'NILTON AMORIM DE ARAUJO JUNIOR',
      funcao: 'COORDENADOR DE OBRAS',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 30, dataAdmissao: '18/06/2024', dataApresentacao: '18/06/2024',
      cidade: 'Salvador', estado: 'BA', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '16/03/2026', dataRetorno: '24/03/2026', tipo: 'Gozo', destino: 'Salvador / BA' },
        { num: 2, dataSaida: '29/04/2026', dataRetorno: '07/05/2026', tipo: 'Gozo', destino: 'Salvador / BA' },
      ]
    },
    {
      id: 10, chapa: '50754', nome: 'WESKLEY PUTENCIO ALVES',
      funcao: 'SUPERVISOR MONTAGEM ELETROMECANICO',
      obra: 'PCH Itapiranga', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '10/02/2025', dataApresentacao: '10/02/2025',
      cidade: 'Araguaína', estado: 'TO', status: 'Ativo', emFolga: false,
      historico: []
    },
    {
      id: 11, chapa: '50363', nome: 'TATIANE GONCALVES DE OLIVEIRA SANTOS',
      funcao: 'SUPERVISOR(A) SEGURANCA DO TRABALHO',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '22/02/2022', dataApresentacao: '09/12/2025',
      cidade: 'Acrelândia', estado: 'AC', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '28/02/2026', dataRetorno: '08/03/2026', tipo: 'Gozo', destino: 'Acrelândia / AC' },
      ]
    },
    {
      id: 12, chapa: '50769', nome: 'KAROLINE KLUG VIEIRA',
      funcao: 'ANALISTA DE GESTAO DE RISCO DOCUMENTAL',
      obra: 'LT Pará', empresa: 'Azulão Engenharia',
      periodoDias: 90, dataAdmissao: '28/01/2022', dataApresentacao: '14/12/2025',
      cidade: 'São Lourenço do Sul', estado: 'RS', status: 'Ativo', emFolga: false,
      historico: []
    },
    {
      id: 13, chapa: '50572', nome: 'MOACIR SANTOS BARRETO',
      funcao: 'COORDENADOR DE OBRAS',
      obra: 'UHE Sinop MT', empresa: 'Azulão Engenharia',
      periodoDias: 30, dataAdmissao: '18/02/2025', dataApresentacao: '18/02/2025',
      cidade: 'Candeias', estado: 'BA', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '17/03/2026', dataRetorno: '25/03/2026', tipo: 'Gozo', destino: 'Candeias / BA' },
        { num: 2, dataSaida: '29/04/2026', dataRetorno: '07/05/2026', tipo: 'Gozo', destino: 'Candeias / BA' },
      ]
    },
    {
      id: 14, chapa: '50880', nome: 'AMAURY AMADO MOTA',
      funcao: 'COORDENADOR DE QUALIDADE',
      obra: 'Sub Boa Vista', empresa: 'Azulão Engenharia',
      periodoDias: 30, dataAdmissao: '01/02/2025', dataApresentacao: '01/02/2025',
      cidade: 'Fortaleza', estado: 'CE', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '03/03/2026', dataRetorno: '11/03/2026', tipo: 'Gozo', destino: 'Fortaleza / CE' },
        { num: 2, dataSaida: '15/04/2026', dataRetorno: '23/04/2026', tipo: 'Gozo', destino: 'Fortaleza / CE' },
      ]
    },
    {
      id: 15, chapa: '50808', nome: 'BRUNO FELIX SOBRINHO',
      funcao: 'SUPERVISOR DE QUALIDADE',
      obra: 'LT Norte AM', empresa: 'Azulão Engenharia',
      periodoDias: 60, dataAdmissao: '06/02/2025', dataApresentacao: '06/02/2025',
      cidade: 'Parnamirim', estado: 'RN', status: 'Ativo', emFolga: false,
      historico: [
        { num: 1, dataSaida: '22/04/2026', dataRetorno: '01/05/2026', tipo: 'Gozo', destino: 'Parnamirim / RN' },
      ]
    },
  ],

  /* ── Usuários ── */
  usuarios: [
    { id: 1, nome: 'João Silva',   email: 'joao@azulao.com.br',   perfil: 'Administrador', senha: '1234' },
    { id: 2, nome: 'Ana Costa',    email: 'ana@azulao.com.br',    perfil: 'RH',            senha: '1234' },
    { id: 3, nome: 'Marcos Lima',  email: 'marcos@azulao.com.br', perfil: 'Supervisão',    senha: '1234' },
    { id: 4, nome: 'Carlos Pinto', email: 'carlos@obra.com.br',   perfil: 'Consulta',      senha: '1234' },
  ],

  /* ── Obras ── */
  obras: ['UHE Sinop MT','LT Norte AM','PCH Itapiranga','Sub Boa Vista','LT Pará'],

  /* ── Funções e periodicidades padrão ── */
  periodicidadePorFuncao: {
    'GERENTE DE PROJETOS': 30, 'GERENTE DE OBRAS': 30, 'COORDENADOR DE OBRAS': 30,
    'COORDENADOR DEPTO. RECURSOS HUMANOS': 30, 'COORDENADOR DE QUALIDADE': 30,
    'COORDENADOR SUPRIMENTOS': 30, 'SUPERVISOR DE OBRAS': 60,
    'SUPERVISOR DE QUALIDADE': 60, 'SUPERVISOR TECNICO': 60,
    'SUPERVISOR DE PLANEJAMENTO': 60, 'SUPERVISOR DE LOGISTICA': 60,
    'ENGENHEIRO CIVIL': 60, 'ENGENHEIRO MECANICO': 60,
    'ENGENHEIRO DE SEGURANÇA DO TRABALHO': 60,
    'SUPERVISOR(A) SEGURANCA DO TRABALHO': 60,
    'ENCARREGADO DE TURMA': 90, 'ENCARREGADO DE ELETRICA': 90,
    'ENCARREGADO DE MANUTENÇÃO ELETRICA': 90, 'ELETRICISTA DE MANUTENÇÃO': 90,
    'CALDEIREIRO TA': 90, 'SOLDADOR II TA': 90, 'MONTADOR DE ANDAIME': 90,
    'MONTADOR III': 90, 'MOTORISTA DE CAMINHAO': 90, 'RIGGER': 90,
  },

  /* ── Helpers de sumário ── */
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

  /* Adicionar colaborador */
  addColaborador(dados) {
    const id = Math.max(...this.colaboradores.map(c=>c.id), 0) + 1;
    this.colaboradores.push({ id, historico: [], emFolga: false, ...dados });
  },

  /* Registrar folga */
  registrarFolga(colab, folga) {
    if (!colab.historico) colab.historico = [];
    colab.historico.push({ num: colab.historico.length + 1, ...folga });
    colab.emFolga = !folga.dataRetorno;
  },

  /* Registrar retorno */
  registrarRetorno(colab, dataRetorno) {
    if (!colab.historico || colab.historico.length === 0) return;
    colab.historico[colab.historico.length-1].dataRetorno = dataRetorno;
    colab.emFolga = false;
  },

  /* Descrição da regra de período para exibição */
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
