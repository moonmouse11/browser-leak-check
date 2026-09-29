import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';

// A minimal RFC 5389 STUN client: one Binding Request, read back the
// address the server saw. Enough to tell whether a registry STUN server
// answers at all - what the extension's WebRTC check depends on.

const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const MAGIC_COOKIE = 0x2112a442;
const MAPPED_ADDRESS = 0x0001;
const XOR_MAPPED_ADDRESS = 0x0020;

export interface StunMapping {
  address: string;
  port: number;
  family: 'v4' | 'v6';
}

export function buildBindingRequest(transactionId: Buffer): Buffer {
  const message = Buffer.alloc(20);
  message.writeUInt16BE(BINDING_REQUEST, 0);
  message.writeUInt16BE(0, 2); // no attributes
  message.writeUInt32BE(MAGIC_COOKIE, 4);
  transactionId.copy(message, 8);
  return message;
}

function formatAddress(bytes: Buffer): string {
  if (bytes.length === 4) return [...bytes].join('.');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i).toString(16));
  // Canonical compressed form, same as the extension's normalizeIp.
  return new URL(`http://[${groups.join(':')}]/`).hostname.slice(1, -1);
}

function readAddress(value: Buffer, xorKey: Buffer | null): StunMapping | null {
  const familyCode = value[1];
  const length = familyCode === 0x01 ? 4 : familyCode === 0x02 ? 16 : 0;
  if (!length || value.length < 4 + length) return null;

  let port = value.readUInt16BE(2);
  const address = Buffer.from(value.subarray(4, 4 + length));
  if (xorKey) {
    port ^= MAGIC_COOKIE >>> 16;
    for (let i = 0; i < length; i++) address[i]! ^= xorKey[i]!;
  }
  return { address: formatAddress(address), port, family: length === 4 ? 'v4' : 'v6' };
}

// Returns null for anything that isn't a success response to this
// transaction - a stray or malformed packet must not count as an answer.
export function parseBindingResponse(message: Buffer, transactionId: Buffer): StunMapping | null {
  if (message.length < 20) return null;
  if (message.readUInt16BE(0) !== BINDING_SUCCESS) return null;
  if (message.readUInt32BE(4) !== MAGIC_COOKIE) return null;
  if (!message.subarray(8, 20).equals(transactionId)) return null;

  const xorKey = message.subarray(4, 20); // magic cookie + transaction id
  const end = Math.min(message.length, 20 + message.readUInt16BE(2));
  let mapped: StunMapping | null = null;

  for (let offset = 20; offset + 4 <= end; ) {
    const type = message.readUInt16BE(offset);
    const length = message.readUInt16BE(offset + 2);
    const value = message.subarray(offset + 4, offset + 4 + length);
    if (type === XOR_MAPPED_ADDRESS) return readAddress(value, xorKey);
    if (type === MAPPED_ADDRESS) mapped = readAddress(value, null);
    offset += 4 + Math.ceil(length / 4) * 4; // attributes are 32-bit aligned
  }
  return mapped;
}

// "stun:host:port" -> { host, port }
export function parseStunUrl(url: string): { host: string; port: number } {
  const [host, port] = url.replace(/^stun:/, '').split(':');
  return { host: host!, port: Number(port ?? 3478) };
}

export async function stunBinding(
  url: string,
  family: 'v4' | 'v6',
  timeoutMs = 3000,
): Promise<StunMapping> {
  const { host, port } = parseStunUrl(url);
  const { address } = await lookup(host, { family: family === 'v4' ? 4 : 6 });
  const transactionId = randomBytes(12);
  const socket = createSocket(family === 'v4' ? 'udp4' : 'udp6');

  try {
    return await new Promise<StunMapping>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no response')), timeoutMs);
      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (message) => {
        const mapping = parseBindingResponse(message, transactionId);
        if (!mapping) return;
        clearTimeout(timer);
        resolve(mapping);
      });
      socket.send(buildBindingRequest(transactionId), port, address);
    });
  } finally {
    socket.close();
  }
}
