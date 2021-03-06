const Dispatcher = require("../util/dispatcher");
const {
    onAuth,
    onToken,
    getSpace,
} = require("../app/controllers/dropbox.controller");
const { StatusCodes } = require("http-status-codes");
const jwt = require("jsonwebtoken");

const dispatcher = new Dispatcher();

dispatcher.on("GET", "/auth", (req, res) => {
    onAuth(req, res);
});

dispatcher.on("GET", "/token", (req, res) => {
    onToken(req, res);
});

dispatcher.on("GET", "/space", async (req, res) => {
    if (!req.dropboxToken) {
        res.writeHead(StatusCodes.TEMPORARY_REDIRECT, {
            Location: "/account",
        });
        res.end();
        return;
    }
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
    } catch {
        res.writeHead(StatusCodes.TEMPORARY_REDIRECT, {
            Location: "/login",
        });
        res.end();
        return;
    }
    await getSpace(req, res);
});

module.exports = dispatcher;
