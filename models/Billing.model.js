const mongoose = require('mongoose');

const timeEntrySchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  lawyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  hours: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  hourlyRate: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

// Calculate amount before saving
timeEntrySchema.pre('save', function(next) {
  if (this.isModified('hours') || this.isModified('hourlyRate')) {
    this.amount = this.hours * this.hourlyRate;
  }
  next();
});

const invoiceItemSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  description: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  timeEntryIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimeEntry'
  }]
}, {
  timestamps: true
});

// Calculate amount before saving
invoiceItemSchema.pre('save', function(next) {
  if (this.isModified('quantity') || this.isModified('rate')) {
    this.amount = this.quantity * this.rate;
  }
  next();
});

const invoiceSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  invoiceNumber: {
    type: String,
    unique: true,
    required: true
  },
  issueDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'],
    default: 'Draft',
    required: true
  },
  items: [invoiceItemSchema],
  caseIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Calculate total amount before saving
invoiceSchema.pre('save', function(next) {
  if (this.isModified('items')) {
    this.totalAmount = this.items.reduce((sum, item) => sum + item.amount, 0);
  }
  next();
});

// Generate invoice number before saving
invoiceSchema.pre('save', async function(next) {
  if (!this.invoiceNumber) {
    try {
      const year = new Date().getFullYear();
      const InvoiceModel = this.constructor;
      const count = await InvoiceModel.countDocuments({ 
        invoiceNumber: new RegExp(`^INV-${year}-`) 
      });
      this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;
    } catch (error) {
      // Fallback if model not yet registered
      const year = new Date().getFullYear();
      this.invoiceNumber = `INV-${year}-0001`;
    }
  }
  next();
});

module.exports = {
  TimeEntry: mongoose.model('TimeEntry', timeEntrySchema),
  Invoice: mongoose.model('Invoice', invoiceSchema)
};

