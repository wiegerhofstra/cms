import { gzipSync } from "node:zlib";

/** A portable ustar archive containing only our fixed, relative export filenames. */
export function createIntegrationArchive(files: Record<string, string>): Uint8Array<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for (const [name, text] of Object.entries(files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith("/") || name.split("/").includes("..") || Buffer.byteLength(name) > 100) {
      throw new Error("Invalid export filename");
    }
    const body = Buffer.from(text, "utf8");
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.fill(32, 148, 156);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return new Uint8Array(gzipSync(Buffer.concat(chunks)));
}
