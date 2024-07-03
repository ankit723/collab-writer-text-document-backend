const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

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

wss.on("connection", async (ws) => {
    console.log("WebSocket connection established");

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
                await Document.findOneAndUpdate({ id: parsedMessage.id }, { data }, { upsert: true });
                console.log("Document saved:", parsedMessage.id);
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

server.listen(3001, () => {
    console.log("WebSocket server started and listening on port 3001");
});

module.exports = (req, res) => {
    res.status(200).send('Server is running');
};
