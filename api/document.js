const mongoose = require('mongoose');
require('dotenv').config()
const { Server } = require('socket.io');

let isConnected = false;

const connectToDatabase = async () => {
    if (!isConnected) {
        await mongoose.connect(process.env.MONGO_URL);
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

module.exports = async (req, res) => {
    await connectToDatabase();

    const io = new Server(res.socket.server, {
        cors: {
            origin: ["http://localhost:3000", "https://collab-writer.vercel.app/"],
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

    res.end();
};
