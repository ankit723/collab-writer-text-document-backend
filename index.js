const mongoose = require('mongoose');
const { Server } = require('socket.io');
const express = require('express');
const http = require('http');
const cors=require('cors')
const app = express();
app.use(cors())

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
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ['GET', 'POST']
    }
});

io.on("connection", socket => {
    socket.on('get-document', async id => {
        const document = await Document.findOne({ id: id });
        console.log(document);
        socket.join(id);
        socket.emit('load-document', document.data);
        socket.on("send-changes", delta => {
            socket.broadcast.to(id).emit("recieve-changes", delta);
        });
        socket.on("save-document", async data => {
            await Document.findOneAndUpdate({ id: id }, { data });
        });
    });
});

server.listen(3001, () => {
    console.log("Socket.IO server started and listening on port 3001");
});

module.exports = (req, res) => {
    res.status(200).send('Server is running');
};
