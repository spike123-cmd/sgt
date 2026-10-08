import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const jsonPath = path.join(process.cwd(), "public", "dados_sgt.json");
    let totalItens = 0;
    let ultimaModificacao: string | null = null;

    if (fs.existsSync(jsonPath)) {
      const stats = fs.statSync(jsonPath);
      ultimaModificacao = stats.mtime.toISOString();
      const raw = fs.readFileSync(jsonPath, "utf-8");
      const dados = JSON.parse(raw);
      if (Array.isArray(dados)) {
        totalItens = dados.length;
      }
    }

    const n8nWebhook = process.env.N8N_WEBHOOK_URL || "https://n8n.nufluxo.com.br/webhook/sgt-ingestao";
    const vpsPath = "/var/www/sgt-dashboard";

    return NextResponse.json({
      status: "online",
      total_atendimentos: totalItens,
      ultima_modificacao: ultimaModificacao,
      webhook_n8n: n8nWebhook,
      vps_path: vpsPath,
      scripts: {
        coletor: "sgt-dashboard/automacao/coletar_sgt.js",
        tratador: "sgt-dashboard/automacao/tratar_sgt.js",
        pm2_ecosystem: "sgt-dashboard/automacao/ecosystem.config.js",
        cron: "sgt-dashboard/automacao/crontab.txt"
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action;

    if (action === "testar_n8n") {
      const webhookUrl = process.env.N8N_WEBHOOK_URL || "https://n8n.nufluxo.com.br/webhook/sgt-ingestao";
      const payload = {
        origem: "SGT Dashboard Teste Manual",
        timestamp: new Date().toISOString(),
        mensagem: "Teste de conectividade do webhook de ingestao n8n",
        ambiente: "Dashboard Executivo"
      };

      try {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        return NextResponse.json({
          sucesso: resp.ok,
          status_http: resp.status,
          status_texto: resp.statusText,
          webhook: webhookUrl
        });
      } catch (e: any) {
        return NextResponse.json({
          sucesso: false,
          erro: e.message,
          webhook: webhookUrl
        });
      }
    }

    return NextResponse.json({ status: "ok", acao_recebida: action });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
}
