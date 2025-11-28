const mongoose = require('mongoose');

const caseDocumentSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const caseTimelineEventSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['filing', 'hearing', 'document', 'status_change', 'note'],
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const caseSchema = new mongoose.Schema({
  caseNumber: {
    type: String,
    required: false,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'InProgress', 'Closed', 'OnHold'],
    default: 'Open',
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
    required: true
  },
  caseType: {
    type: String,
    enum: ['Civil', 'Criminal', 'Corporate', 'Family', 'Property', 'Labor', 'Tax', 
           'PersonalInjury', 'Immigration', 'Bankruptcy', 'ChequeDefault', 'Other'],
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  assignedLawyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courtName: {
    type: String,
    required: true,
    trim: true
  },
  filingDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  nextHearingDate: {
    type: Date
  },
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  documents: [caseDocumentSchema],
  timeline: [caseTimelineEventSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
// Note: caseNumber index is already created by unique: true in field definition
caseSchema.index({ clientId: 1 });
caseSchema.index({ assignedLawyerId: 1 });
caseSchema.index({ status: 1 });
caseSchema.index({ caseType: 1 });

// Generate case number before saving
caseSchema.pre('save', async function(next) {
  // Only generate case number for new documents or if not set
  if (this.isNew && !this.caseNumber) {
    try {
      const year = new Date().getFullYear();
      const CaseModel = this.constructor;
      const count = await CaseModel.countDocuments({ 
        caseNumber: new RegExp(`^CASE-${year}-`) 
      });
      this.caseNumber = `CASE-${year}-${String(count + 1).padStart(4, '0')}`;
    } catch (error) {
      // Fallback if count fails - use timestamp for uniqueness
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-4);
      this.caseNumber = `CASE-${year}-${timestamp}`;
    }
  }
  next();
});

module.exports = mongoose.model('Case', caseSchema);

