const express = require('express');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/case-types
// @desc    Get all case types configuration
// @access  Private
router.get('/', (req, res) => {
  // Return case type configurations
  const caseTypes = [
    { type: 'Civil', name: 'Civil', description: 'Civil law cases', icon: 'gavel', color: '#667eea' },
    { type: 'Criminal', name: 'Criminal', description: 'Criminal law cases', icon: 'security', color: '#dc3545' },
    { type: 'Corporate', name: 'Corporate', description: 'Corporate law cases', icon: 'business', color: '#28a745' },
    { type: 'Family', name: 'Family', description: 'Family law cases', icon: 'family_restroom', color: '#ffc107' },
    { type: 'Property', name: 'Property', description: 'Property law cases', icon: 'home', color: '#17a2b8' },
    { type: 'Labor', name: 'Labor', description: 'Labor law cases', icon: 'work', color: '#6f42c1' },
    { type: 'Tax', name: 'Tax', description: 'Tax law cases', icon: 'receipt', color: '#fd7e14' },
    { type: 'PersonalInjury', name: 'Personal Injury', description: 'Personal injury cases', icon: 'healing', color: '#e83e8c' },
    { type: 'Immigration', name: 'Immigration', description: 'Immigration law cases', icon: 'flight', color: '#20c997' },
    { type: 'Bankruptcy', name: 'Bankruptcy', description: 'Bankruptcy cases', icon: 'account_balance_wallet', color: '#6c757d' },
    { type: 'ChequeDefault', name: 'Cheque Default', description: 'Cheque default cases', icon: 'payment', color: '#dc3545' },
    { type: 'Other', name: 'Other', description: 'Other types of cases', icon: 'more_horiz', color: '#adb5bd' }
  ];

  res.json({
    success: true,
    data: caseTypes
  });
});

module.exports = router;




