import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  });
  pool.on("error", (err) => {
    console.error("[PG] Unexpected error:", err.message);
  });
  return pool;
}

// ── Schema ────────────────────────────────────────────────────────────────────
// Off-chain negotiation log (encrypted content stays encrypted, we log metadata only)

export async function initSchema(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS negotiation_log (
      id            SERIAL PRIMARY KEY,
      deal_id       VARCHAR(64) NOT NULL,
      agent_a       VARCHAR(128) NOT NULL,
      agent_b       VARCHAR(128) NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending',
      deal_hash     VARCHAR(66),
      amount_krw    BIGINT DEFAULT 0,
      affiliate_urls JSONB DEFAULT '[]',
      chain_tx_hash VARCHAR(66),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_nl_deal_id ON negotiation_log(deal_id);
    CREATE INDEX IF NOT EXISTS idx_nl_agents  ON negotiation_log(agent_a, agent_b);
  `);
  console.log("[PG] Schema initialized");
}

export async function logNegotiation(params: {
  dealId: string;
  agentA: string;
  agentB: string;
  amountKrw?: number;
}): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO negotiation_log (deal_id, agent_a, agent_b, amount_krw)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [params.dealId, params.agentA, params.agentB, params.amountKrw ?? 0]
  );
}

export async function updateNegotiationStatus(
  dealId: string,
  status: "confirmed" | "rejected",
  chainTxHash?: string,
  dealHash?: string
): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE negotiation_log
     SET status = $2, chain_tx_hash = $3, deal_hash = $4, updated_at = NOW()
     WHERE deal_id = $1`,
    [dealId, status, chainTxHash ?? null, dealHash ?? null]
  );
}

export async function getNegotiationByDealId(dealId: string) {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT * FROM negotiation_log WHERE deal_id = $1 LIMIT 1`,
    [dealId]
  );
  return rows[0] ?? null;
}
