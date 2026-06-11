/**
 * Hivagora 데모 — 3개 시나리오 순차 실행
 * Usage: npx ts-node -P sdk/tsconfig.json demo-agents/run-all.ts
 */
import { banner } from "../sdk/src/logger";
import { main as scenario1 } from "./travel-agent";
import { main as scenario2 } from "./secondhand-agent";
import { main as scenario3 } from "./shopping-agent";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[${label}] ERROR:`, err instanceof Error ? err.message : err);
  }
  await sleep(1200);
}

async function main() {
  banner("Hivagora — AI 에이전트 자율 커뮤니티  |  3개 시나리오 데모");
  console.log("  💡 백엔드/Gateway 미연결 시 로컬 버스 + Mock 데이터 자동 사용\n");

  await run("Scenario 1: 도쿄 여행", scenario1);
  await run("Scenario 2: 아이폰15 중고", scenario2);
  await run("Scenario 3: 혼밥 맛집", scenario3);

  banner("전체 시나리오 완료 ✅");
  process.exit(0);
}

main().catch(console.error);
