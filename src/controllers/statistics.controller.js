const ClinicalCase = require('../models/ClinicalCase.model');
const Attendance = require('../models/Attendance.model');
const mongoose = require('mongoose');

// @desc    Get weekly statistics report
// @route   GET /api/statistics/weekly
// @access  Private
exports.getWeeklyStatistics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Default to current week if dates not provided
        const now = new Date();
        const weekStart = startDate ? new Date(startDate) : new Date(now.setDate(now.getDate() - now.getDay()));
        const weekEnd = endDate ? new Date(endDate) : new Date(new Date(weekStart).setDate(weekStart.getDate() + 6));

        weekStart.setHours(0, 0, 0, 0);
        weekEnd.setHours(23, 59, 59, 999);

        // Build match query
        const matchQuery = {
            sessionDate: { $gte: weekStart, $lte: weekEnd }
        };

        // Students can only see their own stats
        if (req.user.role === 'Student') {
            matchQuery.student = new mongoose.Types.ObjectId(req.user.id);
        } else if (req.query.studentId) {
            matchQuery.student = new mongoose.Types.ObjectId(req.query.studentId);
        }

        // Aggregate by Age Group
        const ageGroupStats = await ClinicalCase.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$patientInfo.ageGroup',
                    totalCases: { $sum: 1 },
                    approvedCases: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Approved'] }, 1, 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Aggregate by Test Type
        const testTypeStats = await ClinicalCase.aggregate([
            { $match: matchQuery },
            { $unwind: '$testsPerformed' },
            {
                $group: {
                    _id: '$testsPerformed.testType',
                    totalCount: { $sum: 1 },
                    completedCount: {
                        $sum: { $cond: ['$testsPerformed.completed', 1, 0] }
                    },
                    totalDuration: { $sum: { $ifNull: ['$testsPerformed.duration', 0] } }
                }
            },
            { $sort: { totalCount: -1 } }
        ]);

        // Daily case distribution
        const dailyStats = await ClinicalCase.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$sessionDate' } },
                    caseCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Overall summary
        const overallSummary = await ClinicalCase.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalCases: { $sum: 1 },
                    totalPatients: { $addToSet: '$patientInfo.initials' },
                    approvedCases: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Approved'] }, 1, 0] }
                    },
                    pendingCases: {
                        $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Pending'] }, 1, 0] }
                    },
                    avgSessionDuration: { $avg: '$sessionDuration' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalCases: 1,
                    uniquePatients: { $size: '$totalPatients' },
                    approvedCases: 1,
                    pendingCases: 1,
                    avgSessionDuration: { $round: ['$avgSessionDuration', 1] }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                period: {
                    startDate: weekStart,
                    endDate: weekEnd
                },
                summary: overallSummary[0] || {
                    totalCases: 0,
                    uniquePatients: 0,
                    approvedCases: 0,
                    pendingCases: 0,
                    avgSessionDuration: 0
                },
                byAgeGroup: ageGroupStats,
                byTestType: testTypeStats,
                dailyDistribution: dailyStats
            }
        });
    } catch (error) {
        console.error('Weekly statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating weekly statistics',
            error: error.message
        });
    }
};

