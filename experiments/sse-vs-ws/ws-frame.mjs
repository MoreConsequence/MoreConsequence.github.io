// 最小 RFC 6455 帧编解码（教学原型，仅供本实验使用）。
// 只覆盖实验用到的帧类型：text(0x1) / ping(0x9) / pong(0xa) / close(0x8)；
// 不支持分片 continuation(0x0) 与超过安全整数的超大 payload——这里都是小帧。
import crypto from "node:crypto";

// RFC 6455 §1.3 定义的固定 GUID，服务端用它算 Sec-WebSocket-Accept
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function handshakeAccept(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

// 服务端→客户端帧：MASK 位必须为 0（RFC 6455 §5.3）
export function encodeTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  return Buffer.concat([encodeHeader(0x1, payload.length, false), payload]);
}

// 客户端→服务端帧：MASK 位必须为 1，且携带 4 字节掩码键（RFC 6455 §5.3）
export function encodeMaskedTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const maskKey = crypto.randomBytes(4);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) masked[i] ^= maskKey[i & 3];
  return Buffer.concat([encodeHeader(0x1, payload.length, true), maskKey, masked]);
}

// 控制帧（ping/pong/close）：FIN=1，payload 长度恒小于 126
export function encodeControlFrame(opcode, payload = Buffer.alloc(0)) {
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

function encodeHeader(opcode, len, masked) {
  if (len < 126) {
    return Buffer.from([0x81, (masked ? 0x80 : 0) | len]);
  }
  if (len < 65536) {
    const h = Buffer.alloc(4);
    h[0] = 0x81;
    h[1] = (masked ? 0x80 : 0) | 126;
    h.writeUInt16BE(len, 2);
    return h;
  }
  const h = Buffer.alloc(10);
  h[0] = 0x81;
  h[1] = (masked ? 0x80 : 0) | 127;
  h.writeBigUInt64BE(BigInt(len), 2);
  return h;
}

// 从缓冲区头部取出一帧；数据不足返回 null。返回 { opcode, payload(字符串), consumed }
export function consumeFrame(buf) {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("payload too large");
    len = Number(big);
    offset = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  const payload = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
  if (masked) {
    const key = buf.subarray(offset, offset + 4);
    for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
  }
  return { opcode, payload: payload.toString("utf8"), consumed: offset + maskLen + len };
}
