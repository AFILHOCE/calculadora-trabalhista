export type TerminationType =
  | "SEM_JUSTA_CAUSA"
  | "PEDIDO_DEMISSAO"
  | "JUSTA_CAUSA"
  | "ACORDO_484A"
  | "RESCISAO_INDIRETA";

export type NoticeMode =
  | "TRABALHADO"
  | "INDENIZADO"
  | "NAO_HA"; // used when there is no notice (e.g., justa causa)

export type RescisaoInput = {
  salarioMensal: number; // R$
  dataAdmissao: string; // YYYY-MM-DD
  dataDesligamento: string; // YYYY-MM-DD (último dia "oficial" no TRCT)
  tipo: TerminationType;

  aviso: {
    modo: NoticeMode;
    // No pedido de demissão, se o empregado não cumprir aviso, normalmente há desconto (CLT, art. 487, §2º).
    diasNaoCumpridosNoPedidoDemissao: number; // 0..30
  };

  diasTrabalhadosNoMesDaRescisao: number; // 0..30 (padrão divisor 30)

  ferias: {
    periodosVencidos: number; // 0..2
    mesesProporcionais: number; // 0..11
    // se o último mês do período aquisitivo contou 15+ dias, marque como true
    contaMesAtualSe15Dias: boolean;
  };

  fgts: {
    usarSaldoInformado: boolean;
    saldoFgts: number; // R$
  };
};

export type RescisaoOutput = {
  resumo: {
    diasAviso: number;
    fatorAviso: number; // 1 (integral) ou 0.5 (acordo)
    projetaDataPara: string; // YYYY-MM-DD (data efetiva para proporcionais)
    meses13o: number;
    mesesFgtsEstimados: number;
    saqueFgtsPercent: number; // 0, 80, 100
    seguroDesemprego: "SIM" | "NAO" | "DEPENDE";
  };
  valores: {
    saldoSalario: number;

    avisoPrevio: number;      // a receber (ou 0)
    descontoAviso: number;    // a descontar (pedido de demissão)

    decimoTerceiro: number;

    feriasVencidas: number;        // inclui 1/3
    feriasProporcionais: number;   // inclui 1/3

    multaFgts: number; // a ser depositada na conta FGTS (não sai do caixa do empregador no TRCT)
    totalNoTRCT: number; // soma do que entra/ sai no acerto (sem multa FGTS)
    totalGeral: number;  // totalNoTRCT + multa FGTS (apenas referência)
  };
  avisos: string[];
};

function parseISO(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map((v) => Number(v));
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function daysDiffInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function completeYearsBetween(start: Date, end: Date): number {
  // Quantos aniversários de admissão ocorreram até a data final?
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  const anniv = new Date(Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate()));
  if (anniv.getTime() > end.getTime()) years -= 1;
  return Math.max(0, years);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function avisoPrevioDias(input: RescisaoInput): number {
  const adm = parseISO(input.dataAdmissao);
  const des = parseISO(input.dataDesligamento);

  // Lei 12.506/2011: 30 dias + 3 dias por ano completo, até +60 (máx 90).
  const years = completeYearsBetween(adm, des);
  const extra = years <= 1 ? 0 : 3 * (years - 1);
  return clamp(30 + extra, 30, 90);
}

function monthsTouched(start: Date, end: Date): number {
  // Conta meses "tocados" no intervalo (qualquer dia no mês).
  const sY = start.getUTCFullYear(), sM = start.getUTCMonth();
  const eY = end.getUTCFullYear(), eM = end.getUTCMonth();
  return (eY - sY) * 12 + (eM - sM) + 1;
}

function count13oMonthsBy15Days(start: Date, end: Date): number {
  // Conta meses com pelo menos 15 dias no vínculo (regra prática do 13º).
  let count = 0;
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cur.getTime() <= endMonth.getTime()) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0)); // last day
    const interStart = start.getTime() > monthStart.getTime() ? start : monthStart;
    const interEnd = end.getTime() < monthEnd.getTime() ? end : monthEnd;

    if (interEnd.getTime() >= interStart.getTime()) {
      const days = daysDiffInclusive(interStart, interEnd);
      if (days >= 15) count += 1;
    }

    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  return clamp(count, 0, 12);
}

