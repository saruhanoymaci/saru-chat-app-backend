const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    searchUsers,
    getOrCreateChat,
    getUserChats,
    sendMessage,
    markMessageAsRead,
    getChatById
} = require('../controllers/chatController');

router.get('/search', protect, searchUsers);
router.post('/create', protect, getOrCreateChat);
router.get('/chats', protect, getUserChats);
router.get('/:chatId', protect, getChatById);
router.post('/message', protect, sendMessage);
router.post('/message/read', protect, markMessageAsRead);

module.exports = router; 