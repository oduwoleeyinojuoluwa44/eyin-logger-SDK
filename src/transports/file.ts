import fs from "fs";
import path from "path";
export class FileTransport {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  write(line: string) {
    const output = `${line}\n`;
    fs.appendFile(this.filePath, output, { encoding: "utf-8" }, (err) => {
      if (err) {
        console.error("FileTransport write failed:", err);
      }
    });
  }
}
