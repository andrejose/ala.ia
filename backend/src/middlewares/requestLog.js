// Log de cada requisição em uma linha JSON (fácil de filtrar no Coolify ou em
// qualquer coletor de logs). Só o essencial: método, caminho sem a query
// string (que pode ter dados como o e-mail), status e tempo. Nunca o corpo,
// o token ou o IP.
export function requestLog(write = (line) => console.log(line)) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      write(
        JSON.stringify({
          time: new Date().toISOString(),
          level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
          method: req.method,
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          ms: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
        })
      );
    });
    next();
  };
}
