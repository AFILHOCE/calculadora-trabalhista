"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { calcularRescisao, type TerminationType, type NoticeMode } from "@/lib/calc";
import { Card, CardBody, CardHeader, Divider, Input, Select, Button, Hint } from "@/components/ui";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(isFinite(v) ? v : 0);

const schema = z.object({
  salarioMensal: z.number().nonnegative(),
  dataAdmissao: z.string().min(10),
  dataDesligamento: z.string().min(10),
  tipo: z.enum(["SEM_JUSTA_CAUSA","PEDIDO_DEMISSAO","JUSTA_CAUSA","ACORDO_484A","RESCISAO_INDIRETA"]),
  avisoModo: z.enum(["TRABALHADO","INDENIZADO","NAO_HA"]),
  diasNaoCumpridos: z.number().min(0).max(30),
  diasTrabalhadosMes: z.number().min(0).max(30),
  feriasVencidas: z.number().min(0).max(2),
  mesesFeriasProp: z.number().min(0).max(11),
  contaMesAtual: z.boolean(),
  usarSaldoFgts: z.boolean(),
  saldoFgts: z.number().nonnegative()
});

const hoje = (() => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
})();

export default function Page() {
    const [form, setForm] = useState({
    // ... seus campos
  });

  // ✅ COLE AQUI (2.1)
  const [pdfLoading, setPdfLoading] = useState(false);

  async function baixarPdf() {
    if (!resultado) return;

    setPdfLoading(true);
    try {
      const el = document.getElementById("pdf-report");
      if (!el) return;

      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        let position = 0;
        let heightLeft = imgHeight;

        while (heightLeft > 0) {
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
          position -= pageHeight;
          if (heightLeft > 0) pdf.addPage();
        }
      }

      const hoje = new Date().toISOString().slice(0, 10);
      pdf.save(`relatorio-rescisao-${hoje}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  }

  // ... continua o arquivo

    salarioMensal: 2500,
    dataAdmissao: "2024-01-01",
    dataDesligamento: hoje,
    tipo: "SEM_JUSTA_CAUSA" as TerminationType,

    avisoModo: "INDENIZADO" as NoticeMode,
    diasNaoCumpridos: 30,

    diasTrabalhadosMes: 10,

    feriasVencidas: 0,
    mesesFeriasProp: 6,
    contaMesAtual: false,

    usarSaldoFgts: true,
    saldoFgts: 12000,
  });

  const isPedidoDemissao = form.tipo === "PEDIDO_DEMISSAO";
  const isJustaCausa = form.tipo === "JUSTA_CAUSA";

  const canShowFgtsSaldo = true;

  const parsed = useMemo(() => {
    const out = schema.safeParse({
      salarioMensal: Number(form.salarioMensal),
      dataAdmissao: form.dataAdmissao,
      dataDesligamento: form.dataDesligamento,
      tipo: form.tipo,
      avisoModo: form.avisoModo,
      diasNaoCumpridos: Number(form.diasNaoCumpridos),
      diasTrabalhadosMes: Number(form.diasTrabalhadosMes),
      feriasVencidas: Number(form.feriasVencidas),
      mesesFeriasProp: Number(form.mesesFeriasProp),
      contaMesAtual: Boolean(form.contaMesAtual),
      usarSaldoFgts: Boolean(form.usarSaldoFgts),
      saldoFgts: Number(form.saldoFgts),
    });
    return out;
  }, [form]);

  const resultado = useMemo(() => {
    if (!parsed.success) return null;
    const v = parsed.data;

    // Ajustes automáticos de UX
    let avisoModo: NoticeMode = v.avisoModo;
    if (isJustaCausa) avisoModo = "NAO_HA";
    if (v.tipo === "PEDIDO_DEMISSAO" && avisoModo === "NAO_HA") avisoModo = "TRABALHADO";

    return calcularRescisao({
      salarioMensal: v.salarioMensal,
      dataAdmissao: v.dataAdmissao,
      dataDesligamento: v.dataDesligamento,
      tipo: v.tipo,

      aviso: {
        modo: avisoModo,
        diasNaoCumpridosNoPedidoDemissao: v.diasNaoCumpridos,
      },

      diasTrabalhadosNoMesDaRescisao: v.diasTrabalhadosMes,

      ferias: {
        periodosVencidos: v.feriasVencidas,
        mesesProporcionais: v.mesesFeriasProp,
        contaMesAtualSe15Dias: v.contaMesAtual,
      },

      fgts: {
        usarSaldoInformado: v.usarSaldoFgts,
        saldoFgts: v.saldoFgts,
      },
    });
  }, [parsed, isJustaCausa]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  const invalidMsg = !parsed.success ? parsed.error.issues[0]?.message : null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="container py-6">
          <div className="text-2xl font-semibold tracking-tight">Calculadora Trabalhista (CLT)</div>
          <div className="mt-2 text-sm text-gray-600">
            Estimativa <span className="font-medium">bruta</span> de verbas rescisórias.
            Use como “bússola”, não como GPS: folha de pagamento e sindicato sempre têm a palavra final.
          </div>
        </div>
      </header>

      <div className="container py-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="1) Dados do vínculo" subtitle="Preencha o básico e a calculadora te dá um panorama." />
          <CardBody>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">Salário mensal (R$)</label>
                <Input
                  inputMode="decimal"
                  value={form.salarioMensal}
                  onChange={(e) => update("salarioMensal", Number(e.target.value))}
                />
                <Hint>Se houver adicionais variáveis (comissões, adicional noturno etc.), esta versão não calcula automaticamente.</Hint>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Data de admissão</label>
                  <Input type="date" value={form.dataAdmissao} onChange={(e) => update("dataAdmissao", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Data de desligamento</label>
                  <Input type="date" value={form.dataDesligamento} onChange={(e) => update("dataDesligamento", e.target.value)} />
                  <Hint>Informe a data do TRCT (último dia oficial).</Hint>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Tipo de desligamento</label>
                <Select value={form.tipo} onChange={(e) => update("tipo", e.target.value as any)}>
                  <option value="SEM_JUSTA_CAUSA">Dispensa sem justa causa (empregador)</option>
                  <option value="RESCISAO_INDIRETA">Rescisão indireta (como sem justa causa)</option>
                  <option value="PEDIDO_DEMISSAO">Pedido de demissão (empregado)</option>
                  <option value="ACORDO_484A">Acordo (art. 484-A)</option>
                  <option value="JUSTA_CAUSA">Justa causa (empregador)</option>
                </Select>
              </div>

              <Divider />

              <div className="grid gap-3">
                <div className="text-sm font-semibold">Aviso prévio</div>

                <div>
                  <label className="text-sm font-medium">Como será o aviso?</label>
                  <Select
                    value={isJustaCausa ? "NAO_HA" : form.avisoModo}
                    onChange={(e) => update("avisoModo", e.target.value as any)}
                    disabled={isJustaCausa}
                  >
                    <option value="TRABALHADO">Trabalhado</option>
                    <option value="INDENIZADO">Indenizado</option>
                    <option value="NAO_HA">Não houve</option>
                  </Select>
                  <Hint>
                    No aviso proporcional, os dias além de 30 normalmente são indenizados (não “trabalhados”).
                  </Hint>
                </div>

                {isPedidoDemissao ? (
                  <div>
                    <label className="text-sm font-medium">Dias não cumpridos (desconto)</label>
                    <Input
                      inputMode="numeric"
                      value={form.diasNaoCumpridos}
                      onChange={(e) => update("diasNaoCumpridos", Number(e.target.value))}
                    />
                    <Hint>Em geral, o pedido de demissão envolve aviso de 30 dias; se não cumprir, pode haver desconto.</Hint>
                  </div>
                ) : null}
              </div>

              <Divider />

              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium">Dias trabalhados no mês da rescisão (0–30)</label>
                  <Input
                    inputMode="numeric"
                    value={form.diasTrabalhadosMes}
                    onChange={(e) => update("diasTrabalhadosMes", Number(e.target.value))}
                  />
                  <Hint>Divisor padrão: 30 dias para mensalista.</Hint>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Férias vencidas (períodos)</label>
                    <Select value={String(form.feriasVencidas)} onChange={(e) => update("feriasVencidas", Number(e.target.value))}>
                      <option value="0">0</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Meses de férias proporcionais</label>
                    <Select value={String(form.mesesFeriasProp)} onChange={(e) => update("mesesFeriasProp", Number(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.contaMesAtual}
                    onChange={(e) => update("contaMesAtual", e.target.checked)}
                  />
                  Contar o mês atual como “+1” (se trabalhou 15+ dias no mês)
                </label>
                <Hint>
                  Para férias proporcionais e 13º, é comum contar o mês se houve 15 dias ou mais.
                </Hint>
              </div>

              <Divider />

              <div className="grid gap-3">
                <div className="text-sm font-semibold">FGTS</div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.usarSaldoFgts}
                    onChange={(e) => update("usarSaldoFgts", e.target.checked)}
                  />
                  Tenho o saldo do FGTS e quero usar no cálculo da multa
                </label>

                {canShowFgtsSaldo ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-sm font-medium">Saldo do FGTS (R$)</label>
                      <Input
                        inputMode="decimal"
                        value={form.saldoFgts}
                        onChange={(e) => update("saldoFgts", Number(e.target.value))}
                        disabled={!form.usarSaldoFgts}
                      />
                      <Hint>Se não informar, a calculadora estima FGTS como 8% do salário por mês (aproximação).</Hint>
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => update("usarSaldoFgts", !form.usarSaldoFgts)}
                  >
                    {form.usarSaldoFgts ? "Usar estimativa" : "Usar saldo informado"}
                  </Button>
                </div>
              </div>

              {invalidMsg ? (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {invalidMsg}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="2) Resultado"
            subtitle="Quebra por verbas do TRCT e o que costuma ir via FGTS."
          />
          <CardBody>
            {!resultado ? (
              <div className="text-sm text-gray-600">Preencha o formulário para ver o cálculo.</div>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm text-gray-600">Total estimado no TRCT (sem multa FGTS)</div>
                  <div className="mt-1 text-3xl font-semibold">{money(resultado.valores.totalNoTRCT)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
  <Button type="button" onClick={baixarPdf} disabled={pdfLoading}>
    {pdfLoading ? "Gerando PDF..." : "Baixar relatório em PDF"}
  </Button>
  <div className="text-xs text-gray-500 self-center">
    Gerado no seu dispositivo (não enviamos seus dados).
  </div>
</div>
                  <div className="mt-2 text-xs text-gray-500">
                    A multa do FGTS normalmente é depositada na conta vinculada e não “sai” do mesmo boleto do TRCT.
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="text-sm font-semibold">Detalhamento</div>

                  <Row label="Saldo de salário" value={money(resultado.valores.saldoSalario)} />
                  <Row label="Aviso prévio (a receber)" value={money(resultado.valores.avisoPrevio)} />
                  <Row label="13º proporcional" value={money(resultado.valores.decimoTerceiro)} />
                  <Row label="Férias vencidas (+ 1/3)" value={money(resultado.valores.feriasVencidas)} />
                  <Row label="Férias proporcionais (+ 1/3)" value={money(resultado.valores.feriasProporcionais)} />

                  {resultado.valores.descontoAviso > 0 ? (
                    <Row label="Desconto de aviso (pedido de demissão)" value={`- ${money(resultado.valores.descontoAviso)}`} />
                  ) : null}

                  <Divider />

                  <Row label="Multa do FGTS (referência)" value={money(resultado.valores.multaFgts)} subtle />
                  <Row label="Total geral (TRCT + multa FGTS)" value={money(resultado.valores.totalGeral)} subtle />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="font-semibold">Regras que o app está assumindo</div>
                  <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-1">
                    <li>Divisor de salário diário = 30 (mensalista).</li>
                    <li>13º: mês conta se houve 15+ dias no mês (aproximação).</li>
                    <li>Férias: paga vencidas e (se aplicável) proporcionais com 1/3.</li>
                    <li>FGTS: multa de 40% na sem justa causa / 20% no acordo 484-A (sobre o saldo informado ou estimado).</li>
                    <li>Aviso proporcional (Lei 12.506) é tratado como obrigação do empregador; no pedido de demissão, 30 dias.</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-semibold">Ponto de atenção</div>
                  <div className="mt-1">
                    Este é um cálculo <strong>educacional</strong> (bruto). Convenção coletiva, adicionais, médias, descontos (INSS/IRRF) e verbas específicas
                    podem mudar o resultado.
                  </div>
                </div>

                {resultado.avisos.length ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
                    <div className="font-semibold">Observações automáticas</div>
                    <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-1">
                      {resultado.avisos.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
                  <div className="font-semibold">Resumo “de bolso”</div>
                  <div className="mt-2 grid gap-2 text-gray-700">
                    <div>• Aviso calculado: <strong>{resultado.resumo.diasAviso}</strong> dia(s) {resultado.resumo.fatorAviso === 0.5 ? "(pago pela metade no acordo)" : ""}</div>
                    <div>• Data projetada para proporcionais: <strong>{resultado.resumo.projetaDataPara}</strong></div>
                    <div>• 13º proporcional: <strong>{resultado.resumo.meses13o}</strong> mês(es)</div>
                    <div>• Saque do FGTS: <strong>{resultado.resumo.saqueFgtsPercent}%</strong></div>
                    <div>• Seguro-desemprego: <strong>{resultado.resumo.seguroDesemprego}</strong></div>
                  </div>
                </div>
                {/* Relatório offscreen para gerar PDF (não use display:none) */}
<div
  id="pdf-report"
  className="fixed left-[-10000px] top-0 w-[794px] bg-white text-gray-900 p-8"
>
  <div className="relative overflow-hidden rounded-2xl border border-gray-200 p-6">
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rotate-[-20deg] text-6xl font-bold text-gray-200/60">
        VERSÃO GRÁTIS
      </div>
    </div>

    <div className="relative">
      <div className="text-2xl font-semibold">Relatório de Rescisão (Estimativa)</div>
      <div className="mt-1 text-sm text-gray-600">
        Gerado em: {new Date().toLocaleString("pt-BR")}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Salário mensal</div>
          <div className="font-semibold">{money(Number(form.salarioMensal) || 0)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Tipo de desligamento</div>
          <div className="font-semibold">{String(form.tipo)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Admissão</div>
          <div className="font-semibold">{form.dataAdmissao}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Desligamento</div>
          <div className="font-semibold">{form.dataDesligamento}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-lg font-semibold">Detalhamento (valores brutos)</div>

        <div className="mt-3 grid gap-2 text-sm">
          <Row label="Saldo de salário" value={money(resultado.valores.saldoSalario)} />
          <Row label="Aviso prévio (a receber)" value={money(resultado.valores.avisoPrevio)} />
          <Row label="13º proporcional" value={money(resultado.valores.decimoTerceiro)} />
          <Row label="Férias vencidas (+ 1/3)" value={money(resultado.valores.feriasVencidas)} />
          <Row label="Férias proporcionais (+ 1/3)" value={money(resultado.valores.feriasProporcionais)} />

          <div className="my-2 h-px bg-gray-200" />

          <Row label="Total no TRCT (sem multa FGTS)" value={money(resultado.valores.totalNoTRCT)} />
          <Row label="Multa do FGTS (referência)" value={money(resultado.valores.multaFgts)} subtle />
          <Row label="Total geral (TRCT + multa FGTS)" value={money(resultado.valores.totalGeral)} />
        </div>

        <div className="mt-6 text-xs text-gray-500">
          Aviso: cálculo estimativo/educacional. Pode variar por convenção coletiva, médias de variáveis,
          descontos (INSS/IRRF) e regras específicas do vínculo.
        </div>
      </div>
    </div>
  </div>
</div>
              </div>
            )}
          </CardBody>
        </Card>

        <footer className="lg:col-span-2 text-xs text-gray-500 pb-10">
          <div className="border-t border-gray-200 pt-6">
            Feito para rodar 100% no navegador — ótimo para Vercel sem backend. Dica: se você pretende monetizar (tráfego pago, venda de leads, anúncios),
            confira as regras do plano da Vercel para uso comercial.
          </div>
        </footer>
      </div>
    </main>
  );
}

function Row({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-2 ${subtle ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}>
      <div className="text-sm text-gray-700">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
