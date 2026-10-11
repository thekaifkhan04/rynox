import { networkInterfaces } from "node:os";

/**
 * This machine's addresses on the local network (e.g. 192.168.1.20), so a
 * phone on the same Wi-Fi can open the site during development.
 */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}
