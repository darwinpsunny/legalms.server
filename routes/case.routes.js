const express = require('express');
const { body, validationResult } = require('express-validator');
const Case = require('../models/Case.model');
const Client = require('../models/Client.model');
const User = require('../models/User.model');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Helper function to format case response consistently
function formatCaseResponse(caseItem) {
  if (!caseItem) return null;
  
  return {
    id: caseItem._id ? caseItem._id.toString() : caseItem.id || '',
    caseNumber: caseItem.caseNumber || '',
    title: caseItem.title || '',
    description: caseItem.description || '',
    status: caseItem.status || 'Open',
    priority: caseItem.priority || 'Medium',
    caseType: caseItem.caseType || '',
    clientId: caseItem.clientId 
      ? (typeof caseItem.clientId === 'object' && caseItem.clientId._id 
          ? caseItem.clientId._id.toString() 
          : caseItem.clientId.toString())
      : null,
    clientName: (caseItem.clientId && typeof caseItem.clientId === 'object' && caseItem.clientId.name) 
      ? caseItem.clientId.name 
      : 'Unknown',
    assignedLawyerId: caseItem.assignedLawyerId 
      ? (typeof caseItem.assignedLawyerId === 'object' && caseItem.assignedLawyerId._id 
          ? caseItem.assignedLawyerId._id.toString() 
          : caseItem.assignedLawyerId.toString())
      : null,
    assignedLawyerName: (caseItem.assignedLawyerId && typeof caseItem.assignedLawyerId === 'object' && caseItem.assignedLawyerId.firstName && caseItem.assignedLawyerId.lastName)
      ? `${caseItem.assignedLawyerId.firstName} ${caseItem.assignedLawyerId.lastName}`
      : 'Unknown',
    courtName: caseItem.courtName || '',
    filingDate: caseItem.filingDate || new Date(),
    nextHearingDate: caseItem.nextHearingDate || undefined,
    customFields: (caseItem.customFields && caseItem.customFields instanceof Map) 
      ? Object.fromEntries(caseItem.customFields) 
      : (caseItem.customFields || {}),
    documents: caseItem.documents && Array.isArray(caseItem.documents) 
      ? caseItem.documents.map(doc => ({
          id: (doc._id ? doc._id.toString() : doc.id) || '',
          fileName: doc.fileName || '',
          filePath: doc.filePath || '',
          uploadDate: doc.createdAt || doc.uploadDate || new Date(),
          uploadedBy: doc.uploadedBy 
            ? (typeof doc.uploadedBy === 'object' && doc.uploadedBy._id 
                ? doc.uploadedBy._id.toString() 
                : doc.uploadedBy.toString())
            : '',
          documentType: doc.documentType || ''
        }))
      : [],
    timeline: caseItem.timeline && Array.isArray(caseItem.timeline)
      ? caseItem.timeline.map(event => ({
          id: (event._id ? event._id.toString() : event.id) || '',
          date: event.date || new Date(),
          title: event.title || '',
          description: event.description || '',
          type: event.type || 'note',
          createdBy: event.createdBy 
            ? (typeof event.createdBy === 'object' && event.createdBy._id 
                ? event.createdBy._id.toString() 
                : event.createdBy.toString())
            : ''
        }))
      : []
  };
}

// @route   GET /api/cases
// @desc    Get all cases
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { clientId, assignedLawyerId, status, caseType } = req.query;
    const filter = {};

    // Client can only see their own cases
    if (req.user.role === 'Client') {
      const client = await Client.findOne({ email: req.user.email });
      if (client) {
        filter.clientId = client._id;
      } else {
        return res.json({ success: true, data: [] });
      }
    } else if (req.user.role === 'Lawyer') {
      // Lawyer can see cases assigned to them
      filter.assignedLawyerId = req.user._id;
    }
    // Admin can see all cases

    if (clientId) filter.clientId = clientId;
    if (assignedLawyerId && req.user.role === 'Admin') filter.assignedLawyerId = assignedLawyerId;
    if (status) filter.status = status;
    if (caseType) filter.caseType = caseType;

    const cases = await Case.find(filter)
      .populate('clientId', 'name email')
      .populate('assignedLawyerId', 'firstName lastName email')
      .sort({ createdAt: -1 });

    const formattedCases = cases.map(caseItem => formatCaseResponse(caseItem));

    res.json({
      success: true,
      data: formattedCases
    });
  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/cases/:id
