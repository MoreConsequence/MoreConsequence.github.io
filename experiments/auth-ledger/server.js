// experiments/auth-ledger/server.js
//
// 本地教学原型：同一个 /api/profile 接口，分别用 Session / JWT / JWT+Introspection
// 三种方式实现鉴权。用途只有两个：
//   1. 对比三条验证路径的本地延迟量级（本地 CPU 验签 vs 进程内 introspection 调用）；
//   2. 演示「踢人」在三种方式下的生效差异（立即 / 等 TTL / 立即但依赖 introspection）。
//
// 零依赖，只用 node:crypto 与 node:http。不伪装成生产方案：
// - denylist 是内存 Map，重启即失；
// - introspection 用进程内函数模拟，真实跨网络 introspection 还要加一次 RTT；
// - 压测是单次运行的本地结果，不是稳定分界线。
//
// 运行（仓库根目录）：
//   node experiments/auth-ledger/server.js          # 压测 + 踢人演示
//   node experiments/auth-ledger/server.js --server # 起真实 HTTP 服务，用 curl 打
//   curl -s localhost:8787/api/profile -H "Authorization: Bearer <token>"

import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { createServer } from "node:http";

const NOW = () => Math.floor(Date.now() / 1000);

// ---------- JWT 基础件（RS256） ----------

const b64 = (buf) => Buffer.from(buf).toString("base64url");

