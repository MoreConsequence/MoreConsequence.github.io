import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { Message } from "./types.js";

export interface SessionNode {
  id: string;
  parentId: string | null;
  message: Message;
  createdAt: number;
}

export class TreeSessionStorage {
  private nodes = new Map<string, SessionNode>();
  private activeLeafId: string | null = null;

  constructor(private filePath: string) {}

  public async init(): Promise<void> {
    if (!fs.existsSync(this.filePath)) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, "", "utf-8");
      return;
    }

    const fileStream = fs.createReadStream(this.filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    const validLines: string[] = [];
    let hasTornTail = false;

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const node: SessionNode = JSON.parse(trimmed);
        this.nodes.set(node.id, node);
        this.activeLeafId = node.id;
        validLines.push(trimmed);
      } catch {
        hasTornTail = true;
        break;
      }
    }

    if (hasTornTail) {
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, validLines.join("\n") + "\n", "utf-8");
      fs.renameSync(tmpPath, this.filePath);
    }
  }

  public appendMessage(message: Message, parentId?: string): SessionNode {
    const parent = parentId !== undefined ? parentId : this.activeLeafId;
    const node: SessionNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      parentId: parent,
      message,
      createdAt: Date.now(),
    };

    this.nodes.set(node.id, node);
    this.activeLeafId = node.id;

    fs.appendFileSync(this.filePath, JSON.stringify(node) + "\n", "utf-8");
    return node;
  }

  public getActivePath(): Message[] {
    const messages: Message[] = [];
    let currentId = this.activeLeafId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;
      messages.unshift(node.message);
      currentId = node.parentId;
    }

    return messages;
  }
}
