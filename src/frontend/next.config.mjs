import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** 開発時だけ、同一オリジンの /api/* を Workers の dev サーバー（8787 番）へ転送する。 */
const WORKER_DEV_ORIGIN = 'http://localhost:8787';

/**
 * 本番（next build）は output: 'export' の静的出力だけを作る。
 * rewrites は静的出力では使えないため、開発サーバー（phase: PHASE_DEVELOPMENT_SERVER）の時だけ設定する。
 */
export default function nextConfig(phase) {
  const config = {
    output: 'export',
    reactStrictMode: true,
  };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    config.rewrites = async () => [
      { source: '/api/:path*', destination: `${WORKER_DEV_ORIGIN}/api/:path*` },
    ];
  }
  return config;
}
