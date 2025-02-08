const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const pty = require('node-pty');
const fs = require('fs/promises');
const path = require('path');
const chokidar = require('chokidar');

const app = express();
app.use(cors());

let isConnected = false;

const connectToDatabase = async () => {
    if (!isConnected) {
        await mongoose.connect("mongodb+srv://varanasiartistomg:lvUGf4faj8DU4MMq@cluster0.ivpmrou.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");
        isConnected = true;
        console.log("Connected to MongoDB");
    }
};

const documentSchema = new mongoose.Schema({
    id: String,
    data: Object,
    imgUrl: String,
    title: String,
    description: String,
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    type: String
});

const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

connectToDatabase();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map to store terminal processes for each project
const terminals = {};

wss.on("connection", async (ws) => {
    console.log("WebSocket connection established");

    chokidar.watch('./user').on('all', (event, path) => {
        ws.send(JSON.stringify({type:"file:refresh", data:event}))
    });

    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log("Received message:", parsedMessage);

            if (parsedMessage.type === 'get-document') {
                const document = await Document.findOne({ id: parsedMessage.id });
                if (document) {
                    ws.send(JSON.stringify({ type: 'load-document', data: document.data }));
                } else {
                    ws.send(JSON.stringify({ type: 'load-document', data: null }));
                }
            } else if (parsedMessage.type === 'send-changes') {
                const delta = parsedMessage.delta;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'receive-changes', delta: delta }));
                    }
                });
            } else if (parsedMessage.type === 'save-document') {
                const data = parsedMessage.data;
                await Document.findOneAndUpdate({ id: parsedMessage.id }, { data });
                console.log("Document saved:", parsedMessage.id);
            } else if (parsedMessage.type === 'project:started') {
                const data = parsedMessage.data;
                const projectId = data.id;

                try {
                    // Check if the directory exists
                    await fs.access('user/' + projectId);
                    console.log(`Directory ${projectId} already exists.`);
                } catch (error) {
                    // Directory does not exist, so create it
                    await fs.mkdir('user/' + projectId);
                    console.log(`Directory ${projectId} created.`);
                }

                if (!terminals[projectId]) {
                    const ptyProcess = pty.spawn('sh', [], {
                        name: 'xterm-color',
                        cols: 80,
                        rows: 30,
                        cwd: path.join(process.env.INIT_CWD, "/user", projectId),
                        env: process.env
                    });

                    terminals[projectId] = ptyProcess;

                    ptyProcess.onData((data) => {
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({ type: "terminal:data", data: data, projectId: projectId }));
                            }
                        });
                    });

                    ptyProcess.write(`cd ${projectId} \r\n`);
                    ptyProcess.write(`clear \r\n`);
                }

                ws.send(JSON.stringify({ type: 'project:started', projectId: projectId }));
            } else if (parsedMessage.type === 'terminal:write') {
                const data = parsedMessage.data;
                const projectId = parsedMessage.projectId;
                if (terminals[projectId]) {
                    terminals[projectId].write(data);
                }
            } else if (parsedMessage.type === 'file:change') {
                const data = parsedMessage.data;
                console.log(data);
                await fs.writeFile(`./user/${data.pId}/${data.path}`, data.content);
            } else if (parsedMessage.type === 'file:rename') {
                const data = parsedMessage.data;
                await fs.rename(data.oldPath, data.newPath);
            } else if (parsedMessage.type === 'file:delete') {
                const data = parsedMessage.data;
                await fs.unlink(data.filePath);
            } else if (parsedMessage.type === 'file:create') {
                const data = parsedMessage.data;
                await fs.writeFile(data.filePath, '');
            } else if (parsedMessage.type === 'folder:delete') {
                const data = parsedMessage.data;
                await deleteFolderRecursive(data.filePath);
            } else if (parsedMessage.type === 'folder:create') {
                const data = parsedMessage.data;
                await fs.mkdir(data.filePath);
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    });

    ws.on('close', () => {
        console.log("WebSocket connection closed");
    });

    ws.on('error', (error) => {
        console.error("WebSocket error:", error);
    });
});

app.get('/', (req, res)=>{
    res.send("Test Successfull")
})

app.get('/files', async (req, res) => {
    const fileTree = await generateFileTree("./user");
    return res.json({ tree: fileTree });
});

app.get('/files/content', async (req, res) => {
    const path = req.query.path;
    const pId = req.query.pId;
    const content = await fs.readFile(`./user/${pId}/${path}`, 'utf-8');
    return res.json({ content });
});

const initializeUserDirectory = async () => {
    try {
        await fs.access('./user');
        console.log('User directory exists');
    } catch (error) {
        console.log('Creating user directory...');
        await fs.mkdir('./user');
        console.log('User directory created successfully');
    }
};

// Modify the server.listen call to initialize the directory before starting
const PORT = process.env.PORT || 5001;
(async () => {
    try {
        await initializeUserDirectory();
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`WebSocket server started and listening on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
})();

async function generateFileTree(directory) {
    const tree = {};

    async function buildTree(currentDir, currentTree) {
        const files = await fs.readdir(currentDir);

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory() && file !== "node_modules") {
                currentTree[file] = {};
                await buildTree(filePath, currentTree[file]);
            } else {
                currentTree[file] = null;
            }
        }
    }

    await buildTree(directory, tree);
    return tree;
}

async function deleteFolderRecursive(folderPath) {
    try {
        const entries = await fs.readdir(folderPath); // Read directory contents

        // Iterate over each entry in the directory
        for (const entry of entries) {
            const entryPath = path.join(folderPath, entry); // Full path of the entry
            const stat = await fs.stat(entryPath); // Get the file/directory details

            if (stat.isDirectory()) {
                // Recursively delete subdirectory
                await deleteFolderRecursive(entryPath);
            } else {
                // Delete file
                await fs.unlink(entryPath);
                console.log(`Deleted file ${entryPath}`);
            }
        }

        // After deleting all contents, delete the empty directory itself
        await fs.rmdir(folderPath);
        console.log(`Deleted directory ${folderPath}`);
    } catch (err) {
        console.error(`Error deleting folder ${folderPath}:`, err);
    }
}

module.exports = (req, res) => {
    res.status(200).send('Server is running');
};
