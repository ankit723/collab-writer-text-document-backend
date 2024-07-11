const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const pty = require('node-pty');
const fs = require('fs/promises');
const { readdir } = require('fs');
const path = require('path')
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

var ptyProcess = pty.spawn('bash', [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.INIT_CWD+ "/user",
    env: process.env
});

wss.on("connection", async (ws) => {
    console.log("WebSocket connection established");
    ptyProcess.onData((data)=>{
        ws.send(JSON.stringify({type:"terminal:data", data:data}))
    })

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
                try {
                    // Check if the directory exists
                    await fs.access('user/'+data.id);
                    console.log(`Directory ${data.id} already exists.`);
                } catch (error) {
                    // Directory does not exist, so create it
                    await fs.mkdir('user/'+data.id);
                    console.log(`Directory ${data.id} created.`);
                }
                ptyProcess.write(`cd ${data.id} \r\n`);
                ptyProcess.write(`clear ${data.id} \r\n`);
            }else if (parsedMessage.type === 'terminal:write') {
                const data = parsedMessage.data;
                ptyProcess.write(data);
            } else if (parsedMessage.type === 'file:change') {
                const data = parsedMessage.data;
                console.log(data)
                await fs.writeFile(`./user/${data.pId}/${data.path}`, data.content)
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

app.get('/files', async(req, res)=>{
    const fileTree=await generateFileTree("./user")
    return res. json({ tree: fileTree })
})

app.get('/files/content', async(req, res)=>{
    const path = req.query.path;
    const pId=req.query.pId;
    const content=await fs.readFile(`./user/${pId}/${path}`, 'utf-8')
    return res.json({content});
})

server.listen(5001, () => {
    console.log("WebSocket server started and listening on port 5001");
});

async function generateFileTree(directory){
    const tree={}

    async function buildTree(currentDir, currentTree){
        const files=await fs.readdir(currentDir)

        for(const file of files){
            const filePath=path.join(currentDir, file)
            const stat=await fs.stat(filePath)

            if(stat.isDirectory()){
                currentTree[file]={}
                await buildTree(filePath, currentTree[file])
            }else{
                currentTree[file]=null
            }
        }
    }

    await buildTree(directory, tree)
    return tree;
}

module.exports = (req, res) => {
    res.status(200).send('Server is running');
};
