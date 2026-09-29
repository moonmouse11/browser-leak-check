import { describe, expect, it } from 'vitest';
import { buildBindingRequest, parseBindingResponse, parseStunUrl } from './stun';

// RFC 5769 test vectors (sections 2.2 and 2.3), transaction id
// b7e7a701bc34d686fa87dfae. The MESSAGE-INTEGRITY bytes are zeroed and the
// FINGERPRINT value left as in the RFC - the parser reads neither.
const TRANSACTION_ID = Buffer.from('b7e7a701bc34d686fa87dfae', 'hex');

const SAMPLE_IPV4_RESPONSE = Buffer.from(
  [
    '0101003c', '2112a442', 'b7e7a701', 'bc34d686', 'fa87dfae',
    '8022000b', '74657374', '20766563', '746f7220', // SOFTWARE "test vector"
    '00200008', '0001a147', 'e112a643', // XOR-MAPPED-ADDRESS 192.0.2.1:32853
    '00080014', '00000000', '00000000', '00000000', '00000000', '00000000',
    '80280004', 'c07d4c96',
  ].join(''),
  'hex',
);

const SAMPLE_IPV6_RESPONSE = Buffer.from(
  [
    '01010048', '2112a442', 'b7e7a701', 'bc34d686', 'fa87dfae',
    '8022000b', '74657374', '20766563', '746f7220',
    '00200014', '0002a147', // XOR-MAPPED-ADDRESS family v6, port 32853
    '0113a9fa', 'a5d3f179', 'bc25f4b5', 'bed2b9d9', // 2001:db8:1234:5678:11:2233:4455:6677
    '00080014', '00000000', '00000000', '00000000', '00000000', '00000000',
    '80280004', 'c8fb0b4c',
  ].join(''),
  'hex',
);

describe('parseBindingResponse', () => {
  it('reads XOR-MAPPED-ADDRESS from the RFC 5769 IPv4 sample', () => {
    expect(parseBindingResponse(SAMPLE_IPV4_RESPONSE, TRANSACTION_ID)).toEqual({
      address: '192.0.2.1',
      port: 32853,
      family: 'v4',
    });
  });

  it('reads XOR-MAPPED-ADDRESS from the RFC 5769 IPv6 sample', () => {
    expect(parseBindingResponse(SAMPLE_IPV6_RESPONSE, TRANSACTION_ID)).toEqual({
      address: '2001:db8:1234:5678:11:2233:4455:6677',
      port: 32853,
      family: 'v6',
    });
  });

  it('falls back to a plain MAPPED-ADDRESS', () => {
    const response = Buffer.from(
      ['0101000c', '2112a442', 'b7e7a701', 'bc34d686', 'fa87dfae', '00010008', '00018055', 'c0000201'].join(''),
      'hex',
    );

    expect(parseBindingResponse(response, TRANSACTION_ID)).toEqual({
      address: '192.0.2.1',
      port: 32853,
      family: 'v4',
    });
  });

  it('ignores a response to a different transaction', () => {
    expect(parseBindingResponse(SAMPLE_IPV4_RESPONSE, Buffer.alloc(12))).toBeNull();
  });

  it('ignores anything that is not a success response', () => {
    expect(parseBindingResponse(buildBindingRequest(TRANSACTION_ID), TRANSACTION_ID)).toBeNull();
    expect(parseBindingResponse(Buffer.from('hello'), TRANSACTION_ID)).toBeNull();
  });
});

describe('buildBindingRequest', () => {
  it('is a 20-byte header with the magic cookie and transaction id', () => {
    expect(buildBindingRequest(TRANSACTION_ID).toString('hex')).toBe(
      '000100002112a442b7e7a701bc34d686fa87dfae',
    );
  });
});

describe('parseStunUrl', () => {
  it('splits host and port', () => {
    expect(parseStunUrl('stun:stun.l.google.com:19302')).toEqual({ host: 'stun.l.google.com', port: 19302 });
    expect(parseStunUrl('stun:example.org')).toEqual({ host: 'example.org', port: 3478 });
  });
});