export function calcularRescisao(input: RescisaoInput): RescisaoOutput {
  const avisos: string[] = [];

  const salario = Math.max(0, input.salarioMensal || 0);
  const daily = salario / 30; // padrão mais comum para mensalista

  const adm = parseISO(input.dataAdmissao);
  const deslig = parseISO(input.dataDesligamento);

  // Aviso prévio proporcional é obrigação limitada ao empregador (quando demite sem justa causa)
  // e em rescisão indireta; no pedido de demissão a prática é 30 dias.
  let diasAviso = 0;
  if (input.tipo === "SEM_JUSTA_CAUSA" || input.tipo === "RESCISAO_INDIRETA" || input.tipo === "ACORDO_484A") {
    diasAviso = avisoPrevioDias(input);
  } else if (input.tipo === "PEDIDO_DEMISSAO") {
    diasAviso = 30;
  } else {
    diasAviso = 0;
  }

  const fatorAviso =
    input.tipo === "ACORDO_484A" ? 0.5 : 1;

  // Projeção do aviso indenizado para férias/13º/FGTS etc (CLT, art. 487, §1º).
  const projeta =
    input.aviso.modo === "INDENIZADO" && diasAviso > 0
      ? addDays(deslig, diasAviso)
      : deslig;

  // Saldo de salário
  const diasMes = clamp(input.diasTrabalhadosNoMesDaRescisao || 0, 0, 30);
  const saldoSalario = daily * diasMes;

  // 13º proporcional (mês com 15+ dias) — não é devido na justa causa (posição do TST em conteúdo explicativo)
  let meses13o = count13oMonthsBy15Days(
    // conta apenas do ano do desligamento/projeção
    new Date(Date.UTC(projeta.getUTCFullYear(), 0, 1)) < adm ? adm : new Date(Date.UTC(projeta.getUTCFullYear(), 0, 1)),
    projeta
  );

  if (input.tipo === "JUSTA_CAUSA") meses13o = 0;

  const decimoTerceiro = (salario / 12) * meses13o;

  // Férias
  const periodosVencidos = clamp(input.ferias.periodosVencidos || 0, 0, 2);
  const mesesProp = clamp(input.ferias.mesesProporcionais || 0, 0, 11) + (input.ferias.contaMesAtualSe15Dias ? 1 : 0);
  const mesesPropFinal = clamp(mesesProp, 0, 12);

  const feriasVencidas = periodosVencidos * salario * (1 + 1 / 3);

  // Proporcionais: na justa causa normalmente não; no pedido demissão, sim (Súmula 261).
  const temFeriasProporcionais = input.tipo !== "JUSTA_CAUSA";
  const feriasProporcionais = temFeriasProporcionais ? (salario * (mesesPropFinal / 12)) * (1 + 1 / 3) : 0;

  // Aviso / desconto de aviso
  let avisoPrevio = 0;
  let descontoAviso = 0;

  if ((input.tipo === "SEM_JUSTA_CAUSA" || input.tipo === "RESCISAO_INDIRETA" || input.tipo === "ACORDO_484A") && diasAviso > 0) {
    if (input.aviso.modo === "INDENIZADO") {
      avisoPrevio = daily * diasAviso * fatorAviso;
    } else {
      avisoPrevio = 0;
    }
  }

  if (input.tipo === "PEDIDO_DEMISSAO") {
    const diasNao = clamp(input.aviso.diasNaoCumpridosNoPedidoDemissao || 0, 0, 30);
    if (diasNao > 0) descontoAviso = daily * diasNao;
  }

  // FGTS (multa)
  // Base legal: 40% na dispensa sem justa causa (Lei 8.036/1990, art. 18, §1º).
  // No acordo 484-A, a indenização do FGTS é "por metade", resultando em 20%.
  const mesesFgtsEstimados = monthsTouched(adm, projeta);

  const fgtsSaldo =
    input.fgts.usarSaldoInformado
      ? Math.max(0, input.fgts.saldoFgts || 0)
      : salario * 0.08 * mesesFgtsEstimados;

  let multaFgts = 0;
  let saqueFgtsPercent = 0;
  let seguroDesemprego: "SIM" | "NAO" | "DEPENDE" = "DEPENDE";

  if (input.tipo === "SEM_JUSTA_CAUSA" || input.tipo === "RESCISAO_INDIRETA") {
    multaFgts = fgtsSaldo * 0.4;
    saqueFgtsPercent = 100;
    seguroDesemprego = "SIM";
  } else if (input.tipo === "ACORDO_484A") {
    multaFgts = fgtsSaldo * 0.2;
    saqueFgtsPercent = 80;
    seguroDesemprego = "NAO";
  } else {
    multaFgts = 0;
    saqueFgtsPercent = 0;
    seguroDesemprego = input.tipo === "PEDIDO_DEMISSAO" ? "NAO" : "NAO";
  }

  if (!input.fgts.usarSaldoInformado) {
    avisos.push("FGTS: você escolheu estimativa (8% do salário por mês). Se o salário variou ou houve afastamentos, o valor real pode mudar.");
  }

  if (input.tipo === "PEDIDO_DEMISSAO" && input.aviso.diasNaoCumpridosNoPedidoDemissao > 0) {
    avisos.push("Pedido de demissão: este resultado inclui desconto do aviso não cumprido (regra geral do art. 487, §2º, da CLT).");
  }

  if (input.tipo === "ACORDO_484A") {
    avisos.push("Acordo (art. 484-A): multa do FGTS e aviso indenizado são pagos pela metade, e não há seguro-desemprego.");
  }

  if (input.tipo === "JUSTA_CAUSA") {
    avisos.push("Justa causa: normalmente não há 13º proporcional nem férias proporcionais (mas férias vencidas permanecem devidas).");
  }

  // Totais
  const totalNoTRCT =
    saldoSalario +
    avisoPrevio +
    decimoTerceiro +
    feriasVencidas +
    feriasProporcionais -
    descontoAviso;

  const totalGeral = totalNoTRCT + multaFgts;

  return {
    resumo: {
      diasAviso,
      fatorAviso,
      projetaDataPara: fmtISO(projeta),
      meses13o,
      mesesFgtsEstimados,
      saqueFgtsPercent,
      seguroDesemprego,
    },
    valores: {
      saldoSalario,
      avisoPrevio,
      descontoAviso,
      decimoTerceiro,
      feriasVencidas,
      feriasProporcionais,
      multaFgts,
      totalNoTRCT,
      totalGeral,
    },
    avisos,
  };
}