function signJwt(payload, privateKey) {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey, "base64url")}`;
}

function verifyJwt(token, publicKey) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const [h, p, s] = parts;
  // alg=none / 算法混淆攻击：只接受 RS256，拒绝把 alg 换成 HS256/none。
  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new Error(`unexpected alg: ${header.alg}`);
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(s, "base64url"))) {
    throw new Error("bad signature");
  }
  if (payload.exp !== undefined && payload.exp < NOW()) throw new Error("expired");
  return payload;
}

// ---------- 三个鉴权后端：同一接口，三种「状态存哪」 ----------

// 1. Session：状态存服务端 Map，token 只是随机不透明 id。
class SessionAuth {
  constructor() {
    this.sessions = new Map(); // sessionId -> { userId, expiresAt }
    this.ttlSec = 3600;
  }
  issue(userId) {
    const id = randomBytes(16).toString("hex");
    this.sessions.set(id, { userId, expiresAt: NOW() + this.ttlSec });
    return id;
  }
  // 每个请求查一次 Map：踢人 = delete，立即生效。
  verify(token) {
    const row = this.sessions.get(token);
    if (!row) throw new Error("no session");
    if (row.expiresAt < NOW()) {
      this.sessions.delete(token);
      throw new Error("session expired");
    }
    return { userId: row.userId, kind: "session" };
  }
  kick(token) {
    this.sessions.delete(token);
  }
}

// 2. JWT：状态存 token 自身，验证是本地公钥验签，服务端无记录可删。
class JwtAuth {
  constructor(publicKey, privateKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.ttlSec = 3600;
  }
  issue(userId) {
    return signJwt(
      { sub: String(userId), jti: randomBytes(8).toString("hex"), iat: NOW(), exp: NOW() + this.ttlSec },
      this.privateKey,
    );
  }
  verify(token) {
    return { userId: verifyJwt(token, this.publicKey).sub, kind: "jwt" };
  }
  // 「踢人」只能靠维护一份 denylist 或等 TTL 过期——本地验签根本不看它。
  kick() {
    throw new Error("JWT 无服务端状态，本地验签无法踢人；只能等 TTL 或加 denylist");
  }
}

// 3. JWT + introspection：token 仍是 JWT，但 API 不本地验签，
//    改调 introspection 端点。端点同时做「查 denylist + 验签」，
//    于是 jti 上黑名单 = 立即踢人，代价是每请求多一次 introspection 调用。
class IntrospectAuth {
  constructor(publicKey, privateKey) {
    this.inner = new JwtAuth(publicKey, privateKey);
    this.denylist = new Map(); // jti -> revokedAt
    this.active = new Map(); // jti -> userId，端点的权威记录
  }
  issue(userId) {
    const token = this.inner.issue(userId);
    this.active.set(verifyJwt(token, this.publicKey).jti, userId);
    return token;
  }
  get publicKey() {
    return this.inner.publicKey;
  }
  // RFC 7662 端点：返回 active: true/false。
  introspect(token) {
    const claims = verifyJwt(token, this.inner.publicKey); // 先验签
    if (this.denylist.has(claims.jti)) return { active: false, jti: claims.jti };
    return { active: true, jti: claims.jti, sub: claims.sub };
  }
  verify(token) {
    // API 侧 = 一次 introspection 调用，本地 CPU 之外的真实部署还要加一次网络 RTT。
    const res = this.introspect(token);
    if (!res.active) throw new Error("inactive (revoked)");
    return { userId: res.sub, kind: "jwt+introspection" };
  }
  kick(token) {
    const jti = verifyJwt(token, this.inner.publicKey).jti;
    this.denylist.set(jti, NOW());
    this.active.delete(jti);
  }
}

// ---------- 压测：本地各路径验证延迟 ----------

function bench(fn, n = 200000, warm = 5000) {
  for (let i = 0; i < warm; i++) fn();
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    samples[i] = Number(process.hrtime.bigint() - t0) / 1000; // ns -> µs
  }
  samples.sort();
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const p50 = samples[Math.floor(n * 0.5)];
  const p99 = samples[Math.floor(n * 0.99)];
  return { mean, p50, p99, n };
}

function fmt(us) {
  return us >= 1000 ? `${(us / 1000).toFixed(2)}ms` : `${us.toFixed(2)}µs`;
}

function runBench() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const session = new SessionAuth();
  const jwt = new JwtAuth(publicKey, privateKey);
  const introspect = new IntrospectAuth(publicKey, privateKey);

  const st = session.issue(7);
  const jt = jwt.issue(7);
  const it = introspect.issue(7);

  console.log("== 验证路径延迟（本地单进程，单次运行，非稳定分界线）==");
  console.log(`行数 ${"均值".padEnd(9)}${"p50".padEnd(9)}${"p99".padEnd(9)}${"说明"}`);
  const rows = [
    [bench(() => session.verify(st)), "Map 查一次"],
    [bench(() => jwt.verify(jt)), "本地 RSA 验签，无状态"],
    [bench(() => introspect.verify(it)), "进程内 introspection（真实网络版另加一次 RTT）"],
  ];
  for (const [r, note] of rows) {
    console.log(`${String(r.n).padEnd(6)}${fmt(r.mean).padEnd(9)}${fmt(r.p50).padEnd(9)}${fmt(r.p99).padEnd(9)}${note}`);
  }
}

// ---------- 踢人演示：三种方式各走一遍 ----------

function runKickDemo() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const session = new SessionAuth();
  const jwt = new JwtAuth(publicKey, privateKey);
  const introspect = new IntrospectAuth(publicKey, privateKey);

  const log = (label, step, ok) =>
    console.log(`${label.padEnd(22)} ${step.padEnd(12)} ${ok ? "200 OK" : "401 拒绝"}`);

  console.log("\n== 踢人演示：同样一个「把用户 7 踢下线」，三种方式下次请求的差异 ==");

  const st = session.issue(7);
  log("session", "踢前", !!session.verify(st));
  session.kick(st);
  log("session", "踢后", (() => { try { session.verify(st); return true; } catch { return false; } })());

  const jt = jwt.issue(7);
  log("jwt", "踢前", !!jwt.verify(jt));
  try { jwt.kick(jt); } catch (e) { /* 无状态后端没有可删的记录 */ }
  // 本地验签不查 denylist：即使服务端想把 jti 拉黑，本地验签也不受影响，直到 exp。
  const still = (() => { try { jwt.verify(jt); return true; } catch { return false; } })();
  log("jwt", "踢后(仍有效)", still);

  const it = introspect.issue(7);
  log("jwt+introspection", "踢前", !!introspect.verify(it));
  introspect.kick(it); // jti 进 denylist，端点是唯一裁决者
  log("jwt+introspection", "踢后", (() => { try { introspect.verify(it); return true; } catch { return false; } })());
}

// ---------- HTTP 服务模式：--server 时用 curl 打 ----------

function runHttpServer() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const backends = {
    session: new SessionAuth(),
    jwt: new JwtAuth(publicKey, privateKey),
    introspect: new IntrospectAuth(publicKey, privateKey),
  };
  const tokenByKind = {};
  for (const [k, b] of Object.entries(backends)) tokenByKind[k] = b.issue(7);

  const server = createServer((req, res) => {
    if (req.url === "/api/tokens") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(tokenByKind, null, 2));
      return;
    }
    if (req.url !== "/api/profile") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer (\S+)$/);
    if (!m) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "missing token" }));
      return;
    }
    // 三种 token 都走同一把校验开关；踢人演示在默认（非 --server）的 CLI 运行里做（见 kick 演示段），HTTP 模式只验证 /api/profile
    for (const [kind, b] of Object.entries(backends)) {
      try {
        const { userId } = b.verify(m[1]);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ user: userId, via: kind }));
        return;
      } catch {
        /* try next backend */
      }
    }
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "invalid or revoked token" }));
  });
  server.listen(8787, () => {
    console.log("listening on http://127.0.0.1:8787");
    console.log("GET /api/tokens  拿到三种 token");
    console.log("GET /api/profile  带 Bearer token 验证");
  });
}

const isServer = process.argv.includes("--server");
if (isServer) {
  runHttpServer();
} else {
  runBench();
  runKickDemo();
}
