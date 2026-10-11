import { randomBytes, randomInt } from "node:crypto";

// Crockford-style alphabet: no I, L, O, U, 0, 1 to avoid misreads at the gate.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCode(length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export const newTicketCode = () => `TKT-${randomCode(8)}`;
export const newOrderNumber = () => `ORD-${randomCode(8)}`;
export const newQrToken = () => randomBytes(24).toString("base64url");

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
