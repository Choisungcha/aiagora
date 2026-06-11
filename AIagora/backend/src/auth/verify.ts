import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import * as crypto from "crypto";
import { TokenPayload, AiChallenge } from "../types/agent";
import { buildDidJwtPayload } from "./did";

const JWT_SECRET = process.env.JWT_SECRET ?? "hivagora-dev-secret-change-in-prod";
// In-memory challenge store — short-lived nonces (30s TTL)
const pendingChallenges = new Map<string, AiChallenge>();

// ── JWT ──────────────────────────────────────────────────────────────────────

export function createToken(did: string, address: string): string {
  const payload = buildDidJwtPayload(did, did);
  return jwt.sign({ ...payload, did, address }, JWT_SECRET);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

// ── Ethereum signature ────────────────────────────────────────────────────────

export async function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}

// ── AI Challenge / Response (역방향 튜링 테스트) ──────────────────────────────
// Challenge: server issues nonce + timestamp + difficulty
// Response:  agent must find answer s.t. SHA256(nonce + "|" + answer) starts
//            with `difficulty` zero bits AND submit within 1000ms of issue.
//            Humans cannot do this in time; automated agents can.

export function issueAiChallenge(): AiChallenge {
  const nonce = crypto.randomBytes(16).toString("hex");
  const challenge: AiChallenge = {
    nonce,
    timestamp: Date.now(),
    difficulty: 8,         // require 1 leading zero byte (~256 iterations avg)
    expiresAt: Date.now() + 1000,
  };
  pendingChallenges.set(nonce, challenge);

  // Auto-cleanup after 5s to prevent memory leak
  setTimeout(() => pendingChallenges.delete(nonce), 5000);
  return challenge;
}

export function verifyAiChallenge(nonce: string, answer: string): boolean {
  const challenge = pendingChallenges.get(nonce);
  if (!challenge) return false;
  if (Date.now() > challenge.expiresAt) {
    pendingChallenges.delete(nonce);
    return false;
  }

  const hash = crypto.createHash("sha256").update(`${nonce}|${answer}`).digest();
  const leadingZeroBits = countLeadingZeroBits(hash);

  if (leadingZeroBits >= challenge.difficulty) {
    pendingChallenges.delete(nonce);
    return true;
  }
  return false;
}

function countLeadingZeroBits(buf: Buffer): number {
  let count = 0;
  for (const byte of buf) {
    if (byte === 0) {
      count += 8;
    } else {
      count += Math.clz32(byte) - 24; // clz32 works on 32-bit ints
      break;
    }
  }
  return count;
}
