const express = require('express');
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message.model');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/messages
// @desc    Get all messages for current user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { isRead, relatedTo } = req.query;
    const filter = {
      $or: [
        { senderId: req.user._id },
        { receiverId: req.user._id }
      ]
    };

    if (isRead !== undefined) filter.isRead = isRead === 'true';
    if (relatedTo) filter.relatedTo = relatedTo;

    const messages = await Message.find(filter)
      .populate('senderId', 'firstName lastName email')
      .populate('receiverId', 'firstName lastName email')
      .populate('caseId', 'caseNumber title')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/messages/unread-count
// @desc    Get unread message count
// @access  Private
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user._id,
      isRead: false
    });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/messages
// @desc    Create new message
// @access  Private
router.post('/', [
  body('receiverId').notEmpty(),
  body('subject').trim().notEmpty(),
  body('content').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { receiverId, subject, content, caseId, relatedTo } = req.body;

    const message = new Message({
      senderId: req.user._id,
      receiverId,
      subject,
      content,
      caseId,
      relatedTo: relatedTo || 'general'
    });

    await message.save();
    await message.populate('senderId', 'firstName lastName email');
    await message.populate('receiverId', 'firstName lastName email');
    if (caseId) await message.populate('caseId', 'caseNumber title');

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PATCH /api/messages/:id/read
// @desc    Mark message as read
// @access  Private
router.patch('/:id/read', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only receiver can mark as read
    if (message.receiverId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    message.isRead = true;
    await message.save();

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('Mark message read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;




