const User = require('../models/User.model');
const ClinicalCase = require('../models/ClinicalCase.model');
const Attendance = require('../models/Attendance.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const mongoose = require('mongoose');

// @desc    Get professor dashboard overview
// @route   GET /api/professor/dashboard
// @access  Private (Supervisor, Admin)
exports.getProfessorDashboard = async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const todayEnd = new Date(now.setHours(23, 59, 59, 999));

        // Get all students count
        const totalStudents = await User.countDocuments({ role: 'Student', isActive: true });

        // Get students by batch
        const studentsByBatch = await User.aggregate([
            { $match: { role: 'Student', isActive: true } },
            { $group: { _id: '$batch', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);

        // Get students by semester
        const studentsBySemester = await User.aggregate([
            { $match: { role: 'Student', isActive: true } },
            { $group: { _id: '$semester', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        // Clinical cases overview
        const casesOverview = await ClinicalCase.aggregate([
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    pending: [
                        { $match: { 'supervisorApproval.status': 'Pending' } },
                        { $count: 'count' }
                    ],
                    approved: [
                        { $match: { 'supervisorApproval.status': 'Approved' } },
                        { $count: 'count' }
                    ],
                    rejected: [
                        { $match: { 'supervisorApproval.status': 'Rejected' } },
                        { $count: 'count' }
                    ],
                    thisMonth: [
                        { $match: { sessionDate: { $gte: monthStart, $lte: monthEnd } } },
                        { $count: 'count' }
                    ],
                    today: [
                        { $match: { createdAt: { $gte: todayStart, $lte: todayEnd } } },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        // Leave requests overview
        const leaveOverview = await LeaveRequest.aggregate([
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    pending: [
                        { $match: { status: 'Pending' } },
                        { $count: 'count' }
                    ],
                    approved: [
                        { $match: { status: 'Approved' } },
                        { $count: 'count' }
                    ],
                    rejected: [
                        { $match: { status: 'Rejected' } },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        // Top performing students (by completed hours percentage)
        const topStudents = await User.find({
            role: 'Student',
            isActive: true
        })
            .select('name email batch semester completedHours totalAllottedHours')
            .sort({ completedHours: -1 })
            .limit(5);

        // Recent pending clinical cases
        const recentPendingCases = await ClinicalCase.find({
            'supervisorApproval.status': 'Pending'
        })
            .populate('student', 'name email batch semester')
            .select('patientInfo.initials patientInfo.ageGroup sessionDate testsPerformed createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        // Recent pending leave requests
        const recentPendingLeaves = await LeaveRequest.find({
            status: 'Pending'
        })
            .populate('student', 'name email batch semester')
            .select('leaveType startDate endDate reason createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        // Average hours completion across all students
        const avgCompletion = await User.aggregate([
            { $match: { role: 'Student', isActive: true, totalAllottedHours: { $gt: 0 } } },
            {
                $group: {
                    _id: null,
                    avgPercentage: {
                        $avg: {
                            $multiply: [
                                { $divide: ['$completedHours', '$totalAllottedHours'] },
                                100
                            ]
                        }
                    },
                    totalCompletedHours: { $sum: '$completedHours' },
                    totalAllottedHours: { $sum: '$totalAllottedHours' }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                students: {
                    total: totalStudents,
                    byBatch: studentsByBatch,
                    bySemester: studentsBySemester
                },
                clinicalCases: {
                    total: casesOverview[0]?.total[0]?.count || 0,
                    pending: casesOverview[0]?.pending[0]?.count || 0,
                    approved: casesOverview[0]?.approved[0]?.count || 0,
                    rejected: casesOverview[0]?.rejected[0]?.count || 0,
                    thisMonth: casesOverview[0]?.thisMonth[0]?.count || 0,
                    today: casesOverview[0]?.today[0]?.count || 0
                },
                leaveRequests: {
                    total: leaveOverview[0]?.total[0]?.count || 0,
                    pending: leaveOverview[0]?.pending[0]?.count || 0,
                    approved: leaveOverview[0]?.approved[0]?.count || 0,
                    rejected: leaveOverview[0]?.rejected[0]?.count || 0
                },
                topStudents,
                recentPendingCases,
                recentPendingLeaves,
                averageProgress: {
                    percentage: Math.round(avgCompletion[0]?.avgPercentage || 0),
                    totalCompletedHours: avgCompletion[0]?.totalCompletedHours || 0,
                    totalAllottedHours: avgCompletion[0]?.totalAllottedHours || 0
                }
            }
        });
    } catch (error) {
        console.error('Professor dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching professor dashboard',
            error: error.message
        });
    }
};

// @desc    Get all students with detailed info
// @route   GET /api/professor/students
// @access  Private (Supervisor, Admin)
exports.getAllStudents = async (req, res) => {
    try {
        const { batch, semester, search, sortBy, sortOrder, page = 1, limit = 20 } = req.query;

        let query = { role: 'Student', isActive: true };

        // Apply filters
        if (batch) query.batch = batch;
        if (semester) query.semester = parseInt(semester);
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { registrationNumber: { $regex: search, $options: 'i' } }
            ];
        }

        // Sorting
        let sortOptions = { name: 1 };
        if (sortBy) {
            sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const students = await User.find(query)
            .select('-password')
            .populate('supervisor', 'name email')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        // Get clinical case counts for each student
        const studentIds = students.map(s => s._id);

        const caseCounts = await ClinicalCase.aggregate([
            { $match: { student: { $in: studentIds } } },
            {
                $group: {
                    _id: '$student',
                    totalCases: { $sum: 1 },
                    approvedCases: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Approved'] }, 1, 0] }
                    },
                    pendingCases: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Pending'] }, 1, 0] }
                    }
                }
            }
        ]);

        const caseCountMap = caseCounts.reduce((acc, item) => {
            acc[item._id.toString()] = item;
            return acc;
        }, {});

        // Enrich student data with case counts
        const enrichedStudents = students.map(student => {
            const studentObj = student.toObject();
            const cases = caseCountMap[student._id.toString()] || { totalCases: 0, approvedCases: 0, pendingCases: 0 };
            return {
                ...studentObj,
                clinicalCases: cases
            };
        });

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            count: students.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: enrichedStudents
        });
    } catch (error) {
        console.error('Get all students error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching students',
            error: error.message
        });
    }
};

// @desc    Get single student details with all related data
// @route   GET /api/professor/students/:id
// @access  Private (Supervisor, Admin)
exports.getStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { casesLimit = 10, attendanceLimit = 30 } = req.query;

        const student = await User.findById(id)
            .select('-password')
            .populate('supervisor', 'name email');

        if (!student || student.role !== 'Student') {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Get clinical cases
        const clinicalCases = await ClinicalCase.find({ student: id })
            .sort({ sessionDate: -1 })
            .limit(parseInt(casesLimit));

        // Get clinical case statistics
        const caseStats = await ClinicalCase.aggregate([
            { $match: { student: new mongoose.Types.ObjectId(id) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Approved'] }, 1, 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Pending'] }, 1, 0] }
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Rejected'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get recent attendance
        const attendance = await Attendance.find({ student: id })
            .sort({ date: -1 })
            .limit(parseInt(attendanceLimit));

        // Get current month attendance summary
        const now = new Date();
        const attendanceSummary = await Attendance.getMonthlySummary(
            id,
            now.getFullYear(),
            now.getMonth() + 1
        );

        // Get leave requests
        const leaveRequests = await LeaveRequest.find({ student: id })
            .sort({ createdAt: -1 })
            .limit(10);

        // Get leave statistics
        const leaveStats = await LeaveRequest.aggregate([
            { $match: { student: new mongoose.Types.ObjectId(id) } },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$status', 'Pending'] }, 1, 0] }
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Test type distribution
        const testDistribution = await ClinicalCase.aggregate([
            { $match: { student: new mongoose.Types.ObjectId(id) } },
            { $unwind: '$testsPerformed' },
            {
                $group: {
                    _id: '$testsPerformed.testType',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                student,
                clinicalCases: {
                    recent: clinicalCases,
                    stats: caseStats[0] || { total: 0, approved: 0, pending: 0, rejected: 0 }
                },
                attendance: {
                    recent: attendance,
                    summary: attendanceSummary
                },
                leaveRequests: {
                    recent: leaveRequests,
                    stats: leaveStats[0] || { total: 0, approved: 0, pending: 0, rejected: 0 }
                },
                testDistribution
            }
        });
    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching student details',
            error: error.message
        });
    }
};

// @desc    Get pending items for review
// @route   GET /api/professor/pending
// @access  Private (Supervisor, Admin)
exports.getPendingItems = async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let response = {};

        if (!type || type === 'cases') {
            const pendingCases = await ClinicalCase.find({
                'supervisorApproval.status': 'Pending'
            })
                .populate('student', 'name email batch semester registrationNumber')
                .sort({ createdAt: -1 })
                .skip(type === 'cases' ? skip : 0)
                .limit(type === 'cases' ? parseInt(limit) : 10);

            const totalPendingCases = await ClinicalCase.countDocuments({
                'supervisorApproval.status': 'Pending'
            });

            response.cases = {
                items: pendingCases,
                total: totalPendingCases,
                page: parseInt(page),
                pages: Math.ceil(totalPendingCases / parseInt(limit))
            };
        }

        if (!type || type === 'leaves') {
            const pendingLeaves = await LeaveRequest.find({
                status: 'Pending'
            })
                .populate('student', 'name email batch semester registrationNumber')
                .sort({ createdAt: -1 })
                .skip(type === 'leaves' ? skip : 0)
                .limit(type === 'leaves' ? parseInt(limit) : 10);

            const totalPendingLeaves = await LeaveRequest.countDocuments({
                status: 'Pending'
            });

            response.leaves = {
                items: pendingLeaves,
                total: totalPendingLeaves,
                page: parseInt(page),
                pages: Math.ceil(totalPendingLeaves / parseInt(limit))
            };
        }

        res.status(200).json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('Get pending items error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching pending items',
            error: error.message
        });
    }
};

// @desc    Approve/Reject clinical case
// @route   PUT /api/professor/cases/:id/review
// @access  Private (Supervisor, Admin)
exports.reviewClinicalCase = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either Approved or Rejected'
            });
        }

        const clinicalCase = await ClinicalCase.findByIdAndUpdate(
            id,
            {
                'supervisorApproval.status': status,
                'supervisorApproval.reviewedAt': new Date(),
                'supervisorApproval.comments': remarks || '',
                supervisor: req.user._id
            },
            { new: true }
        ).populate('student', 'name email batch semester');

        if (!clinicalCase) {
            return res.status(404).json({
                success: false,
                message: 'Clinical case not found'
            });
        }

        res.status(200).json({
            success: true,
            message: `Clinical case ${status.toLowerCase()} successfully`,
            data: clinicalCase
        });
    } catch (error) {
        console.error('Review clinical case error:', error);
        res.status(500).json({
            success: false,
            message: 'Error reviewing clinical case',
            error: error.message
        });
    }
};

