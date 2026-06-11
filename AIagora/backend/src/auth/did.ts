import * as crypto from "crypto";
import { DidDocument } from "../types/agent";

const DID_METHOD = "hivagora";
// Polygon Amoy chainId for blockchainAccountId
const CHAIN_ID = process.env.CHAIN_ID ?? "80002";

// ── DID format: did:hivagora:<identifier>
// identifier is either an Ethereum address (0x…) or a random hex ID

export function generateDid(address: string): string {
  return `did:${DID_METHOD}:${address.toLowerCase()}`;
}

export function generateRandomDid(): string {
  const id = crypto.randomBytes(16).toString("hex");
  return `did:${DID_METHOD}:${id}`;
}

export function validateDid(did: string): boolean {
  const parts = did.split(":");
  return parts.length === 3 && parts[0] === "did" && parts[1] === DID_METHOD && parts[2].length >= 4;
}

export function extractIdentifier(did: string): string {
  if (!validateDid(did)) throw new Error(`Invalid DID format: ${did}`);
  return did.split(":")[2];
}

export function isAddressDid(did: string): boolean {
  const id = extractIdentifier(did);
  return /^0x[0-9a-f]{40}$/.test(id);
}

/**
 * Builds a minimal DID Document for a did:hivagora DID.
 * For address-based DIDs the verificationMethod uses EcdsaSecp256k1RecoveryMethod2020
 * (Ethereum-compatible), referencing the on-chain address on Polygon Amoy.
 */
export function buildDidDocument(did: string, endpoint?: string): DidDocument {
  const id = extractIdentifier(did);
  const vmId = `${did}#controller`;

  const verificationMethod: DidDocument["verificationMethod"][0] = isAddressDid(did)
    ? {
        id: vmId,
        type: "EcdsaSecp256k1RecoveryMethod2020",
        controller: did,
        blockchainAccountId: `eip155:${CHAIN_ID}:${id}`,
      }
    : {
        id: vmId,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyHex: id, // treat raw id as pubkey placeholder
      };

  const doc: DidDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
    ],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [vmId],
  };

  if (endpoint) {
    doc.service = [
      {
        id: `${did}#agent-hub`,
        type: "HivagoraAgentEndpoint",
        serviceEndpoint: endpoint,
      },
    ];
  }

  return doc;
}

/**
 * Creates a compact DID-JWT style token payload.
 * Follows the W3C DID-JWT convention: iss = issuer DID, sub = subject DID.
 */
export function buildDidJwtPayload(
  issuerDid: string,
  subjectDid: string,
  expiresInSeconds = 86400
): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuerDid,
    sub: subjectDid,
    aud: "hivagora-hub",
    iat: now,
    exp: now + expiresInSeconds,
    nbf: now,
  };
}
