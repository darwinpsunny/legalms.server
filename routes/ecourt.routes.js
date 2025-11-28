const express = require('express');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(authorize('Admin', 'Lawyer'));

// @route   GET /api/ecourt
// @desc    Get eCourt information (placeholder)
// @access  Private (Admin, Lawyer)
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'eCourt API endpoint',
    data: []
  });
});

module.exports = router;




