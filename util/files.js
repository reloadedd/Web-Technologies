/* ======================
 * --- Global Imports ---
 * ======================
 */
const fs = require("fs");
const fetch = require("node-fetch");
const { DriveEnum, CHUNK_UPLOADING_TIMEOUT } = require("../config/config");

/* =====================
 * --- Local Imports ---
 * =====================
 */
const { getFragmentFromDrive } = require("./fragments");
const {
    uploadFileToOneDrive,
    deleteFileFromOneDrive,
} = require("../public/js/onedrive/server-side");
const { cleanup } = require("../util/helpers");

/* =================
 * --- Constants ---
 * =================
 */
const {
    ONEDRIVE_BYTE_RANGE,
} = require("../app/controllers/onedrive.controller");
const DROPBOX_BYTE_STEP = 134217728; // 128 * 1024 * 1024 bytes (128Mb)

/* =================
 * --- Functions ---
 * =================
 */
async function uploadFileToGoogleDrive(
    fileId,
    fileStream,
    req,
    thisFile,
    index,
    deleteFiles = false,
) {
    // POST request to create a file on drive.
    const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=media",
        {
            method: "POST",
            headers: {
                Authorization: "Bearer " + req.gDriveToken,
            },
            body: fileStream,
        },
    );

    const gDriveFileId = (await response.json()).id;
    const newFileFragment = await req.db.fragments.create({
        id: gDriveFileId,
        // just decided: google drive will have index 0
        driveType: DriveEnum.GOOGLE_DRIVE,
        index,
    });
    thisFile.addFragment(newFileFragment);
    console.log("Finished uploading to Google Drive");
    if (deleteFiles) cleanup(fileId);
}

async function setFileToUserDropbox(
    fileId,
    fileStream,
    req,
    thisFile,
    index,
    streamSize,
    deleteFiles = false,
) {
    const startSessionResponse = await (
        await fetch(
            "https://content.dropboxapi.com/2/files/upload_session/start",
            {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + req.dropboxToken,
                    "Dropbox-API-Arg": JSON.stringify({
                        close: false,
                    }),
                    "Content-Type": "application/octet-stream",
                },
            },
        )
    ).json();

    const sessionId = startSessionResponse.session_id;

    let iHave = Buffer.alloc(0);
    let iWant = DROPBOX_BYTE_STEP;
    let i = 0;
    fileStream.on("data", async (chunk) => {
        fileStream.pause();
        iHave = Buffer.concat([
            iHave,
            chunk.slice(0, Math.min(chunk.length, iWant)),
        ]);
        iWant -= chunk.length;
        console.log("Dropbox chunk length: " + chunk.length);
        if (iWant <= 0) {
            await fetch(
                "https://content.dropboxapi.com/2/files/upload_session/append_v2",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + req.dropboxToken,
                        "Dropbox-API-Arg": JSON.stringify({
                            cursor: {
                                session_id: sessionId,
                                offset: i * DROPBOX_BYTE_STEP,
                            },
                            close: false,
                        }),
                        "Content-Type": "application/octet-stream",
                    },
                    body: iHave,
                },
            );
            console.log("Uploaded " + iHave.length + "Bytes to DropBox");
            iHave = Buffer.alloc(0);
            i++;
        }
        if (iWant === 0) iWant = DROPBOX_BYTE_STEP;
        else if (iWant < 0) {
            iHave = Buffer.concat([
                iHave,
                chunk.slice(chunk.length + iWant, chunk.length),
            ]);
            iWant += DROPBOX_BYTE_STEP;
        }
        fileStream.resume();
    });

    fileStream.on("end", async () => {
        if (iHave.length === 0) {
            console.log("wow this happened");
        } else {
            await fetch(
                "https://content.dropboxapi.com/2/files/upload_session/append_v2",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + req.dropboxToken,
                        "Dropbox-API-Arg": JSON.stringify({
                            cursor: {
                                session_id: sessionId,
                                offset: i * DROPBOX_BYTE_STEP,
                            },
                            close: false,
                        }),
                        "Content-Type": "application/octet-stream",
                    },
                    body: iHave,
                },
            );
        }
        const finishSessionResponse = await (
            await fetch(
                "https://content.dropboxapi.com/2/files/upload_session/finish",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer " + req.dropboxToken,
                        "Dropbox-API-Arg": JSON.stringify({
                            cursor: {
                                session_id: sessionId,
                                offset: streamSize,
                            },
                            commit: {
                                path: "/unst_file",
                                mode: "add",
                                autorename: true,
                                mute: false,
                                strict_conflict: false,
                            },
                        }),
                        "Content-Type": "application/octet-stream",
                    },
                },
            )
        ).json();

        const newFileFragment = await req.db.fragments.create({
            id: finishSessionResponse.id,
            // just decided: dropbox will have index 2
            driveType: DriveEnum.DROPBOX,
            index,
        });
        thisFile.addFragment(newFileFragment);
        console.log("Done uploading to Dropbox");
        if (deleteFiles) cleanup(fileId);
    });
}

