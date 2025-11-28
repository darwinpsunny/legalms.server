const express = require('express');
const { body, validationResult } = require('express-validator');
const Notice = require('../models/Notice.model');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/notices
// @desc    Get all notices
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { caseId, clientId, status, noticeType } = req.query;
    const filter = {};

    if (caseId) filter.caseId = caseId;
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;
    if (noticeType) filter.noticeType = noticeType;

    const notices = await Notice.find(filter)
      .populate('caseId', 'caseNumber title')
      .populate('clientId', 'name email')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notices
    });
  } catch (error) {
    console.error('Get notices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/notices
// @desc    Create new notice
// @access  Private (Admin, Lawyer)
router.post('/', authorize('Admin', 'Lawyer'), [
  body('title').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('noticeType').isIn(['Legal', 'Court', 'Administrative', 'Other'])
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

    const { title, description, noticeType, caseId, clientId, issueDate, dueDate, priority } = req.body;

    const notice = new Notice({
      title,
      description,
      noticeType: noticeType || 'Legal',
      caseId,
      clientId,
      issueDate: issueDate || new Date(),
      dueDate,
      priority: priority || 'Medium',
      createdBy: req.user._id
    });

    await notice.save();
    await notice.populate('caseId', 'caseNumber title');
    await notice.populate('clientId', 'name email');
    await notice.populate('createdBy', 'firstName lastName');

    res.status(201).json({
      success: true,
      data: notice
    });
  } catch (error) {
    console.error('Create notice error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;