// @desc    Get case by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const caseItem = await Case.findById(req.params.id)
      .populate('clientId', 'name email')
      .populate('assignedLawyerId', 'firstName lastName email');

    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    // Check access
    if (req.user.role === 'Client') {
      const client = await Client.findOne({ email: req.user.email });
      if (!client || caseItem.clientId._id.toString() !== client._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    } else if (req.user.role === 'Lawyer') {
      if (caseItem.assignedLawyerId._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    res.json({
      success: true,
      data: formatCaseResponse(caseItem)
    });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/cases
// @desc    Create new case
// @access  Private (Admin, Lawyer)
router.post('/', authorize('Admin', 'Lawyer'), [
  body('title').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('priority').isIn(['Low', 'Medium', 'High', 'Urgent']),
  body('caseType').isIn(['Civil', 'Criminal', 'Corporate', 'Family', 'Property', 'Labor', 'Tax', 
    'PersonalInjury', 'Immigration', 'Bankruptcy', 'ChequeDefault', 'Other']),
  body('clientId').notEmpty(),
  body('assignedLawyerId').notEmpty(),
  body('courtName').trim().notEmpty(),
  body('filingDate').isISO8601()
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

    const { title, description, priority, caseType, clientId, assignedLawyerId, 
            courtName, filingDate, nextHearingDate, customFields } = req.body;

    // Verify client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(400).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Verify lawyer exists
    const lawyer = await User.findById(assignedLawyerId);
    if (!lawyer || (lawyer.role !== 'Lawyer' && lawyer.role !== 'Admin')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assigned lawyer'
      });
    }

    // If not Admin, can only assign to self
    if (req.user.role !== 'Admin' && assignedLawyerId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign cases to yourself'
      });
    }

    // Convert customFields to plain object if it's a Map (Mongoose Map schema expects plain objects)
    let customFieldsObj = {};
    if (customFields) {
      if (customFields instanceof Map) {
        // Convert Map to plain object
        customFieldsObj = Object.fromEntries(customFields);
      } else if (typeof customFields === 'object' && customFields !== null) {
        // Already a plain object, use as is
        customFieldsObj = customFields;
      }
    }

    const caseItem = new Case({
      title,
      description,
      priority,
      caseType,
      clientId,
      assignedLawyerId,
      courtName,
      filingDate,
      nextHearingDate,
      customFields: customFieldsObj, // Mongoose will convert plain object to Map internally
      createdBy: req.user._id
    });

    // Add initial timeline event
    caseItem.timeline.push({
      date: new Date(),
      title: 'Case Created',
      description: `Case "${title}" was created`,
      type: 'filing',
      createdBy: req.user._id
    });

    await caseItem.save();
    await caseItem.populate('clientId', 'name email');
    await caseItem.populate('assignedLawyerId', 'firstName lastName email');

    res.status(201).json({
      success: true,
      data: formatCaseResponse(caseItem)
    });
  } catch (error) {
    console.error('Create case error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/cases/bulk
// @desc    Create multiple cases in bulk
// @access  Private (Admin, Lawyer)
router.post('/bulk', authorize('Admin', 'Lawyer'), [
  body('cases').isArray({ min: 1 }).withMessage('Cases array is required and must not be empty'),
  body('cases.*.title').trim().notEmpty(),
  body('cases.*.description').trim().notEmpty(),
  body('cases.*.priority').isIn(['Low', 'Medium', 'High', 'Urgent']),
  body('cases.*.caseType').isIn(['Civil', 'Criminal', 'Corporate', 'Family', 'Property', 'Labor', 'Tax', 
    'PersonalInjury', 'Immigration', 'Bankruptcy', 'ChequeDefault', 'Other']),
  body('cases.*.clientId').notEmpty(),
  body('cases.*.assignedLawyerId').notEmpty(),
  body('cases.*.courtName').trim().notEmpty(),
  body('cases.*.filingDate').isISO8601()
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

    const { cases } = req.body;
    const results = {
      success: [],
      failed: [],
      total: cases.length
    };

    // Verify client and lawyer exist (do this once for all cases if they're the same)
    const uniqueClientIds = [...new Set(cases.map(c => c.clientId))];
    const uniqueLawyerIds = [...new Set(cases.map(c => c.assignedLawyerId))];
    
    const clients = await Client.find({ _id: { $in: uniqueClientIds } });
    const lawyers = await User.find({ 
      _id: { $in: uniqueLawyerIds },
      role: { $in: ['Lawyer', 'Admin'] }
    });

    const clientMap = new Map(clients.map(c => [c._id.toString(), c]));
    const lawyerMap = new Map(lawyers.map(l => [l._id.toString(), l]));

    // Process each case
    for (let i = 0; i < cases.length; i++) {
      const caseData = cases[i];
      
      try {
        // Verify client exists
        const client = clientMap.get(caseData.clientId);
        if (!client) {
          results.failed.push({
            index: i,
            title: caseData.title || 'Unknown',
            error: 'Client not found'
          });
          continue;
        }

        // Verify lawyer exists and is valid
        const lawyer = lawyerMap.get(caseData.assignedLawyerId);
        if (!lawyer) {
          results.failed.push({
            index: i,
            title: caseData.title || 'Unknown',
            error: 'Invalid assigned lawyer'
          });
          continue;
        }

        // If not Admin, can only assign to self
        if (req.user.role !== 'Admin' && caseData.assignedLawyerId !== req.user._id.toString()) {
          results.failed.push({
            index: i,
            title: caseData.title || 'Unknown',
            error: 'You can only assign cases to yourself'
          });
          continue;
        }

        // Convert customFields to plain object if needed
        let customFieldsObj = {};
        if (caseData.customFields) {
          if (caseData.customFields instanceof Map) {
            customFieldsObj = Object.fromEntries(caseData.customFields);
          } else if (typeof caseData.customFields === 'object' && caseData.customFields !== null) {
            customFieldsObj = caseData.customFields;
          }
        }

        const caseItem = new Case({
          title: caseData.title,
          description: caseData.description,
          priority: caseData.priority,
          caseType: caseData.caseType,
          clientId: caseData.clientId,
          assignedLawyerId: caseData.assignedLawyerId,
          courtName: caseData.courtName,
          filingDate: caseData.filingDate,
          nextHearingDate: caseData.nextHearingDate || undefined,
          customFields: customFieldsObj,
          createdBy: req.user._id
        });

        // Add initial timeline event
        caseItem.timeline.push({
          date: new Date(),
          title: 'Case Created',
          description: `Case "${caseData.title}" was created`,
          type: 'filing',
          createdBy: req.user._id
        });

        await caseItem.save();
        await caseItem.populate('clientId', 'name email');
        await caseItem.populate('assignedLawyerId', 'firstName lastName email');

        const formattedCase = formatCaseResponse(caseItem);
        results.success.push({
          index: i,
          id: formattedCase.id,
          caseNumber: formattedCase.caseNumber,
          title: formattedCase.title
        });
      } catch (error) {
        console.error(`Error creating case ${i}:`, error);
        results.failed.push({
          index: i,
          title: caseData.title || 'Unknown',
          error: error.message || 'Failed to create case'
        });
      }
    }

    const response = {
      success: results.success.length > 0,
      total: results.total,
      created: results.success.length,
      failed: results.failed.length,
      results: {
        successful: results.success,
        failed: results.failed
      }
    };

    // Return 201 if all succeeded, 207 (Multi-Status) if partial success, 400 if all failed
    const statusCode = results.failed.length === 0 ? 201 : 
                       results.success.length > 0 ? 207 : 400;

    res.status(statusCode).json(response);
  } catch (error) {
    console.error('Bulk create cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/cases/:id
// @desc    Update case
// @access  Private (Admin, Lawyer - assigned lawyer only)
router.put('/:id', authorize('Admin', 'Lawyer'), [
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim().notEmpty(),
  body('status').optional().isIn(['Open', 'InProgress', 'Closed', 'OnHold']),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent'])
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

    const caseItem = await Case.findById(req.params.id);
    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    // Check access
    if (req.user.role !== 'Admin' && caseItem.assignedLawyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add timeline event if status changed
    if (req.body.status && req.body.status !== caseItem.status) {
      caseItem.timeline.push({
        date: new Date(),
        title: 'Status Changed',
        description: `Case status changed from ${caseItem.status} to ${req.body.status}`,
        type: 'status_change',
        createdBy: req.user._id
      });
    }

    // Handle customFields conversion if present
    if (req.body.customFields) {
      if (req.body.customFields instanceof Map) {
        req.body.customFields = Object.fromEntries(req.body.customFields);
      }
    }

    Object.assign(caseItem, req.body);
    await caseItem.save();
    await caseItem.populate('clientId', 'name email');
    await caseItem.populate('assignedLawyerId', 'firstName lastName email');

    res.json({
      success: true,
      data: formatCaseResponse(caseItem)
    });
  } catch (error) {
    console.error('Update case error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PATCH /api/cases/:id/status
// @desc    Update case status
// @access  Private (Admin, Lawyer)
router.patch('/:id/status', authorize('Admin', 'Lawyer'), [
  body('status').isIn(['Open', 'InProgress', 'Closed', 'OnHold'])
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

    const caseItem = await Case.findById(req.params.id);
    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    // Check access
    if (req.user.role !== 'Admin' && caseItem.assignedLawyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const oldStatus = caseItem.status;
    caseItem.status = req.body.status;

    // Add timeline event
    caseItem.timeline.push({
      date: new Date(),
      title: 'Status Changed',
      description: `Case status changed from ${oldStatus} to ${req.body.status}`,
      type: 'status_change',
      createdBy: req.user._id
    });

    await caseItem.save();
    await caseItem.populate('clientId', 'name email');
    await caseItem.populate('assignedLawyerId', 'firstName lastName email');

    res.json({
      success: true,
      data: formatCaseResponse(caseItem)
    });
  } catch (error) {
    console.error('Update case status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/cases/:id
// @desc    Delete case
// @access  Private (Admin only)
router.delete('/:id', authorize('Admin'), async (req, res) => {
  try {
    const caseItem = await Case.findByIdAndDelete(req.params.id);
    if (!caseItem) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    res.json({
      success: true,
      message: 'Case deleted successfully'
    });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;

