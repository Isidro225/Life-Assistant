"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = require("http");
const url_1 = require("url");
const next_1 = __importDefault(require("next"));
const ws_1 = require("ws");
const ws_handler_1 = require("./src/lib/ws-handler");
const dev = process.env.NODE_ENV !== "production";
const port = parseInt((_a = process.env.PORT) !== null && _a !== void 0 ? _a : "3000", 10);
const app = (0, next_1.default)({ dev });
const handle = app.getRequestHandler();
app.prepare().then(() => {
    const server = (0, http_1.createServer)((req, res) => {
        var _a;
        const parsedUrl = (0, url_1.parse)((_a = req.url) !== null && _a !== void 0 ? _a : "/", true);
        handle(req, res, parsedUrl);
    });
    const wss = new ws_1.WebSocketServer({ noServer: true });
    wss.on("connection", ws_handler_1.handleAudioConnection);
    server.on("upgrade", (req, socket, head) => {
        var _a;
        const { pathname } = (0, url_1.parse)((_a = req.url) !== null && _a !== void 0 ? _a : "/");
        if (pathname === "/ws/audio") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
        else {
            socket.destroy();
        }
    });
    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
});
