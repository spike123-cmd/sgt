import { NextResponse } from "next/server";
import { callN8nMcp, callN8nTool } from "@/lib/n8n-mcp";

export async function GET() {
  try {
    const toolsResp = await callN8nMcp("tools/list", {});
    const tools = toolsResp.result?.tools || [];

    // Busca detalhes do workflow do SGT
    let workflowInfo = null;
    try {
      const wfResp = await callN8nTool("get_workflow_details", {
        workflowId: "Vm7tg7oLZWs0hkSt"
      });
      if (wfResp.result?.content?.[0]?.text) {
        workflowInfo = JSON.parse(wfResp.result.content[0].text);
      }
    } catch (_) {}

    return NextResponse.json({
      conectado: true,
      servidor: "https://n8n.nufluxo.com.br/mcp-server/http",
      total_ferramentas_mcp: tools.length,
      workflow_sgt: {
        id: "Vm7tg7oLZWs0hkSt",
        nome: workflowInfo?.workflow?.name || "SGT - Ingestão, Tratamento e Dashboard",
        ativo: workflowInfo?.workflow?.active ?? true,
        nos: workflowInfo?.workflow?.nodes?.map((n: any) => ({
          nome: n.name,
          tipo: n.type
        })) || []
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { conectado: false, erro: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const acao = body.acao;

    if (acao === "executar_workflow") {
      const result = await callN8nTool("execute_workflow", {
        workflowId: "Vm7tg7oLZWs0hkSt"
      });
      return NextResponse.json({ sucesso: true, resultado: result });
    }

    if (acao === "listar_execucoes") {
      const result = await callN8nTool("search_workflow_executions", {
        workflowId: "Vm7tg7oLZWs0hkSt",
        limit: 5
      });
      return NextResponse.json({ sucesso: true, resultado: result });
    }

    return NextResponse.json({ erro: "Ação não suportada" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
}
