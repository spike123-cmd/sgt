import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "SGT Analytics & Gestão Executiva",
  description:
    "Painel de monitoramento e automação dos relatórios do SGT CNI / SENAI-MG com gestão operacional, avanço e pipeline automatizado.",
  openGraph: {
    title: "SGT Analytics & Gestão Executiva",
    description:
      "Painel de monitoramento e automação dos relatórios do SGT CNI / SENAI-MG com gestão operacional, avanço e pipeline automatizado.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isIgnored(err, src) {
                  try {
                    var str = (err && (err.stack || err.message) ? (err.stack + ' ' + err.message) : String(err || '')).toLowerCase();
                    var s = String(src || '').toLowerCase();
                    return str.indexOf('metamask') !== -1 ||
                           str.indexOf('chrome-extension://') !== -1 ||
                           str.indexOf('moz-extension://') !== -1 ||
                           str.indexOf('failed to connect to metamask') !== -1 ||
                           str.indexOf('ethereum') !== -1 ||
                           str.indexOf('web3') !== -1 ||
                           s.indexOf('chrome-extension://') !== -1 ||
                           s.indexOf('moz-extension://') !== -1;
                  } catch (e) {
                    return false;
                  }
                }
                window.addEventListener('error', function(e) {
                  if (isIgnored(e.error, e.filename)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return true;
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  if (isIgnored(e.reason)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return true;
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
