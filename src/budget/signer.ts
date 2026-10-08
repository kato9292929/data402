import { x402Client } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { gateSigner, isSolanaNetwork, solanaRpcUrl } from "./solana/config";

// The payer key lives only on the gate server. The agent never holds it, so the only way to
// get a payment signed is through a gate decision. Solana only: x402-Interlock's EVM (Base)
// signer was not moved.

// EVM addresses are case-insensitive hex; Solana base58 addresses are case-sensitive.
const eqAddr = (network: string, a: string, b: string) => (isSolanaNetwork(network) ? a === b : a.toLowerCase() === b.toLowerCase());
const same = (a: PaymentRequirements, b: PaymentRequirements) =>
  a.scheme === b.scheme &&
  a.network === b.network &&
  eqAddr(a.network, a.asset, b.asset) &&
  eqAddr(a.network, a.payTo, b.payTo) &&
  a.amount === b.amount;

// Tests only: signing a real Solana x402 payment needs an RPC (blockhash, mint), so the
// offline tests replace just this last step. Never set outside tests.
type SignFn = (paymentRequired: PaymentRequired, approved: PaymentRequirements) => Promise<PaymentPayload>;
let signOverride: SignFn | undefined;
export function setPaymentSignerForTests(f: SignFn | undefined) {
  signOverride = f;
}

/**
 * Sign exactly the requirement the gate approved, and nothing else.
 * Spend limits are enforced by the gate policy, so the SDK's default $1 cap is
 * replaced by a hook that refuses any requirement other than `approved`.
 */
export async function signApproved(
  paymentRequired: PaymentRequired,
  approved: PaymentRequirements,
): Promise<PaymentPayload> {
  if (signOverride) return signOverride(paymentRequired, approved);
  // On Solana the payer is the gate's key: the same key the task's Allowance delegates to,
  // funded per payment by a pull under that Allowance (see lib/gate.ts execute()).
  if (!isSolanaNetwork(approved.network)) throw new Error(`not a Solana network: ${approved.network}`);
  const scheme = new ExactSvmScheme(await gateSigner(), { rpcUrl: solanaRpcUrl() });
  const client = new x402Client()
    .register(approved.network as `${string}:${string}`, scheme)
    .setSpendControls(false)
    .registerPolicy((_v, reqs) => reqs.filter((r) => same(r as PaymentRequirements, approved)))
    .onBeforePaymentCreation(async ({ selectedRequirements }) =>
      same(selectedRequirements, approved) ? undefined : { abort: true, reason: "requirement differs from gate decision" },
    );
  return client.createPaymentPayload({ ...paymentRequired, accepts: [approved] });
}
