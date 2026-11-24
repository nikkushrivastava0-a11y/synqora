import { createInterface } from "node:readline";

export async function waitForApiPort(child) {
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const match = /^CampusFest listening on loopback port (\d+) workspace /.exec(line);
      if (match) return Number(match[1]);
    }
    throw new Error("CampusFest exited before announcing its listening port");
  } finally {
    lines.close();
  }
}
