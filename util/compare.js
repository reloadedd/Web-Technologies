async function hasFile(dir, file) {
    const files = await dir.getFiles();
    for (let i = 0; i < files.length; i++)
        if (files[i].id === file.id) return true;

    const dirs = await dir.getDirectories();
    if (dirs.length === 0) return false;
    for (let i = 0; i < dirs.length; i++) {
        if (await hasFile(dirs[i], file)) return true;
    }

    return false;
}

async function hasDirectory(root, targetDir) {
    const dirs = await root.getDirectories();
    if (dirs.length === 0) return false;
    for (let i = 0; i < dirs.length; i++) {
        if (dirs[i].id === targetDir.id) return true;
        if (await hasDirectory(dirs[i], targetDir)) return true;
    }
}

module.exports = {
    hasFile,
    hasDirectory,
};
