const express = require('express');
const { body, validationResult } = require('express-validator');
const { TimeEntry, Invoice } = require('../models/Billing.model');
const Case = require('../models/Case.model');
const Client = require('../models/Client.model');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Time Entry Routes
// @route   GET /api/billing/time-entries
// @desc    Get all time entries
// @access  Private (Admin, Lawyer)
router.get('/time-entries', authorize('Admin', 'Lawyer'), async (req, res) => {
  try {
    const { caseId, lawyerId } = req.query;
    const filter = {};

    if (caseId) filter.caseId = caseId;
    if (lawyerId && req.user.role === 'Admin') {
      filter.lawyerId = lawyerId;
    } else {
      filter.lawyerId = req.user._id;
    }

    const timeEntries = await TimeEntry.find(filter)
      .populate('caseId', 'caseNumber title')
      .populate('lawyerId', 'firstName lastName')
      .sort({ date: -1 });

    res.json({
      success: true,
      data: timeEntries
    });
  } catch (error) {
    console.error('Get time entries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/billing/time-entries
// @desc    Create time entry
// @access  Private (Admin, Lawyer)
router.post('/time-entries', authorize('Admin', 'Lawyer'), [
  body('caseId').notEmpty(),
  body('date').isISO8601(),
  body('hours').isFloat({ min: 0 }),
  body('description').trim().notEmpty(),
  body('hourlyRate').isFloat({ min: 0 })
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

    const { caseId, date, hours, description, hourlyRate } = req.body;

    // Verify case exists
    const caseItem = await Case.findById(caseId);
    if (!caseItem) {
      return res.status(400).json({
        success: false,
        message: 'Case not found'
      });
    }

    const timeEntry = new TimeEntry({
      caseId,
      lawyerId: req.user._id,
      date,
      hours,
      description,
      hourlyRate
    });

    await timeEntry.save();
    await timeEntry.populate('caseId', 'caseNumber title');
    await timeEntry.populate('lawyerId', 'firstName lastName');

    res.status(201).json({
      success: true,
      data: timeEntry
    });
  } catch (error) {
    console.error('Create time entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Invoice Routes
// @route   GET /api/billing/invoices
// @desc    Get all invoices
// @access  Private
router.get('/invoices', async (req, res) => {
  try {
    const { clientId, status } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;

    // Client can only see their own invoices
    if (req.user.role === 'Client') {
      const client = await Client.findOne({ email: req.user.email });
      if (client) {
        filter.clientId = client._id;
      } else {
        return res.json({ success: true, data: [] });
      }
    } else if (req.user.role === 'Lawyer') {
      // Lawyer can see invoices for their clients
      const clients = await Client.find({ assignedLawyerId: req.user._id });
      filter.clientId = { $in: clients.map(c => c._id) };
    }

    const invoices = await Invoice.find(filter)
      .populate('clientId', 'name email')
      .populate('caseIds', 'caseNumber title')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: invoices
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/billing/invoices
// @desc    Create invoice
// @access  Private (Admin, Lawyer)
router.post('/invoices', authorize('Admin', 'Lawyer'), [
  body('clientId').notEmpty(),
  body('issueDate').isISO8601(),
  body('dueDate').isISO8601(),
  body('items').isArray({ min: 1 }),
  body('items.*.caseId').notEmpty(),
  body('items.*.description').trim().notEmpty(),
  body('items.*.quantity').isFloat({ min: 0 }),
  body('items.*.rate').isFloat({ min: 0 })
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

    const { clientId, issueDate, dueDate, items } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(400).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Verify all cases exist
    const caseIds = [...new Set(items.map(item => item.caseId))];
    const cases = await Case.find({ _id: { $in: caseIds } });
    if (cases.length !== caseIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more cases not found'
      });
    }

    const invoice = new Invoice({
      clientId,
      issueDate,
      dueDate,
      items,
      caseIds,
      createdBy: req.user._id
    });

    await invoice.save();
    await invoice.populate('clientId', 'name email');
    await invoice.populate('caseIds', 'caseNumber title');

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PATCH /api/billing/invoices/:id/status
// @desc    Update invoice status
// @access  Private (Admin, Lawyer)
router.patch('/invoices/:id/status', authorize('Admin', 'Lawyer'), [
  body('status').isIn(['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'])
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

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    )
      .populate('clientId', 'name email')
      .populate('caseIds', 'caseNumber title');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    console.error('Update invoice status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;




