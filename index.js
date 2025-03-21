const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const Chat = require("./models/Chat");
const User = require("./models/User");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);
app.use(express.json());

// Statik dosyalar için uploads klasörünü ayarla
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/uploads/profiles",
  express.static(path.join(__dirname, "uploads/profiles"))
);

// MongoDB bağlantısı
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);

// Socket.IO bağlantı yönetimi
const connectedUsers = new Map();

// Socket.IO middleware - token doğrulama
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error"));
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "gizli-anahtar"
    );
    socket.userId = decoded.id;
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  // Kullanıcı bağlandığında
  socket.on("user_connected", async (userId) => {
    if (userId === socket.userId) {
      connectedUsers.set(userId, socket.id);

      // Kullanıcının tüm chatlerini bul ve odalara katıl
      try {
        const userChats = await Chat.find({
          participants: userId,
        });

        userChats.forEach((chat) => {
          socket.join(chat._id.toString());
        });
      } catch (error) {
        console.error("Chat odalarına katılma hatası:", error);
      }
    }
  });

  // Yeni chat oluşturulduğunda
  socket.on("join_new_chat", async (chatId) => {
    try {
      const chat = await Chat.findById(chatId);
      if (chat && chat.participants.includes(socket.userId)) {
        socket.join(chatId);
      }
    } catch (error) {
      console.error("Yeni chat odasına katılma hatası:", error);
    }
  });

  socket.on("send_message", async (data) => {
    const { chatId, message, senderId, receiverId } = data;

    try {
      const chat = await Chat.findById(chatId)
        .populate("participants")
        .populate("messages.sender");

      if (chat) {
        const newMessage = {
          sender: senderId,
          content: message,
          timestamp: new Date(),
          readBy: [],
        };

        chat.messages.push(newMessage);
        chat.lastMessage = new Date();
        await chat.save();

        // Mesajı ve gönderici bilgisini populate et
        const populatedChat = await Chat.findById(chat._id)
          .populate('participants')
          .populate({
            path: 'messages',
            populate: {
              path: 'sender',
              select: 'username profileImage'
            }
          });

        const savedMessage = populatedChat.messages[populatedChat.messages.length - 1];

        // Mesajı odadaki herkese gönder
        io.to(chatId).emit("receive_message", {
          chatId,
          message: savedMessage
        });
      }
    } catch (error) {
      console.error("Mesaj gönderme hatası:", error);
      socket.emit("message_error", { error: "Mesaj gönderilemedi" });
    }
  });

  // Mesaj okundu işleme
  socket.on("message_read", async ({ chatId, messageId, readerId }) => {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) return;

      const message = chat.messages.id(messageId);
      if (!message) return;

      // Eğer mesaj zaten bu kullanıcı tarafından okundu olarak işaretlenmişse, işlem yapma
      if (message.readBy.includes(readerId)) return;

      // findOneAndUpdate kullanarak atomic update yap
      await Chat.findOneAndUpdate(
        {
          _id: chatId,
          "messages._id": messageId,
        },
        {
          $addToSet: {
            "messages.$.readBy": readerId,
          },
        },
        { new: true }
      );

      // Güncellenmiş mesajı al
      const updatedChat = await Chat.findById(chatId)
        .populate("participants")
        .populate("messages.sender")
        .populate("messages.readBy");

      const updatedMessage = updatedChat.messages.id(messageId);

      // Socket üzerinden güncellemeyi bildir
      io.to(chatId).emit("message_read_update", {
        chatId,
        messageId,
        readBy: updatedMessage.readBy,
      });
    } catch (error) {
      console.error("Mesaj okundu işaretleme hatası:", error);
    }
  });

  socket.on("disconnect", () => {
    // Kullanıcı bağlantısını kaldır
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
  });
});

// Ana route
app.get("/", (req, res) => {
  res.json({ message: "MERN Stack API çalışıyor !" });
});

// Port ayarı
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
