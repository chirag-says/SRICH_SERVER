const mongoose = require('mongoose');

// Enum values for Patient Age Groups
const PATIENT_AGE_GROUPS = [
    '<2y',
    '2.1-5y',
    '5.1-16y',
    '16.1-40y',
    '40.1-60y',
    '>60y'
];

// Enum values for Test Types in Audiology
const TEST_TYPES = [
    'PTA',           // Pure Tone Audiometry
    'ABR',           // Auditory Brainstem Response
    'OAE',           // Otoacoustic Emissions
    'Immittance',    // Immittance Audiometry (Tympanometry)
    'BERA',          // Brainstem Evoked Response Audiometry
    'ASSR',          // Auditory Steady-State Response
    'Speech',        // Speech Audiometry
    'BOA',           // Behavioral Observation Audiometry
    'VRA',           // Visual Reinforcement Audiometry
    'CondPlay',      // Conditioned Play Audiometry
    'CPA',           // Conditioned Play Audiometry
    'HA_Trial',      // Hearing Aid Trial
    'HA_Fitting',    // Hearing Aid Fitting
    'CI_Mapping',    // Cochlear Implant Mapping
    'Counseling',    // Patient/Family Counseling
    'Other'          // Other tests
];

// Enum values for Hearing Loss Type
const HEARING_LOSS_TYPES = [
    'Normal',
    'Conductive',
    'Sensorineural',
    'Mixed',
    'Auditory Neuropathy',
    'Central Auditory Processing Disorder',
    'Unknown'
];

// Enum values for Hearing Loss Degree
const HEARING_LOSS_DEGREES = [
    'Normal (-10 to 25 dB)',
    'Mild (26 to 40 dB)',
    'Moderate (41 to 55 dB)',
    'Moderately Severe (56 to 70 dB)',
    'Severe (71 to 90 dB)',
    'Profound (>90 dB)'
];

const ClinicalCaseSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Student ID is required']
    },
    caseNumber: {
        type: String,
        unique: true
    },
    patientInfo: {
        initials: {
            type: String,
            required: [true, 'Patient initials are required'],
            maxlength: [5, 'Initials cannot exceed 5 characters']
        },
        ageGroup: {
            type: String,
            enum: {
                values: PATIENT_AGE_GROUPS,
                message: 'Invalid patient age group'
            },
            required: [true, 'Patient age group is required']
        },
        gender: {
            type: String,
            enum: ['Male', 'Female', 'Other'],
            required: true
        },
        referralSource: {
            type: String,
            trim: true
        }
    },
    testsPerformed: [{
        testType: {
            type: String,
            enum: {
                values: TEST_TYPES,
                message: 'Invalid test type'
            },
            required: true
        },
        completed: {
            type: Boolean,
            default: false
        },
        duration: {
            type: Number, // Duration in minutes
            min: [0, 'Duration cannot be negative']
        },
        notes: String
    }],
    audiogramData: {
        rightEar: {
            airConduction: {
                // Frequency in Hz as key, threshold in dB HL as value
                125: { type: Number, min: -10, max: 120 },
                250: { type: Number, min: -10, max: 120 },
                500: { type: Number, min: -10, max: 120 },
                1000: { type: Number, min: -10, max: 120 },
                2000: { type: Number, min: -10, max: 120 },
                4000: { type: Number, min: -10, max: 120 },
                8000: { type: Number, min: -10, max: 120 }
            },
            boneConduction: {
                250: { type: Number, min: -10, max: 120 },
                500: { type: Number, min: -10, max: 120 },
                1000: { type: Number, min: -10, max: 120 },
                2000: { type: Number, min: -10, max: 120 },
                4000: { type: Number, min: -10, max: 120 }
            },
            masking: {
                type: Boolean,
                default: false
            }
        },
        leftEar: {
            airConduction: {
                125: { type: Number, min: -10, max: 120 },
                250: { type: Number, min: -10, max: 120 },
                500: { type: Number, min: -10, max: 120 },
                1000: { type: Number, min: -10, max: 120 },
                2000: { type: Number, min: -10, max: 120 },
                4000: { type: Number, min: -10, max: 120 },
                8000: { type: Number, min: -10, max: 120 }
            },
            boneConduction: {
                250: { type: Number, min: -10, max: 120 },
                500: { type: Number, min: -10, max: 120 },
                1000: { type: Number, min: -10, max: 120 },
                2000: { type: Number, min: -10, max: 120 },
                4000: { type: Number, min: -10, max: 120 }
            },
            masking: {
                type: Boolean,
                default: false
            }
        }
    },
    findings: {
        hearingLossType: {
            rightEar: {
                type: String,
                enum: HEARING_LOSS_TYPES
            },
            leftEar: {
                type: String,
                enum: HEARING_LOSS_TYPES
            }
        },
        hearingLossDegree: {
            rightEar: {
                type: String,
                enum: HEARING_LOSS_DEGREES
            },
            leftEar: {
                type: String,
                enum: HEARING_LOSS_DEGREES
            }
        },
        additionalFindings: {
            type: String,
            maxlength: [2000, 'Additional findings cannot exceed 2000 characters']
        }
    },
    recommendations: {
        type: String,
        maxlength: [2000, 'Recommendations cannot exceed 2000 characters']
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    supervisorApproval: {
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', 'Revision Required'],
            default: 'Pending'
        },
        reviewedAt: Date,
        comments: String
    },
    sessionDate: {
        type: Date,
        required: [true, 'Session date is required'],
        default: Date.now
    },
    sessionDuration: {
        type: Number, // Total session duration in minutes
        min: [0, 'Session duration cannot be negative']
    },
    isCompleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for total tests count
ClinicalCaseSchema.virtual('totalTestsCount').get(function () {
    return this.testsPerformed ? this.testsPerformed.length : 0;
});

// Virtual for completed tests count
ClinicalCaseSchema.virtual('completedTestsCount').get(function () {
    if (!this.testsPerformed) return 0;
    return this.testsPerformed.filter(test => test.completed).length;
});

// Pre-save middleware to generate case number
ClinicalCaseSchema.pre('save', async function (next) {
    if (!this.caseNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await this.constructor.countDocuments({
            createdAt: {
                $gte: new Date(date.getFullYear(), date.getMonth(), 1),
                $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
            }
        });
        this.caseNumber = `SRISH-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

// Indexes for efficient querying
ClinicalCaseSchema.index({ student: 1, sessionDate: -1 });
ClinicalCaseSchema.index({ 'patientInfo.ageGroup': 1 });
ClinicalCaseSchema.index({ 'testsPerformed.testType': 1 });
ClinicalCaseSchema.index({ supervisor: 1, 'supervisorApproval.status': 1 });
ClinicalCaseSchema.index({ sessionDate: -1 });

// Static method to get test type enums
ClinicalCaseSchema.statics.getTestTypes = function () {
    return TEST_TYPES;
};

// Static method to get age group enums
ClinicalCaseSchema.statics.getAgeGroups = function () {
    return PATIENT_AGE_GROUPS;
};

module.exports = mongoose.model('ClinicalCase', ClinicalCaseSchema);
