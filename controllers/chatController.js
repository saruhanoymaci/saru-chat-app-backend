const Chat = require('../models/Chat');
const User = require('../models/User');

// Kullanıcı arama
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const users = await User.find({
            username: { $regex: query, $options: 'i' },
            _id: { $ne: req.user._id }
        }).select('username profileImage');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
};

// Chat başlatma veya mevcut chat'i getirme
exports.getOrCreateChat = async (req, res) => {
    try {
        const { userId } = req.body;
        const existingChat = await Chat.findOne({
            participants: { $all: [req.user._id, userId] }
        }).populate('participants', 'username profileImage');

        if (existingChat) {
            return res.json(existingChat);
        }

        const newChat = await Chat.create({
            participants: [req.user._id, userId]
        });

        const populatedChat = await Chat.findById(newChat._id)
            .populate('participants', 'username profileImage');

        res.json(populatedChat);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
};

// Kullanıcının tüm chatlerini getirme
exports.getUserChats = async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: req.user._id
        })
        .populate('participants', 'username profileImage')
        .sort({ lastMessage: -1 });
        res.json(chats);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
};

// Mesaj gönderme
exports.sendMessage = async (req, res) => {
    try {
        const { chatId, content } = req.body;
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            return res.status(404).json({ message: 'Chat bulunamadı' });
        }

        chat.messages.push({
            sender: req.user._id,
            content
        });
        chat.lastMessage = new Date();
        await chat.save();

        const populatedChat = await Chat.findById(chatId)
            .populate('participants', 'username profileImage')
            .populate('messages.sender', 'username profileImage');

        res.json(populatedChat);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
};

// Mesaj okundu bilgisini güncelleme
exports.markMessageAsRead = async (req, res) => {
    try {
        const { chatId, messageId } = req.body;
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
            return res.status(404).json({ message: 'Chat bulunamadı' });
        }

        const message = chat.messages.id(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Mesaj bulunamadı' });
        }

        // Eğer mesajı gönderen kişi değilse ve mesaj henüz okunmamışsa
        if (message.sender.toString() !== req.user._id.toString() && 
            !message.readBy.includes(req.user._id)) {
            message.readBy.push(req.user._id);
            await chat.save();
        }

        const populatedChat = await Chat.findById(chatId)
            .populate('participants', 'username profileImage')
            .populate('messages.sender', 'username profileImage')
            .populate('messages.readBy', 'username profileImage');

        res.json(populatedChat);
    } catch (error) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
};

// Chat detaylarını getirme
exports.getChatById = async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate('participants', 'username profileImage')
            .populate({
                path: 'messages',
                populate: [
                    {
                        path: 'sender',
                        select: 'username profileImage'
                    },
                    {
                        path: 'readBy',
                        select: 'username profileImage'
                    }
                ]
            });

        if (!chat) {
            return res.status(404).json({ message: 'Chat bulunamadı' });
        }

        // Kullanıcının bu chate erişim yetkisi var mı kontrol et
        if (!chat.participants.some(p => p._id.toString() === req.user._id.toString())) {
            return res.status(403).json({ message: 'Bu chate erişim yetkiniz yok' });
        }

        res.json(chat);
    } catch (error) {
        console.error('Chat detayları getirme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası' });
    }
}; 