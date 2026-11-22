// 请求日志代理：hydrojudge -> 127.0.0.1:5051 -> go-judge 127.0.0.1:5050
const http = require('http');
const fs = require('fs');

const LISTEN = 5051;
const TARGET = { host: '127.0.0.1', port: 5050 };
const LOG = __dirname + '/proxy.log';

function log(entry) {
    fs.appendFileSync(LOG, entry + '\n');
}

const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const body = Buffer.concat(chunks);
        let preview = '';
        try {
            const j = JSON.parse(body.toString('utf8'));
            preview = JSON.stringify((j.cmd || []).map((c) => ({
                args: c.args,
                env: c.env,
                copyInKeys: Object.keys(c.copyIn || {}),
                copyOutCached: c.copyOutCached,
            })));
        } catch (e) {
            preview = body.toString('utf8').slice(0, 500);
        }
        log(`[${new Date().toISOString()}] ${req.method} ${req.url} -> ${preview}`);

        const fwd = http.request(
            { ...TARGET, method: req.method, path: req.url, headers: { ...req.headers, host: `${TARGET.host}:${TARGET.port}` } },
            (r2) => {
                res.writeHead(r2.statusCode, r2.headers);
                r2.pipe(res);
            },
        );
        fwd.on('error', (e) => {
            log(`  !! forward error: ${e.message}`);
            if (!res.headersSent) res.writeHead(502);
            res.end(JSON.stringify({ error: e.message }));
        });
        fwd.end(body);
    });
});

server.listen(LISTEN, '127.0.0.1', () => log(`=== proxy listening on 127.0.0.1:${LISTEN} -> ${TARGET.host}:${TARGET.port} ===`));