async function uploadToAllDrives(fileHash, req) {
    console.log("We'll upload now");
    const configFile = JSON.parse(
        await fs.readFileSync("./tmp/" + fileHash + ".config.json"),
    );
    let start = 0;
    let index = 0;
    const User = req.db.users;
    const File = req.db.files;
    const Directory = req.db.directories;
    const thisFile = await File.create({
        name: configFile.name,
        size: configFile.totalSize,
        mimeType: configFile.mimeType,
    });
    if (!configFile.parentFolder) {
        const me = await User.findOne({ where: { email: configFile.user } });
        me.addFile(thisFile);
    } else {
        const parentDir = await Directory.findOne({
            where: {
                id: configFile.parentFolder,
            },
        });
        parentDir.addFile(thisFile);
    }

    if (req.gDriveToken) {
        const gDriveData = await (
            await fetch("https://www.googleapis.com/drive/v2/about", {
                method: "GET",
                headers: {
                    Authorization: "Bearer " + req.gDriveToken,
                },
            })
        ).json();
        const gDriveAvailableSpace =
            gDriveData.quotaBytesTotal - gDriveData.quotaBytesUsedAggregate;
        if (gDriveAvailableSpace >= configFile.totalSize) {
            console.log("Only Upload to google drive");
            uploadFileToGoogleDrive(
                fileHash,
                fs.createReadStream("./tmp/" + fileHash),
                req,
                thisFile,
                0,
                true,
            );
            return;
        } else if (gDriveAvailableSpace !== 0) {
            console.log("Upload to Google Drive");
            uploadFileToGoogleDrive(
                fileHash,
                fs.createReadStream("./tmp/" + fileHash, {
                    start,
                    end: gDriveAvailableSpace - 1,
                }),
                req,
                thisFile,
                index,
            );
            start = gDriveAvailableSpace;
            index++;
        }
    }
    if (req.dropboxToken) {
        const dropboxData = await (
            await fetch("https://api.dropboxapi.com/2/users/get_space_usage", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + req.dropboxToken,
                },
            })
        ).json();

        const dropboxAvailableSpace =
            dropboxData.allocation.allocated - dropboxData.used;

        if (dropboxAvailableSpace >= configFile.totalSize - start) {
            console.log("Last Upload to DropBox");
            console.log("Total size: " + configFile.totalSize);
            setFileToUserDropbox(
                fileHash,
                fs.createReadStream("./tmp/" + fileHash, {
                    start,
                    highWaterMark: DROPBOX_BYTE_STEP,
                }),
                req,
                thisFile,
                index,
                configFile.totalSize - start,
                true,
            );
            return;
        } else if (dropboxAvailableSpace !== 0) {
            console.log("Upload to dropBox");
            console.log(start + dropboxAvailableSpace - 1);
            setFileToUserDropbox(
                fileHash,
                fs.createReadStream("./tmp/" + fileHash, {
                    start,
                    end: start + dropboxAvailableSpace - 1,
                    highWaterMark: DROPBOX_BYTE_STEP,
                }),
                req,
                thisFile,
                index,
                dropboxAvailableSpace,
            );
            start += dropboxAvailableSpace;
            index++;
        }
    }
    if (req.OneDriveToken) {
        console.log("finally upload to OneDrive");
        uploadFileToOneDrive(
            fileHash,
            fs.createReadStream("./tmp/" + fileHash, {
                start,
                highWaterMark: ONEDRIVE_BYTE_RANGE,
            }),
            req,
            thisFile,
            index,
            configFile.totalSize - start,
            true,
        );
    }
}

async function downloadFile(req, res, file) {
    const fragments = await file.getFragments();
    fragments.sort((a, b) =>
        a.index > b.index ? 1 : b.index > a.index ? -1 : 0,
    );
    console.log(`Fragments array: ${fragments}`);
    res.writeHead(200, {
        "Content-Type": file.mimeType,
        "Content-Length": file.size,
        "Content-Disposition": "attachment; filename=" + file.name,
    });
    const fragRes = [];
    try {
        if (fragments.length > 1) {
            fragRes.push(await getFragmentFromDrive(req, fragments[0]));
            fragRes[0].pipe(res, { end: false });
            fragRes[0].on("end", async () => {
                fragRes.push(await getFragmentFromDrive(req, fragments[1]));
                if (fragments.length > 2) {
                    fragRes[1].pipe(res, { end: false });
                    fragRes[1].on("end", async () => {
                        fragRes.push(
                            await getFragmentFromDrive(req, fragments[2]),
                        );
                        fragRes[2].pipe(res);
                    });
                } else {
                    fragRes[1].pipe(res);
                }
            });
        } else {
            fragRes.push(await getFragmentFromDrive(req, fragments[0]));
            fragRes[0].pipe(res);
        }
    } catch (err) {
        console.log(`ERROR: ${err}`);
        res.end();
    }
}

async function deleteFragment(req, fragment) {
    switch (fragment.driveType) {
        case DriveEnum.GOOGLE_DRIVE:
            await fetch(
                `https://www.googleapis.com/drive/v2/files/${fragment.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: "Bearer " + req.gDriveToken,
                    },
                },
            );
        case DriveEnum.DROPBOX:
            await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + req.dropboxToken,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    path: fragment.id,
                }),
            });

        case DriveEnum.ONEDRIVE:
            await deleteFileFromOneDrive(req, fragment);
    }
    fragment.destroy();
}

async function deleteFile(req, file) {
    const fragments = await file.getFragments();
    for (const fragment of fragments) {
        deleteFragment(req, fragment);
    }
    file.destroy();
}

async function deleteDirectory(req, dir) {
    const files = await dir.getFiles();
    for (const file of files) {
        deleteFile(req, file);
    }
    const directories = await dir.getDirectories();
    for (const directory of directories) {
        deleteDirectory(req, directory);
    }
    dir.destroy();
}

module.exports = {
    setFileToUserDropbox,
    uploadToAllDrives,
    downloadFile,
    deleteFile,
    deleteDirectory,
};
