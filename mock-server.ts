import http from "http";

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      console.log("received:", body);
      res.statusCode = 200;
      res.end("ok");
    });
  })
  .listen(4000, () => {
    console.log("listening on 4000");
  });