// @desc    Get student dashboard statistics
// @route   GET /api/statistics/dashboard
// @access  Private
exports.getDashboardStats = async (req, res) => {
    try {
        const studentId = req.user.role === 'Student' ? req.user.id : req.query.studentId;

        if (!studentId && req.user.role !== 'Admin') {
            return res.status(400).json({
                success: false,
                message: 'Student ID is required'
            });
        }

        // Get current month dates
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Get current week dates
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        let stats = {};

        if (studentId) {
            const studentObjectId = new mongoose.Types.ObjectId(studentId);

            // Clinical case stats
            const caseStats = await ClinicalCase.aggregate([
                { $match: { student: studentObjectId } },
                {
                    $facet: {
                        total: [{ $count: 'count' }],
                        thisMonth: [
                            { $match: { sessionDate: { $gte: monthStart, $lte: monthEnd } } },
                            { $count: 'count' }
                        ],
                        thisWeek: [
                            { $match: { sessionDate: { $gte: weekStart, $lte: weekEnd } } },
                            { $count: 'count' }
                        ],
                        pending: [
                            { $match: { 'supervisorApproval.status': 'Pending' } },
                            { $count: 'count' }
                        ]
                    }
                }
            ]);

            // Test type distribution for the student
            const testDistribution = await ClinicalCase.aggregate([
                { $match: { student: studentObjectId } },
                { $unwind: '$testsPerformed' },
                {
                    $group: {
                        _id: '$testsPerformed.testType',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 6 }
            ]);

            // Attendance stats
            const attendanceStats = await Attendance.getMonthlySummary(
                studentId,
                now.getFullYear(),
                now.getMonth() + 1
            );

            stats = {
                clinicalCases: {
                    total: caseStats[0]?.total[0]?.count || 0,
                    thisMonth: caseStats[0]?.thisMonth[0]?.count || 0,
                    thisWeek: caseStats[0]?.thisWeek[0]?.count || 0,
                    pending: caseStats[0]?.pending[0]?.count || 0
                },
                testDistribution,
                attendance: {
                    daysThisMonth: attendanceStats.totalDays,
                    hoursThisMonth: Math.round(attendanceStats.totalHours * 100) / 100
                }
            };
        }

        // Admin/Supervisor global stats
        if (['Admin', 'Supervisor'].includes(req.user.role)) {
            const globalStats = await ClinicalCase.aggregate([
                {
                    $facet: {
                        pendingReviews: [
                            { $match: { 'supervisorApproval.status': 'Pending' } },
                            { $count: 'count' }
                        ],
                        todayCases: [
                            {
                                $match: {
                                    sessionDate: {
                                        $gte: new Date(now.setHours(0, 0, 0, 0)),
                                        $lte: new Date(now.setHours(23, 59, 59, 999))
                                    }
                                }
                            },
                            { $count: 'count' }
                        ]
                    }
                }
            ]);

            stats.globalStats = {
                pendingReviews: globalStats[0]?.pendingReviews[0]?.count || 0,
                todayCases: globalStats[0]?.todayCases[0]?.count || 0
            };
        }

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating dashboard statistics',
            error: error.message
        });
    }
};

// @desc    Get monthly report
// @route   GET /api/statistics/monthly
// @access  Private
exports.getMonthlyReport = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const month = parseInt(req.query.month) || new Date().getMonth() + 1;

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const matchQuery = {
            sessionDate: { $gte: startDate, $lte: endDate }
        };

        if (req.user.role === 'Student') {
            matchQuery.student = new mongoose.Types.ObjectId(req.user.id);
        } else if (req.query.studentId) {
            matchQuery.student = new mongoose.Types.ObjectId(req.query.studentId);
        }

        // Comprehensive monthly statistics
        const monthlyStats = await ClinicalCase.aggregate([
            { $match: matchQuery },
            {
                $facet: {
                    byAgeGroup: [
                        {
                            $group: {
                                _id: '$patientInfo.ageGroup',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ],
                    byTestType: [
                        { $unwind: '$testsPerformed' },
                        {
                            $group: {
                                _id: '$testsPerformed.testType',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    byWeek: [
                        {
                            $group: {
                                _id: { $week: '$sessionDate' },
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ],
                    summary: [
                        {
                            $group: {
                                _id: null,
                                totalCases: { $sum: 1 },
                                approvedCases: {
                                    $sum: { $cond: [{ $eq: ['$supervisorApproval.status', 'Approved'] }, 1, 0] }
                                },
                                totalSessionHours: { $sum: { $divide: ['$sessionDuration', 60] } }
                            }
                        }
                    ]
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                period: { year, month, startDate, endDate },
                byAgeGroup: monthlyStats[0]?.byAgeGroup || [],
                byTestType: monthlyStats[0]?.byTestType || [],
                byWeek: monthlyStats[0]?.byWeek || [],
                summary: monthlyStats[0]?.summary[0] || {
                    totalCases: 0,
                    approvedCases: 0,
                    totalSessionHours: 0
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error generating monthly report',
            error: error.message
        });
    }
};
