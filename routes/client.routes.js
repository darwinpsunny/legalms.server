const express = require('express');
const { body, validationResult } = require('express-validator');
const Client = require('../models/Client.model');
const User = require('../models/User.model');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Helper function to format client response consistently
function formatClientResponse(client) {
  if (!client) return null;
  
  return {
    id: client._id ? client._id.toString() : client.id || '',
    name: client.name || '',
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    companyName: client.companyName || undefined,
    createdDate: client.createdAt || client.createdDate || new Date(),
    assignedLawyerId: client.assignedLawyerId 
      ? (typeof client.assignedLawyerId === 'object' && client.assignedLawyerId._id 
          ? client.assignedLawyerId._id.toString() 
          : client.assignedLawyerId.toString())
      : null,
    assignedLawyerName: (client.assignedLawyerId && typeof client.assignedLawyerId === 'object' && client.assignedLawyerId.firstName && client.assignedLawyerId.lastName)
      ? `${client.assignedLawyerId.firstName} ${client.assignedLawyerId.lastName}`
      : undefined
  };
}

// @route   GET /api/clients
// @desc    Get all clients
// @access  Private (Admin, Lawyer)
router.get('/', authorize('Admin', 'Lawyer'), async (req, res) => {
  try {
    const { assignedLawyerId } = req.query;
    const filter = {};
    
    // If not Admin, show clients assigned to the lawyer or clients with no assigned lawyer
    if (req.user.role !== 'Admin' && !assignedLawyerId) {
      filter.$or = [
        { assignedLawyerId: req.user._id },
        { assignedLawyerId: null }
      ];
    } else if (assignedLawyerId) {
      filter.assignedLawyerId = assignedLawyerId;
    }

    const clients = await Client.find(filter)
      .populate('assignedLawyerId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    // Format response to match frontend model
    const formattedClients = clients.map(client => formatClientResponse(client));

    res.json({
      success: true,
      data: formattedClients
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/clients/:id
// @desc    Get client by ID
// @access  Private (Admin, Lawyer)
router.get('/:id', authorize('Admin', 'Lawyer'), async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate('assignedLawyerId', 'firstName lastName email');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check if user has access (Admin or assigned lawyer, or client has no assigned lawyer)
    if (req.user.role !== 'Admin' && client.assignedLawyerId && client.assignedLawyerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: formatClientResponse(client)
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/clients
// @desc    Create new client
// @access  Private (Admin, Lawyer)
router.post('/', authorize('Admin', 'Lawyer'), [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').trim().notEmpty(),
  body('address').trim().notEmpty()
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

    const { name, email, phone, address, companyName, assignedLawyerId } = req.body;

    // If assignedLawyerId is provided and not empty, verify it exists and is a Lawyer
    const lawyerId = assignedLawyerId && assignedLawyerId.trim() !== '' ? assignedLawyerId : null;
    if (lawyerId) {
      const lawyer = await User.findById(lawyerId);
      if (!lawyer || (lawyer.role !== 'Lawyer' && lawyer.role !== 'Admin')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned lawyer' + lawyerId
        });
      }

      // If not Admin, can only assign to self
      if (req.user.role !== 'Admin' && lawyerId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only assign clients to yourself'
        });
      }
    }

    const client = new Client({
      name,
      email: email.toLowerCase(),
      phone,
      address,
      companyName,
      assignedLawyerId: lawyerId,
      createdBy: req.user._id
    });

    await client.save();
    if (client.assignedLawyerId) {
      await client.populate('assignedLawyerId', 'firstName lastName email');
    }

    res.status(201).json({
      success: true,
      data: {
        id: client._id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        companyName: client.companyName,
        createdDate: client.createdAt,
        assignedLawyerId: client.assignedLawyerId ? client.assignedLawyerId._id : null,
        assignedLawyerName: client.assignedLawyerId ? 
          `${client.assignedLawyerId.firstName} ${client.assignedLawyerId.lastName}` : undefined
      }
    });
  } catch (error) {
    console.error('Create client error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Client with this email already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/clients/:id
// @desc    Update client
// @access  Private (Admin, Lawyer - assigned lawyer only)
router.put('/:id', authorize('Admin', 'Lawyer'), [
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').optional().trim().notEmpty(),
  body('address').optional().trim().notEmpty()
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

    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Check access (Admin or assigned lawyer, or client has no assigned lawyer)
    if (req.user.role !== 'Admin' && client.assignedLawyerId && client.assignedLawyerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update assigned lawyer if provided
    if (req.body.assignedLawyerId) {
      const lawyer = await User.findById(req.body.assignedLawyerId);
      if (!lawyer || (lawyer.role !== 'Lawyer' && lawyer.role !== 'Admin')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned lawyer'
        });
      }
      // Only Admin can reassign
      if (req.user.role !== 'Admin') {
        delete req.body.assignedLawyerId;
      }
    } else if (req.body.assignedLawyerId === null || req.body.assignedLawyerId === '') {
      // Allow setting to null/empty (only Admin)
      if (req.user.role !== 'Admin') {
        delete req.body.assignedLawyerId;
      }
    }

    Object.assign(client, req.body);
    await client.save();
    if (client.assignedLawyerId) {
      await client.populate('assignedLawyerId', 'firstName lastName email');
    }

    res.json({
      success: true,
      data: formatClientResponse(client)
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/clients/:id
// @desc    Delete client
// @access  Private (Admin only)
router.delete('/:id', authorize('Admin'), async (req, res) => {
  try {
    const client = await Client.findByIdAndDelete(req.params.id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;

