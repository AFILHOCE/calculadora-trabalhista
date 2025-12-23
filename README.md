# Calculadora Trabalhista (CLT) — Rescisão (estimativa)

**O que é:** um web app (Next.js) que estima *valores brutos* de verbas rescisórias (saldo de salário, aviso, 13º, férias vencidas/proporcionais e multa do FGTS).

## Rodar local
```bash
npm install
npm run dev
```
Abra http://localhost:3000

## Deploy na Vercel (mais simples)
1. Crie um repositório no GitHub e suba estes arquivos.
2. Na Vercel, clique em “New Project” e importe o repositório.
3. Build command: `npm run build` (padrão)
4. Output: Next.js (auto-detect)

## Observação importante
Este app não calcula INSS/IRRF, médias de variáveis, adicionais, convenções coletivas, etc.
Use para ter noção rápida, e valide com o TRCT/folha/sindicato.
