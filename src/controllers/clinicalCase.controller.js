const ClinicalCase = require('../models/ClinicalCase.model');
const User = require('../models/User.model');
const mongoose = require('mongoose');

// @desc    Create a new clinical case
// @route   POST /api/clinical-cases
// @access  Private (Student)
exports.createCase = async (req, res) => {
    try {
        req.body.student = req.user.id;

        // If student has a supervisor, auto-assign
        if (req.user.supervisor) {
            req.body.supervisor = req.user.supervisor;
        }

        const clinicalCase = await ClinicalCase.create(req.body);

        res.status(201).json({
            success: true,
            data: clinicalCase
        });
    } catch (error) {
        console.error('Create case error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating clinical case',
            error: error.message
        });
    }
};

// @desc    Get all clinical cases for a student
// @route   GET /api/clinical-cases
// @access  Private
exports.getCases = async (req, res) => {
    try {
        let query;

        // Students can only see their own cases
        if (req.user.role === 'Student') {
            query = ClinicalCase.find({ student: req.user.id });
        } else {
            // Supervisors/Admins can see all cases
            query = ClinicalCase.find();
        }

        // Apply filters
        if (req.query.ageGroup) {
            query = query.where('patientInfo.ageGroup').equals(req.query.ageGroup);
        }

        if (req.query.testType) {
            query = query.where('testsPerformed.testType').equals(req.query.testType);
        }

        if (req.query.status) {
            query = query.where('supervisorApproval.status').equals(req.query.status);
        }

        // Date range filter
        if (req.query.startDate && req.query.endDate) {
            query = query.where('sessionDate').gte(new Date(req.query.startDate)).lte(new Date(req.query.endDate));
        }

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        query = query.skip(skip).limit(limit)
            .populate('student', 'name email batch semester')
            .populate('supervisor', 'name email')
            .sort({ sessionDate: -1 });

        const cases = await query;
        const total = await ClinicalCase.countDocuments(query.getFilter());

        res.status(200).json({
            success: true,
            count: cases.length,
            total,
            page,
            pages: Math.ceil(total / limit),
            data: cases
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching clinical cases',
            error: error.message
        });
    }
};

// @desc    Get single clinical case
// @route   GET /api/clinical-cases/:id
// @access  Private
exports.getCase = async (req, res) => {
    try {
        const clinicalCase = await ClinicalCase.findById(req.params.id)
            .populate('student', 'name email batch semester')
            .populate('supervisor', 'name email');

        if (!clinicalCase) {
            return res.status(404).json({
                success: false,
                message: 'Clinical case not found'
            });
        }

        // Check authorization
        if (req.user.role === 'Student' && clinicalCase.student._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this case'
            });
        }

        res.status(200).json({
            success: true,
            data: clinicalCase
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching clinical case',
            error: error.message
        });
    }
};

// @desc    Update clinical case
// @route   PUT /api/clinical-cases/:id
// @access  Private
exports.updateCase = async (req, res) => {
    try {
        let clinicalCase = await ClinicalCase.findById(req.params.id);

        if (!clinicalCase) {
            return res.status(404).json({
                success: false,
                message: 'Clinical case not found'
            });
        }

        // Check authorization
        if (req.user.role === 'Student' && clinicalCase.student.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this case'
            });
        }

        // Don't allow students to update approved cases
        if (req.user.role === 'Student' && clinicalCase.supervisorApproval.status === 'Approved') {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify an approved case'
            });
        }

        clinicalCase = await ClinicalCase.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: clinicalCase
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating clinical case',
            error: error.message
        });
    }
};

// @desc    Delete clinical case
// @route   DELETE /api/clinical-cases/:id
// @access  Private (Admin only)
exports.deleteCase = async (req, res) => {
    try {
        const clinicalCase = await ClinicalCase.findById(req.params.id);

        if (!clinicalCase) {
            return res.status(404).json({
                success: false,
                message: 'Clinical case not found'
            });
        }

        await clinicalCase.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Clinical case deleted',
            data: {}
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting clinical case',
            error: error.message
        });
    }
};

// @desc    Supervisor approval/rejection
// @route   PUT /api/clinical-cases/:id/review
// @access  Private (Supervisor, Admin)
exports.reviewCase = async (req, res) => {
    try {
        const { status, comments } = req.body;

        if (!['Approved', 'Rejected', 'Revision Required'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be Approved, Rejected, or Revision Required'
            });
        }

        const clinicalCase = await ClinicalCase.findByIdAndUpdate(
            req.params.id,
            {
                'supervisorApproval.status': status,
                'supervisorApproval.reviewedAt': new Date(),
                'supervisorApproval.comments': comments,
                supervisor: req.user.id,
                isCompleted: status === 'Approved'
            },
            { new: true, runValidators: true }
        ).populate('student', 'name email');

        if (!clinicalCase) {
            return res.status(404).json({
                success: false,
                message: 'Clinical case not found'
            });
        }

        res.status(200).json({
            success: true,
            data: clinicalCase
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error reviewing clinical case',
            error: error.message
        });
    }
};

// @desc    Get test types and age groups enums
// @route   GET /api/clinical-cases/enums
// @access  Private
exports.getEnums = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                testTypes: ClinicalCase.getTestTypes(),
                ageGroups: ClinicalCase.getAgeGroups()
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching enums',
            error: error.message
        });
    }
};
