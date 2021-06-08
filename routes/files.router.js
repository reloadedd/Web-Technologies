const Dispatcher = require("../util/dispatcher");
const { StatusCodes } = require("http-status-codes");
const fs = require("fs");
const {
    getFiles,
    createFile,
    uploadToLocalStorage,
    createDirectory,
    getFile,
    renameDirectory,
    renameFile,
} = require("../app/controllers/file.controller");

const { deleteFileFromOneDrive } = require("../public/js/onedrive/server-side");
const { CompressionAlgorithmEnum } = require("../config/config");

const jwt = require("jsonwebtoken");
const url = require("url");
const dispatcher = new Dispatcher();

dispatcher.on("GET", "", async (req, res) => {
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);

        if (!url.parse(req.url, true).query.id) getFiles(req, res);
        else getFile(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-type": "application/json",
        });
        res.end(
            JSON.stringify({ message: "Cannot get a file if not logged in" }),
        );
    }
});

dispatcher.on("POST", "", (req, res) => {
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        if (!req.gDriveToken) throw new Error();
        createFile(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-type": "application/json",
        });
        res.end(
            JSON.stringify({ message: "Cannot get a file if not logged in" }),
        );
    }
});

function uploadFragment(req, res, archivingType) {
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        if (
            !req.headers["content-length"] ||
            !req.headers["content-range"] ||
            !req.headers["location"] ||
            !fs.existsSync("./tmp/" + req.headers["location"]) ||
            !req.data ||
            req.data.length !== parseInt(req.headers["content-length"])
        )
            throw new Error();

        uploadToLocalStorage(req, res, archivingType);
    } catch {
        res.writeHead(StatusCodes.BAD_REQUEST, {
            "Content-type": "application/json",
        });
        res.end(
            JSON.stringify({ message: "Make sure the data is set properly" }),
        );
    }
}

/* Route for compressing the file as normal, without compression */
dispatcher.on("PUT", "", (req, res) => uploadFragment(req, res, null));

/* Route for compressing the file as GZIP */
dispatcher.on("PUT", "/gzip", (req, res) => uploadFragment(req, res, CompressionAlgorithmEnum.GZIP));

/* Route for compressing the file as BZIP2 */
dispatcher.on("PUT", "/bzip2", (req, res) => uploadFragment(req, res, CompressionAlgorithmEnum.BZIP2));

/* Route for compressing the file as ZIP */
dispatcher.on("PUT", "/zip", (req, res) => uploadFragment(req, res, CompressionAlgorithmEnum.ZIP));

dispatcher.on("POST", "/newDir", (req, res) => {
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        createDirectory(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-Type": "application.json",
        });
        res.end(
            JSON.stringify({
                message: "log in maybe?",
            }),
        );
    }
});

dispatcher.on("PATCH", "/dir", (req, res) => {
    if (!url.parse(req.url, true).query.id || !req.body.newName) {
        res.writeHead(StatusCodes.BAD_REQUEST, {
            "Content-Type": "application/json",
        });
        res.end(
            JSON.stringify({
                message: "bad parameters",
            }),
        );
        return;
    }
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        renameDirectory(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-Type": "application.json",
        });
        res.end(
            JSON.stringify({
                message: "log in maybe?",
            }),
        );
    }
});

dispatcher.on("PATCH", "/file", (req, res) => {
    if (!url.parse(req.url, true).query.id || !req.body.newName) {
        res.writeHead(StatusCodes.BAD_REQUEST, {
            "Content-Type": "application/json",
        });
        res.end(
            JSON.stringify({
                message: "no id provided",
            }),
        );
        return;
    }
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        renameFile(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-Type": "application.json",
        });
        res.end(
            JSON.stringify({
                message: "log in maybe?",
            }),
        );
    }
});

dispatcher.on("DELETE", "/files", (req, res) => {
    try {
        jwt.verify(req.jwtToken, req.UNST_JWT_SECRET);
        // deleteFileFromOneDrive(req, res);
    } catch {
        res.writeHead(StatusCodes.FORBIDDEN, {
            "Content-Type": "application.json",
        });
        res.end(
            JSON.stringify({
                response_type: "error",
                message:
                    "Could not perform delete action because the user is not authenticated.",
            }),
        );
    }
});

module.exports = dispatcher;