// @desc    Bulk approve/reject clinical cases
// @route   PUT /api/professor/cases/bulk-review
// @access  Private (Supervisor, Admin)
exports.bulkReviewCases = async (req, res) => {
    try {
        const { caseIds, status, remarks } = req.body;

        if (!Array.isArray(caseIds) || caseIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide case IDs to review'
            });
        }

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either Approved or Rejected'
            });
        }

        const result = await ClinicalCase.updateMany(
            { _id: { $in: caseIds }, 'supervisorApproval.status': 'Pending' },
            {
                'supervisorApproval.status': status,
                'supervisorApproval.reviewedAt': new Date(),
                'supervisorApproval.comments': remarks || '',
                supervisor: req.user._id
            }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} cases ${status.toLowerCase()} successfully`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Bulk review cases error:', error);
        res.status(500).json({
            success: false,
            message: 'Error reviewing cases',
            error: error.message
        });
    }
};

// @desc    Get batch and semester options
// @route   GET /api/professor/filters
// @access  Private (Supervisor, Admin)
exports.getFilterOptions = async (req, res) => {
    try {
        const batches = await User.distinct('batch', { role: 'Student', isActive: true });
        const semesters = await User.distinct('semester', { role: 'Student', isActive: true });

        res.status(200).json({
            success: true,
            data: {
                batches: batches.filter(b => b).sort().reverse(),
                semesters: semesters.filter(s => s).sort((a, b) => a - b)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching filter options',
            error: error.message
        });
    }
};

// @desc    Get student progress chart data
// @route   GET /api/professor/analytics/progress
// @access  Private (Supervisor, Admin)
exports.getProgressAnalytics = async (req, res) => {
    try {
        const { batch, semester } = req.query;
        let matchQuery = { role: 'Student', isActive: true };

        if (batch) matchQuery.batch = batch;
        if (semester) matchQuery.semester = parseInt(semester);

        // Progress distribution (0-25%, 25-50%, 50-75%, 75-100%)
        const progressDistribution = await User.aggregate([
            { $match: { ...matchQuery, totalAllottedHours: { $gt: 0 } } },
            {
                $project: {
                    progressPercentage: {
                        $multiply: [
                            { $divide: ['$completedHours', '$totalAllottedHours'] },
                            100
                        ]
                    }
                }
            },
            {
                $bucket: {
                    groupBy: '$progressPercentage',
                    boundaries: [0, 25, 50, 75, 100, Infinity],
                    default: 'Other',
                    output: { count: { $sum: 1 } }
                }
            }
        ]);

        // Monthly case submissions
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const studentIds = await User.find(matchQuery).distinct('_id');

        const monthlyCases = await ClinicalCase.aggregate([
            {
                $match: {
                    student: { $in: studentIds },
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                progressDistribution,
                monthlyCases
            }
        });
    } catch (error) {
        console.error('Get progress analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics',
            error: error.message
        });
    }
};
