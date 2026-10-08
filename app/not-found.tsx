import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold mb-2">Página não encontrada</h2>
        <p className="text-slate-400 mb-4">A página que você procura não existe ou foi movida.</p>
        <Link href="/" className="px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-500 transition-colors">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
