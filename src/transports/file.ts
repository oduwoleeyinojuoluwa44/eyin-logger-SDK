import fs from "fs";
import path from "path";
import { LogRecord } from "../types";

export class FileTransport {
    private filePath: string;


    constructor(filePath: string) {
        this.filePath = filePath;


        const dir = path.dirname(filePath);
        if(!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true});

        }
    }



write(record: LogRecord) {
    const line = JSON.stringify(record) + "\n";
    fs.appendFileSync(this.filePath, line, { encoding: "utf-8"});
    }
}